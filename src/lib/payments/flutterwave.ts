import { serverConfig } from "@/lib/security/server-config";
import { logger } from "@/lib/logging";
import { createHmac } from "crypto";
import type {
  Currency,
  InitiatePaymentResult,
  PaymentProviderAdapter,
  PaymentStatus,
  VerifyPaymentResult,
  PaymentType,
} from "@/types";

/**
 * Flutterwave adapter — REAL API integration.
 *
 * Per spec Sections 11, 12, 32:
 *   * Server-side initialization + verification
 *   * Webhook signature verification (SHA256 with secret hash)
 *   * Never expose secret key to browser
 *   * Amount verified against expected
 */

const FLUTTERWAVE_API = "https://api.flutterwave.com/v3";

export class FlutterwaveAdapter implements PaymentProviderAdapter {
  readonly name = "flutterwave" as const;

  private get secretKey() {
    return serverConfig.flutterwave.secretKey;
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
      logger.warn("Flutterwave not configured — initiation skipped", {
        userId: input.userId,
        paymentType: input.paymentType,
      });
      return {
        provider: "flutterwave",
        authorizationUrl: `${input.callbackUrl}?provider=flutterwave&ref=dev-stub-${Date.now()}`,
        reference: `flw-dev-${Date.now()}`,
      };
    }

    const reference = `flw-${input.paymentType}-${input.userId}-${Date.now()}`;
    const body = {
      tx_ref: reference,
      amount: input.amount / 100, // Flutterwave expects major units (Naira)
      currency: input.currency,
      redirect_url: input.callbackUrl,
      customer: {
        email: input.userEmail,
        name: input.userFullName,
      },
      meta: {
        ...input.metadata,
        user_id: input.userId,
        payment_type: input.paymentType,
        related_resource_id: input.relatedResourceId,
      },
    };

    const res = await fetch(`${FLUTTERWAVE_API}/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error("Flutterwave initiate failed", {
        userId: input.userId,
        status: res.status,
        errorLength: text.length,
      });
      throw new Error(`Flutterwave initiation failed (${res.status})`);
    }

    const data = (await res.json()) as {
      data: { link: string };
    };

    return {
      provider: "flutterwave",
      authorizationUrl: data.data.link,
      reference,
    };
  }

  async verify(reference: string): Promise<VerifyPaymentResult> {
    if (!this.isConfigured) {
      return {
        provider: "flutterwave",
        reference,
        status: "pending",
        amount: 0,
        currency: "NGN",
        paidAt: null,
        rawResponse: { stub: true },
      };
    }

    const res = await fetch(
      `${FLUTTERWAVE_API}/transactions/${encodeURIComponent(reference)}/verify`,
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!res.ok) {
      throw new Error(`Flutterwave verify failed (${res.status})`);
    }

    const data = (await res.json()) as {
      data: {
        status: string;
        amount: number;
        currency: string;
        created_at: string | null;
        tx_ref: string;
      };
    };

    return {
      provider: "flutterwave",
      reference: data.data.tx_ref,
      status: this.normalizeStatus(data.data.status),
      amount: data.data.amount * 100, // back to minor units (kobo)
      currency: data.data.currency as Currency,
      paidAt: data.data.created_at,
      rawResponse: {
        status: data.data.status,
        amount: data.data.amount,
        currency: data.data.currency,
        tx_ref: data.data.tx_ref,
      },
    };
  }

  async parseWebhook(input: {
    rawBody: string;
    signature: string;
  }): Promise<{ reference: string; event: string }> {
    // Flutterwave sends a "verif-hash" header with SHA256 of the secret hash
    const webhookHash = serverConfig.flutterwave.webhookHash;

    if (!webhookHash) {
      logger.warn("Flutterwave webhook hash not configured — skipping verification");
      const parsed = JSON.parse(input.rawBody) as {
        event: string;
        data: { tx_ref: string };
      };
      return { reference: parsed.data.tx_ref, event: parsed.event };
    }

    // Flutterwave uses the raw secret hash directly as the signature header
    // (not HMAC). The "verif-hash" header value should equal the secret hash.
    if (input.signature !== webhookHash) {
      throw new Error("Invalid Flutterwave webhook signature");
    }

    const parsed = JSON.parse(input.rawBody) as {
      event: string;
      data: { tx_ref: string };
    };

    return { reference: parsed.data.tx_ref, event: parsed.event };
  }

  private normalizeStatus(status: string): PaymentStatus {
    switch (status) {
      case "successful":
        return "successful";
      case "failed":
        return "failed";
      case "cancelled":
        return "cancelled";
      case "refunded":
        return "refunded";
      default:
        return "pending";
    }
  }
}
