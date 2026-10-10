import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase";
import { getPaymentProvider } from "@/lib/payments";
import { verifyAndActivate } from "@/lib/payments/payment-service";
import { logger } from "@/lib/logging";

/**
 * Flutterwave webhook endpoint.
 *
 * Per spec Sections 11, 16, 17, 32:
 *   1. Receive provider event
 *   2. Verify signature (verif-hash header equals secret hash)
 *   3. Parse the event
 *   4. Identify the payment by tx_ref
 *   5. Verify with provider (server-to-server)
 *   6. Process idempotently
 *   7. Update payment status
 *   8. Activate subscription only after verified
 *   9. Record audit + payment_event
 *   10. Return 200
 */

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("verif-hash") ?? "";

  if (!rawBody) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  // Parse + verify signature via the adapter
  const adapter = getPaymentProvider("flutterwave");
  let reference: string;
  let event: string;

  try {
    const result = await adapter.parseWebhook({ rawBody, signature });
    reference = result.reference;
    event = result.event;
  } catch (err) {
    logger.warn("Flutterwave webhook signature verification failed", {
      error: String(err),
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  logger.info("Flutterwave webhook received", { reference, event });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  // Idempotency check (spec Section 17)
  const eventId = `flutterwave-${reference}-${event}`;
  const { data: existingEvent } = await admin
    .from("payment_events")
    .select("id")
    .eq("provider", "flutterwave")
    .eq("provider_event_id", eventId)
    .maybeSingle();

  if (existingEvent) {
    logger.info("Flutterwave webhook duplicate — already processed", { reference, event });
    return NextResponse.json({ status: "duplicate" });
  }

  // Record the webhook event
  const { error: eventError } = await admin.from("payment_events").insert({
    payment_id: null,
    provider: "flutterwave",
    provider_event: event,
    provider_event_id: eventId,
    raw_payload: { reference, event } as Record<string, unknown>,
    received_at: new Date().toISOString(),
  });

  if (eventError) {
    if (eventError.code === "23505") {
      logger.info("Flutterwave webhook duplicate (race)", { reference, event });
      return NextResponse.json({ status: "duplicate" });
    }
    logger.error("Failed to record webhook event", { error: eventError.message });
  }

  // Process success events
  if (event.includes("successful") || event.includes("completed")) {
    try {
      const result = await verifyAndActivate(reference, "flutterwave");

      if (result.ok) {
        await admin
          .from("payment_events")
          .update({ processed_at: new Date().toISOString() })
          .eq("provider", "flutterwave")
          .eq("provider_event_id", eventId);
      }

      logger.info("Flutterwave webhook processed", {
        reference,
        ok: result.ok,
        alreadyProcessed: result.alreadyProcessed,
      });
    } catch (err) {
      logger.error("Flutterwave webhook processing failed", {
        reference,
        error: String(err),
      });
    }
  }

  return NextResponse.json({ status: "success" });
}
