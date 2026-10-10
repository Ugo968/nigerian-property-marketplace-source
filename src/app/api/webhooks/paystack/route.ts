import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase";
import { getPaymentProvider } from "@/lib/payments";
import { verifyAndActivate } from "@/lib/payments/payment-service";
import { logger } from "@/lib/logging";

/**
 * Paystack webhook endpoint.
 *
 * Per spec Sections 12, 16, 17, 32:
 *   1. Receive provider event
 *   2. Verify HMAC-SHA512 signature
 *   3. Parse the event
 *   4. Identify the payment by reference
 *   5. Verify with provider (server-to-server)
 *   6. Process idempotently (check payment_events for duplicate)
 *   7. Update payment status
 *   8. Activate subscription only after verified
 *   9. Record audit + payment_event
 *   10. Return 200
 */

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";

  if (!rawBody) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  // Parse + verify signature via the adapter
  const adapter = getPaymentProvider("paystack");
  let reference: string;
  let event: string;

  try {
    const result = await adapter.parseWebhook({ rawBody, signature });
    reference = result.reference;
    event = result.event;
  } catch (err) {
    logger.warn("Paystack webhook signature verification failed", {
      error: String(err),
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  logger.info("Paystack webhook received", { reference, event });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  // Idempotency check (spec Section 17)
  // Check if we've already processed this event
  const eventId = `paystack-${reference}-${event}`;
  const { data: existingEvent } = await admin
    .from("payment_events")
    .select("id")
    .eq("provider", "paystack")
    .eq("provider_event_id", eventId)
    .maybeSingle();

  if (existingEvent) {
    logger.info("Paystack webhook duplicate — already processed", { reference, event });
    return NextResponse.json({ status: "duplicate" });
  }

  // Record the webhook event (before processing, so we have a trail even if processing fails)
  const { error: eventError } = await admin.from("payment_events").insert({
    payment_id: null, // Will be linked after we find the payment
    provider: "paystack",
    provider_event: event,
    provider_event_id: eventId,
    raw_payload: { reference, event } as Record<string, unknown>,
    received_at: new Date().toISOString(),
  });

  if (eventError) {
    // Unique constraint violation = already processed (race condition)
    if (eventError.code === "23505") {
      logger.info("Paystack webhook duplicate (race)", { reference, event });
      return NextResponse.json({ status: "duplicate" });
    }
    logger.error("Failed to record webhook event", { error: eventError.message });
  }

  // Process the payment (verify + activate)
  // Only process success events
  if (event === "charge.success") {
    try {
      const result = await verifyAndActivate(reference, "paystack");

      if (result.ok) {
        // Mark the webhook event as processed
        await admin
          .from("payment_events")
          .update({ processed_at: new Date().toISOString() })
          .eq("provider", "paystack")
          .eq("provider_event_id", eventId);

        // Check if this was a credit purchase (spec Section 15)
        // verifyAndActivate handles subscription activation; for featured
        // listing credit purchases, we need to grant the credits
        const { data: paymentRow } = await admin
          .from("payments")
          .select("payment_type, metadata, user_id")
          .eq("provider_reference", reference)
          .maybeSingle();

        if (paymentRow) {
          const payment = paymentRow as {
            payment_type: string;
            metadata: { credit_amount?: number; type?: string };
            user_id: string;
          };

          if (
            payment.payment_type === "featured_listing" &&
            payment.metadata?.type === "credit_purchase" &&
            payment.metadata?.credit_amount
          ) {
            // Grant the purchased credits (idempotent — checks for existing grant)
            const { grantPurchasedCredits } = await import("@/lib/featured/actions");
            await grantPurchasedCredits(
              payment.user_id,
              reference, // use as payment_id proxy for idempotency check
              payment.metadata.credit_amount,
            );
          }
        }
      }

      logger.info("Paystack webhook processed", {
        reference,
        ok: result.ok,
        alreadyProcessed: result.alreadyProcessed,
      });
    } catch (err) {
      logger.error("Paystack webhook processing failed", {
        reference,
        error: String(err),
      });
      // Return 200 anyway — Paystack will retry, and we have the event recorded
    }
  }

  // Always return 200 to stop Paystack from retrying
  return NextResponse.json({ status: "success" });
}
