/**
 * Email provider abstraction (spec Section 9).
 *
 * The application talks to the EmailProvider interface ONLY. Concrete
 * providers (Resend / SendGrid / Postmark / SMTP) are plugged in via
 * env var. Switching providers is a one-file change.
 *
 * Provider selection: `EMAIL_PROVIDER` env var. Defaults to "stub" in
 * dev (no real sends), "resend" in production when EMAIL_PROVIDER_API_KEY
 * is set. The stub logs to stdout in dev so the call sites can be
 * exercised without a real provider.
 *
 * CRITICAL: This module is server-only. NEVER import from a client
 * component. It reads EMAIL_PROVIDER_API_KEY which is not NEXT_PUBLIC_*.
 *
 * Retry / error classification happens at the email-service layer
 * (./email-service.ts). The provider is the thin HTTP boundary.
 */

import { serverConfig } from "@/lib/security/server-config";
import { logger } from "@/lib/logging";
import type { EmailErrorCategory } from "@/types";
import type { EmailTemplateSlug } from "./types";

// ---------------------------------------------------------------------------
// Email message — the contract between caller and provider.
// ---------------------------------------------------------------------------
export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  /** Plain text body (always required — HTML is the enhancement). */
  text: string;
  /** Optional HTML body. Falls back to text if absent. */
  html?: string;
  /** Optional reply-to address. */
  replyTo?: string;
  /** Optional provider-specific tags for analytics / filtering. */
  tags?: string[];
  /**
   * Optional template id + variables — providers that support server-
   * side templates (Resend React, SendGrid Dynamic) can use this. Our
   * default rendering path produces HTML directly.
   */
  template?: {
    slug: EmailTemplateSlug;
    variables: Record<string, unknown>;
  };
  /**
   * Stable idempotency key. When the provider supports it (Resend, SendGrid
   * do), we send this so the provider deduplicates retries on their side
   * too. NEVER include user secrets.
   */
  idempotencyKey?: string;
}

export interface EmailSendResult {
  /** Provider's message id (nullable when stub / unconfigured). */
  messageId: string | null;
  /** Status from the provider. */
  status: "sent" | "failed";
  /** When status='failed', classification of the error. */
  errorCategory?: EmailErrorCategory;
  /** Raw provider error message (sanitised — no secrets). */
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Provider interface.
// ---------------------------------------------------------------------------
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

// ---------------------------------------------------------------------------
// Stub provider — used in dev when no credentials are configured.
// Logs to stdout so call sites can exercise the flow without sending.
// ---------------------------------------------------------------------------
class StubEmailProvider implements EmailProvider {
  readonly name = "stub";

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (process.env.NODE_ENV !== "production") {
      logger.info("[stub-email] send", {
        to: message.to,
        subject: message.subject,
        template: message.template?.slug ?? null,
      });
    }
    return { messageId: `stub-${Date.now()}`, status: "sent" };
  }
}

// ---------------------------------------------------------------------------
// Resend provider (https://resend.com).
//
// Resend's API: POST https://api.resend.com/emails with Authorization: Bearer.
// On success returns { id: "..." }. On failure returns { statusCode, message }.
//
// We classify errors into retryable vs permanent at the email-service layer;
// the provider just reports the raw result.
// ---------------------------------------------------------------------------
class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const body: Record<string, unknown> = {
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      };
      if (message.html) body.html = message.html;
      if (message.replyTo) body.reply_to = message.replyTo;
      if (message.tags && message.tags.length > 0) {
        body.tags = message.tags.map((t) => ({ name: t, value: "true" }));
      }
      if (message.idempotencyKey) {
        // Resend supports idempotency via the `Idempotency-Key` header.
        // We use it on the fetch call below.
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      };
      if (message.idempotencyKey) {
        headers["Idempotency-Key"] = message.idempotencyKey;
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      // 200 / 201 = success
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          id?: string;
        };
        return { messageId: data.id ?? null, status: "sent" };
      }

      // Error path — classify
      const errorPayload = (await res.json().catch(() => ({}))) as {
        message?: string;
        name?: string;
        statusCode?: number;
      };
      const errorMessage =
        errorPayload.message ?? errorPayload.name ?? `HTTP ${res.status}`;
      const errorCategory = classifyProviderError(res.status, errorMessage);

      return {
        messageId: null,
        status: "failed",
        errorCategory,
        errorMessage,
      };
    } catch (err) {
      // Network / timeout / DNS — retryable.
      return {
        messageId: null,
        status: "failed",
        errorCategory: "network",
        errorMessage: err instanceof Error ? err.message : "network error",
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Error classification — shared by all providers.
// ---------------------------------------------------------------------------
function classifyProviderError(
  status: number,
  message: string,
): EmailErrorCategory {
  const lower = message.toLowerCase();
  if (status === 422 || lower.includes("invalid email") || lower.includes("invalid_email")) {
    return "invalid_email";
  }
  if (lower.includes("suppress") || lower.includes("bounce") || lower.includes("complaint")) {
    return "suppressed_address";
  }
  if (status === 429 || lower.includes("rate limit")) {
    return "rate_limited";
  }
  if (status >= 500) {
    return "provider_error";
  }
  if (status === 408 || lower.includes("timeout")) {
    return "timeout";
  }
  if (lower.includes("network") || lower.includes("econnreset") || lower.includes("etimedout")) {
    return "network";
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Singleton selection. Reads env vars at module load.
// ---------------------------------------------------------------------------
function selectProvider(): EmailProvider {
  const apiKey = serverConfig.email.apiKey;
  const fromAddress = serverConfig.email.fromAddress;

  if (!apiKey || !fromAddress || fromAddress.includes("example")) {
    // No credentials / placeholder — fall back to stub so dev boots.
    return new StubEmailProvider();
  }

  // Default provider is Resend. To add SendGrid / Postmark, branch here
  // based on EMAIL_PROVIDER_NAME.
  return new ResendEmailProvider(apiKey);
}

let cachedProvider: EmailProvider | null = null;

/**
 * Returns the configured EmailProvider singleton.
 */
export function getEmailProvider(): EmailProvider {
  if (cachedProvider) return cachedProvider;
  cachedProvider = selectProvider();
  return cachedProvider;
}

/**
 * Test-only escape hatch to inject a stub provider.
 */
export function _setEmailProviderForTests(p: EmailProvider | null): void {
  cachedProvider = p;
}

/**
 * Standard from address — used by the email service so callers don't
 * hardcode the address.
 */
export function getFromAddress(): string {
  const name = serverConfig.email.fromName;
  const addr = serverConfig.email.fromAddress;
  if (!name || !addr || addr.includes("example")) {
    return "Shelty <no-reply@naijahaus.example>";
  }
  return `${name} <${addr}>`;
}
