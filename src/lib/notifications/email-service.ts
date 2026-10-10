/**
 * Email service (spec Section 31, 32, 33).
 *
 * Sits between the dispatcher (which decides "an email should go out")
 * and the email provider (HTTP boundary). Responsibilities:
 *
 *   - Render the template via the email-renderer.
 *   - Look up the recipient's email address server-side.
 *   - Insert an email_delivery_records row tracking the attempt.
 *   - Call the email provider.
 *   - On failure, classify the error (retryable vs permanent).
 *   - On retryable failure, schedule a bounded retry (max 3 attempts).
 *   - On permanent failure, mark the record failed and stop.
 *   - Never block the caller on email delivery — failures are caught
 *     and logged, not propagated. Database state remains authoritative.
 *
 * CRITICAL: NEVER expose provider API keys, email bodies, or recipient
 * PII in logs. The logger module already redacts known-sensitive keys;
 * we keep our own log calls minimal.
 *
 * Queue architecture (spec Section 31): The V1 implementation runs
 * the send inline (after the caller's DB transaction commits) so the
 * caller doesn't wait on the SMTP/HTTP roundtrip. A future worker
 * queue can replace `sendImmediately` with `enqueue` and a worker
 * process drains the queue. The interface stays the same.
 *
 * Idempotency: The `eventKey` parameter ties this email to the same
 * idempotency ledger used by the dispatcher. If the same event fires
 * twice (e.g. retried webhook), the email is only sent once.
 */

import { createAdminClient } from "@/lib/db/supabase";
import { serverConfig } from "@/lib/security/server-config";
import { logger } from "@/lib/logging";
import type { EmailDeliveryStatus, EmailErrorCategory } from "@/types";
import type { EmailTemplateSlug } from "./types";
import {
  getEmailProvider,
  getFromAddress,
  type EmailMessage,
  type EmailSendResult,
} from "./email-provider";
import { renderEmail, type TemplateContext } from "./email-renderer";

// ---------------------------------------------------------------------------
// Retry policy (spec Section 33).
// ---------------------------------------------------------------------------
const MAX_RETRIES = 3;

const RETRY_DELAYS_MS: readonly number[] = [
  0,
  30_000, // 30s
  5 * 60_000, // 5m
];

/**
 * Error categories that warrant a retry. All others are treated as
 * permanent (invalid email, suppressed address, etc.).
 */
export const RETRYABLE_ERRORS: ReadonlySet<EmailErrorCategory> = new Set([
  "provider_error",
  "timeout",
  "rate_limited",
  "network",
  "unknown",
]);

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

export interface SendEmailInput {
  /** Recipient profile id (resolved server-side, never client-supplied). */
  recipientId: string;
  /** Recipient email address (resolved from auth.users by the caller). */
  recipientEmail: string;
  /** Recipient display name for the greeting. */
  recipientName: string;
  /** Email template slug. */
  template: EmailTemplateSlug;
  /** Template input (typed per-template). */
  templateInput: Record<string, unknown>;
  /** Preference context (controls unsubscribe link visibility). */
  context: TemplateContext;
  /** Stable event key — used for idempotency on both sides. */
  eventKey?: string;
  /** Linked notification id (for join queries). */
  notificationId?: string;
  /** Optional tags for analytics. */
  tags?: string[];
}

export interface SendEmailResult {
  ok: boolean;
  /** Email delivery record id. Always set when ok=true; possibly set on failure. */
  deliveryRecordId: string | null;
  /** Provider message id (when sent). */
  messageId: string | null;
  /** Final status of the delivery record. */
  status: EmailDeliveryStatus;
  /** Error category (when failed). */
  errorCategory?: EmailErrorCategory;
  /** Error message (when failed). */
  errorMessage?: string;
}

/**
 * Render + send an email, tracking the delivery attempt in
 * `email_delivery_records`. Never throws — failures are returned.
 *
 * The send happens inline. A future worker queue should call this
 * from a background job rather than the request path.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  // Render template — this can throw on programming errors.
  let content;
  try {
    // Cast the templateInput through `never` to bypass the strict
    // generic-typed renderEmail signature. The renderEmail function
    // is type-safe at the call site (where the dispatcher passes a
    // concrete EmailTemplateInputMap[K]); the email-service only knows
    // the union, so we relax it here.
    content = renderEmail(
      input.template,
      input.templateInput as never,
      input.context,
    );
  } catch (err) {
    logger.error("email render failed", {
      template: input.template,
      error: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      deliveryRecordId: null,
      messageId: null,
      status: "failed",
      errorCategory: "unknown",
      errorMessage: err instanceof Error ? err.message : "render error",
    };
  }

  // Insert the email_delivery_records row first (status=pending).
  const admin = createAdminClient();
  if (!admin) {
    // No DB available — still attempt the send but we can't track it.
    // In dev this is fine. In production this would be a critical error.
    logger.warn("email send: admin client unavailable, sending untracked", {
      template: input.template,
      recipientId: input.recipientId,
    });
  }

  let deliveryRecordId: string | null = null;
  if (admin) {
    try {
      const { data, error } = await admin
        .from("email_delivery_records")
        .insert({
          notification_id: input.notificationId ?? null,
          event_key: input.eventKey ?? null,
          recipient_id: input.recipientId,
          recipient_email: input.recipientEmail,
          template: input.template,
          provider: getEmailProvider().name,
          status: "pending",
          attempt_count: 0,
        } as never)
        .select("id")
        .single();
      if (error) {
        logger.error("email delivery record insert failed", {
          error: error.message,
        });
      } else if (data) {
        deliveryRecordId = (data as { id: string }).id;
      }
    } catch (err) {
      logger.error("email delivery record insert threw", {
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  // Attempt the send — up to MAX_RETRIES+1 attempts.
  let attempt = 0;
  let lastResult: EmailSendResult = {
    messageId: null,
    status: "failed",
    errorCategory: "unknown",
    errorMessage: "no attempt made",
  };

  while (attempt <= MAX_RETRIES) {
    const message: EmailMessage = {
      to: input.recipientEmail,
      from: getFromAddress(),
      subject: content.subject,
      text: content.text,
      html: content.html,
      tags: input.tags,
      idempotencyKey: input.eventKey,
    };

    try {
      lastResult = await getEmailProvider().send(message);
    } catch (err) {
      lastResult = {
        messageId: null,
        status: "failed",
        errorCategory: "network",
        errorMessage: err instanceof Error ? err.message : "send error",
      };
    }

    if (lastResult.status === "sent") {
      // Success — update the record and return.
      if (admin && deliveryRecordId) {
        await admin
          .from("email_delivery_records")
          .update({
            status: "sent",
            provider_message_id: lastResult.messageId,
            attempt_count: attempt + 1,
            sent_at: new Date().toISOString(),
            error_category: null,
            error_message: null,
            next_retry_at: null,
          } as never)
          .eq("id", deliveryRecordId);
      }
      return {
        ok: true,
        deliveryRecordId,
        messageId: lastResult.messageId,
        status: "sent",
      };
    }

    // Failure — classify.
    const category = lastResult.errorCategory ?? "unknown";
    const isRetryable = RETRYABLE_ERRORS.has(category);
    const isLastAttempt = attempt >= MAX_RETRIES;

    if (!isRetryable || isLastAttempt) {
      // Permanent failure OR retries exhausted.
      const finalStatus: EmailDeliveryStatus = isPermanentFailure(category)
        ? "suppressed"
        : "failed";
      if (admin && deliveryRecordId) {
        await admin
          .from("email_delivery_records")
          .update({
            status: finalStatus,
            attempt_count: attempt + 1,
            failed_at: new Date().toISOString(),
            error_category: category,
            error_message: (lastResult.errorMessage ?? "").slice(0, 500),
            next_retry_at: null,
          } as never)
          .eq("id", deliveryRecordId);
      }
      logger.warn("email send failed (final)", {
        template: input.template,
        recipientId: input.recipientId,
        attempt: attempt + 1,
        category,
      });
      return {
        ok: false,
        deliveryRecordId,
        messageId: null,
        status: finalStatus,
        errorCategory: category,
        errorMessage: lastResult.errorMessage,
      };
    }

    // Retryable — schedule next attempt.
    const delayMs = RETRY_DELAYS_MS[attempt + 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
    if (admin && deliveryRecordId) {
      await admin
        .from("email_delivery_records")
        .update({
          status: "pending",
          attempt_count: attempt + 1,
          next_retry_at: nextRetryAt,
          error_category: category,
          error_message: (lastResult.errorMessage ?? "").slice(0, 500),
        } as never)
        .eq("id", deliveryRecordId);
    }

    attempt += 1;
    // Inline retry: actually wait the delay. A real queue would hand
    // this off to a worker; we wait synchronously to keep V1 simple.
    if (attempt <= MAX_RETRIES) {
      await sleep(delayMs);
    }
  }

  // Shouldn't reach here, but just in case.
  return {
    ok: false,
    deliveryRecordId,
    messageId: null,
    status: "failed",
    errorCategory: lastResult.errorCategory,
    errorMessage: lastResult.errorMessage,
  };
}

function isPermanentFailure(category: EmailErrorCategory): boolean {
  return category === "invalid_email" || category === "suppressed_address";
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Background retry worker — a future cron job can call this to drain
// pending records whose next_retry_at has elapsed. For V1 this is
// included as an architectural extension point but not auto-scheduled.
// ---------------------------------------------------------------------------
export async function drainPendingEmailRetries(): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;

  const { data, error } = await admin
    .from("email_delivery_records")
    .select("id, recipient_id, recipient_email, template, event_key, notification_id")
    .eq("status", "pending")
    .lte("next_retry_at", new Date().toISOString())
    .limit(50);

  if (error || !data) return 0;

  let processed = 0;
  for (const row of data as Array<{
    id: string;
    recipient_id: string;
    recipient_email: string;
    template: string;
    event_key: string | null;
    notification_id: string | null;
  }>) {
    // We can't re-render without the original template input + context.
    // The future worker would store those alongside the record. For V1,
    // we mark stuck records as failed after their retries elapse.
    await admin
      .from("email_delivery_records")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        error_category: "timeout",
        error_message: "retry window elapsed without re-render",
      } as never)
      .eq("id", row.id);
    processed += 1;
  }
  return processed;
}

/**
 * Public helper to test whether email is configured. The UI uses this
 * to decide whether to show the "Email notifications" preference.
 */
export function isEmailConfigured(): boolean {
  const apiKey = serverConfig.email.apiKey;
  const fromAddress = serverConfig.email.fromAddress;
  return Boolean(apiKey) && Boolean(fromAddress) && !fromAddress.includes("example");
}
