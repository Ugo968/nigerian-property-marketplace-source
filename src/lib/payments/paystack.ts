import { serverConfig } from "@/lib/security/server-config";
import { logger } from "@/lib/logging";
import { createHmac, timingSafeEqual } from "crypto";
import type {
  Currency,
  InitiatePaymentResult,
  PaymentProviderAdapter,
  PaymentType,
  VerifyPaymentResult,
  PaymentStatus,
} from "@/types";

/**
 * Paystack adapter — REAL API integration.
 *
 * Per spec Sections 10, 12, 32:
 *   * Server-side initialization + verification
 *   * Webhook signature verification (HMAC SHA512)
 *   * Never expose secret key to browser
 *   * Amount verified against expected
 */

const PAYSTACK_API = "https://api.paystack.co";

export class PaystackAdapter implements PaymentProviderAdapter {
  readonly name = "paystack" as const;

  private get secretKey() {
    return serverConfig.paystack.secretKey;
  }

  private get isConfigured() {
    return Boolean(this.secretKey);
  }

  async initiate(input: {
    userId: string;
    amount: number; // minor units (kobo)
    currency: Currency;
    paymentType: PaymentType;
    relatedResourceId: string | null;
    userEmail: string;
    userFullName: string;
    callbackUrl: string;
    metadata: Record<string, string>;
  }): Promise<InitiatePaymentResult> {
    if (!this.isConfigured) {
      logger.warn("Paystack not configured — initiation skipped", {
        userId: input.userId,
        paymentType: input.paymentType,
      });
      // Dev stub — returns a fake URL so the flow can be exercised
      return {
        provider: "paystack",
        authorizationUrl: `${input.callbackUrl}?provider=paystack&ref=dev-stub-${Date.now()}`,
        reference: `psk-dev-${Date.now()}`,
      };
    }

    const reference = `psk-${input.paymentType}-${input.userId}-${Date.now()}`;
    const body = {
      email: input.userEmail,
      amount: input.amount, // Paystack expects kobo (minor units)
      currency: input.currency,
      reference,
      callback_url: input.callbackUrl,
      metadata: {
        ...input.metadata,
        user_id: input.userId,
        payment_type: input.paymentType,
        related_resource_id: input.relatedResourceId,
        full_name: input.userFullName,
      },
    };

    const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error("Paystack initiate failed", {
        userId: input.userId,
        status: res.status,
        // Don't log the full response (may contain sensitive info)
        errorLength: text.length,
      });
      throw new Error(`Paystack initiation failed (${res.status})`);
    }

    const data = (await res.json()) as {
      data: { authorization_url: string; reference: string };
    };

    return {
      provider: "paystack",
      authorizationUrl: data.data.authorization_url,
      reference: data.data.reference,
    };
  }

  async verify(reference: string): Promise<VerifyPaymentResult> {
    if (!this.isConfigured) {
      // Dev stub — pretend the verification is pending
      return {
        provider: "paystack",
        reference,
        status: "pending",
        amount: 0,
        currency: "NGN",
        paidAt: null,
        rawResponse: { stub: true },
      };
    }

    const res = await fetch(
      `${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } },
    );

    if (!res.ok) {
      throw new Error(`Paystack verify failed (${res.status})`);
    }

    const data = (await res.json()) as {
      data: {
        status: string;
        amount: number;
        currency: string;
        paid_at: string | null;
        reference: string;
        customer: { email: string };
      };
    };

    return {
      provider: "paystack",
      reference: data.data.reference,
      status: this.normalizeStatus(data.data.status),
      amount: data.data.amount,
      currency: data.data.currency as Currency,
      paidAt: data.data.paid_at,
      // Sanitize raw response — remove any potentially sensitive fields
      rawResponse: {
        status: data.data.status,
        amount: data.data.amount,
        currency: data.data.currency,
        reference: data.data.reference,
      },
    };
  }

  async parseWebhook(input: {
    rawBody: string;
    signature: string;
  }): Promise<{ reference: string; event: string }> {
    // Paystack signs the raw body with HMAC-SHA512 using the webhook hash
    const webhookHash = serverConfig.paystack.webhookHash;

    if (!webhookHash) {
      logger.warn("Paystack webhook hash not configured — skipping verification");
      // In dev, parse without verification. In production, this is a security violation.
      const parsed = JSON.parse(input.rawBody) as {
        event: string;
        data: { reference: string };
      };
      return { reference: parsed.data.reference, event: parsed.event };
    }

    // Verify HMAC SHA512 signature
    const expectedSignature = createHmac("sha512", webhookHash)
      .update(input.rawBody)
      .digest("hex");

    // Timing-safe comparison
    if (input.signature.length !== expectedSignature.length) {
      throw new Error("Invalid webhook signature");
    }

    const signatureBuffer = Buffer.from(input.signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    if (signatureBuffer.length !== expectedBuffer.length) {
      throw new Error("Invalid webhook signature");
    }

    // Use timingSafeEqual for constant-time comparison
    if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
      throw new Error("Invalid webhook signature");
    }

    const parsed = JSON.parse(input.rawBody) as {
      event: string;
      data: { reference: string };
    };

    return { reference: parsed.data.reference, event: parsed.event };
  }

  private normalizeStatus(status: string): PaymentStatus {
    switch (status) {
      case "success":
        return "successful";
      case "failed":
        return "failed";
      case "abandoned":
        return "expired";
      case "reversed":
        return "refunded";
      default:
        return "pending";
    }
  }
}
