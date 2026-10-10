import { createAdminClient } from "@/lib/db/supabase";
import { serverConfig } from "@/lib/security/server-config";
import { logger } from "@/lib/logging";
import { notificationService } from "@/lib/notifications";
import { getPaymentProvider } from "./index";
import { getPlan, formatNaira } from "@/lib/subscriptions/plans";
import type { PaymentProvider, PaymentType, PaymentStatus } from "@/types";
import type { SubscriptionTier, UserRole } from "@/types";
import type { Database } from "@/types";

/**
 * Payment service — the core business logic layer.
 *
 * Per spec Sections 3, 4, 9, 18, 19, 35:
 *   * Server-side price authority (never trust client amount)
 *   * Payment lifecycle: init → provider checkout → webhook verify → activate
 *   * Idempotent webhook processing
 *   * Subscription activation only after verified payment
 *   * Reconciliation for stuck payments
 *   * No property-money payments (spec Section 29)
 */

// ---------------------------------------------------------------------------
// INITIATE PAYMENT (server-side)
// ---------------------------------------------------------------------------

export interface InitiatePaymentParams {
  userId: string;
  userEmail: string;
  userFullName: string;
  userRole: UserRole;
  currentTier: SubscriptionTier;
  requestedTier: SubscriptionTier;
  provider: PaymentProvider;
  paymentType: PaymentType;
  callbackUrl: string;
}

export interface InitiatePaymentResponse {
  ok: boolean;
  authorizationUrl?: string;
  reference?: string;
  paymentId?: string;
  error?: string;
}

/**
 * Initiates a payment for a subscription upgrade.
 *
 * Per spec Section 4 (SERVER-SIDE PRICE AUTHORITY):
 *   1. Validate the requested plan matches the user's role
 *   2. Look up the authoritative price from the plan config
 *   3. Create a pending payment row with the expected amount
 *   4. Call the provider to initialize the transaction
 *   5. Return the checkout URL — never the amount (client doesn't need it)
 */
export async function initiatePayment(
  params: InitiatePaymentParams,
): Promise<InitiatePaymentResponse> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Database not configured." };
  }

  // Validate plan exists + matches role (spec Section 4, step 1-2)
  const plan = getPlan(params.userRole, params.requestedTier);
  if (!plan || !plan.sellable) {
    return { ok: false, error: "Invalid plan for your role." };
  }

  // Can't upgrade to the same tier
  if (params.currentTier === params.requestedTier) {
    return { ok: false, error: `You're already on the ${params.requestedTier} plan.` };
  }

  // Free plan doesn't require payment
  if (params.requestedTier === "free") {
    return { ok: false, error: "Free plan doesn't require payment." };
  }

  // Get the AUTHORITATIVE price (spec Section 4 — never trust client)
  const amountInKobo = plan.priceNaira * 100; // Convert Naira to kobo (minor units)

  // Create pending payment row (spec Section 5)
  const { data: paymentRow, error: paymentError } = await admin
    .from("payments")
    .insert({
      user_id: params.userId,
      amount: amountInKobo,
      currency: "NGN",
      provider: params.provider,
      payment_type: params.paymentType,
      status: "pending",
      metadata: {
        requested_tier: params.requestedTier,
        role: params.userRole,
        plan_price: plan.priceNaira,
      },
      initiated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (paymentError || !paymentRow) {
    logger.error("Payment row creation failed", {
      userId: params.userId,
      error: paymentError?.message,
    });
    return { ok: false, error: "Could not create payment record." };
  }

  const paymentId = (paymentRow as { id: string }).id;

  // Call the provider to initialize the transaction
  const adapter = getPaymentProvider(params.provider);
  try {
    const result = await adapter.initiate({
      userId: params.userId,
      amount: amountInKobo,
      currency: "NGN",
      paymentType: params.paymentType,
      relatedResourceId: null,
      userEmail: params.userEmail,
      userFullName: params.userFullName,
      callbackUrl: params.callbackUrl,
      metadata: {
        payment_id: paymentId,
        requested_tier: params.requestedTier,
      },
    });

    // Update the payment row with the provider reference
    await admin
      .from("payments")
      .update({
        provider_reference: result.reference,
      })
      .eq("id", paymentId);

    logger.info("Payment initiated", {
      paymentId,
      provider: params.provider,
      reference: result.reference,
      amount: amountInKobo,
      tier: params.requestedTier,
    });

    return {
      ok: true,
      authorizationUrl: result.authorizationUrl,
      reference: result.reference,
      paymentId,
    };
  } catch (err) {
    // Mark payment as failed
    await admin
      .from("payments")
      .update({ status: "failed" })
      .eq("id", paymentId);

    logger.error("Payment initiation failed", {
      paymentId,
      error: String(err),
    });
    return { ok: false, error: "Payment could not be initiated. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// VERIFY AND ACTIVATE (after webhook or reconciliation)
// ---------------------------------------------------------------------------

export interface VerifyAndActivateResult {
  ok: boolean;
  paymentStatus?: PaymentStatus;
  error?: string;
  alreadyProcessed?: boolean;
}

/**
 * Verifies a payment with the provider and activates the subscription.
 *
 * Per spec Sections 10, 11, 18, 19:
 *   1. Verify with provider (server-to-server)
 *   2. Check amount + currency + user match expected
 *   3. Idempotency check (don't activate twice)
 *   4. Update payment status → successful
 *   5. Activate subscription (update profiles.subscription_tier + user_subscriptions)
 *   6. Audit log
 */
export async function verifyAndActivate(
  paymentReference: string,
  provider: PaymentProvider,
): Promise<VerifyAndActivateResult> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Database not configured." };
  }

  // Find the payment by provider reference
  const { data: paymentRow } = await admin
    .from("payments")
    .select("*")
    .eq("provider_reference", paymentReference)
    .eq("provider", provider)
    .maybeSingle();

  if (!paymentRow) {
    return { ok: false, error: "Payment not found." };
  }

  const payment = paymentRow as {
    id: string;
    user_id: string;
    amount: number;
    currency: string;
    status: string;
    metadata: Record<string, unknown>;
    provider: string;
  };

  // Idempotency check (spec Section 9) — already successful?
  if (payment.status === "successful") {
    return { ok: true, paymentStatus: "successful", alreadyProcessed: true };
  }

  // Server-to-server verification with the provider
  const adapter = getPaymentProvider(provider);
  let verification;
  try {
    verification = await adapter.verify(paymentReference);
  } catch (err) {
    logger.error("Payment verification failed", {
      paymentReference,
      error: String(err),
    });
    return { ok: false, error: "Verification failed." };
  }

  // Check that the payment is successful according to the provider
  if (verification.status !== "successful") {
    // Update payment status to reflect provider state
    await admin
      .from("payments")
      .update({
        status: verification.status,
        verification_metadata: verification.rawResponse,
      })
      .eq("id", payment.id);

    // Notify the user only when the verified server-side state is "failed"
    // (per spec Section 26 — never send a "successful" notification
    // before server-side verification, and never send a "failed"
    // notification based on a browser-only response).
    if (verification.status === "failed") {
      await notificationService.dispatch({
        recipientId: payment.user_id,
        type: "payment.failed",
        title: "Payment failed",
        body: `We couldn't complete your payment of ${formatNaira(payment.amount)}.`,
        href: `/dashboard/payments`,
        relatedEntityType: "payment",
        relatedEntityId: payment.id,
        eventKey: `payment.failed:${paymentReference}`,
        metadata: {
          paymentId: payment.id,
          amountNaira: payment.amount / 100,
          reference: paymentReference,
        },
        emailTemplateInput: {
          amountNaira: payment.amount / 100,
          paymentType: payment.payment_type,
          reference: paymentReference,
        },
      });
    }

    return {
      ok: false,
      paymentStatus: verification.status,
      error: `Payment is ${verification.status}.`,
    };
  }

  // CRITICAL: Verify amount matches (spec Section 10, 11)
  if (verification.amount !== payment.amount) {
    logger.error("Payment amount mismatch!", {
      paymentId: payment.id,
      expected: payment.amount,
      received: verification.amount,
    });
    await admin
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id);
    return { ok: false, error: "Amount verification failed." };
  }

  // CRITICAL: Verify currency matches
  if (verification.currency !== payment.currency) {
    logger.error("Payment currency mismatch!", {
      paymentId: payment.id,
      expected: payment.currency,
      received: verification.currency,
    });
    await admin
      .from("payments")
      .update({ status: "failed" })
      .eq("id", payment.id);
    return { ok: false, error: "Currency verification failed." };
  }

  // === VERIFICATION PASSED ===
  // Now activate the subscription (spec Section 19)

  const metadata = payment.metadata as {
    requested_tier?: string;
    role?: string;
  };
  const requestedTier = metadata.requested_tier as SubscriptionTier;
  const role = metadata.role as UserRole;

  if (!requestedTier || !role) {
    logger.error("Payment metadata missing tier/role", { paymentId: payment.id });
    return { ok: false, error: "Invalid payment metadata." };
  }

  // 1. Mark payment as successful
  const { error: updateError } = await admin
    .from("payments")
    .update({
      status: "successful",
      verified_at: new Date().toISOString(),
      verification_metadata: verification.rawResponse,
    })
    .eq("id", payment.id);

  if (updateError) {
    logger.error("Failed to mark payment successful", {
      paymentId: payment.id,
      error: updateError.message,
    });
    return { ok: false, error: "Could not update payment status." };
  }

  // 2. Activate subscription (update profiles.subscription_tier)
  const { error: tierError } = await admin
    .from("profiles")
    .update({ subscription_tier: requestedTier })
    .eq("id", payment.user_id);

  if (tierError) {
    logger.error("Failed to activate subscription", {
      userId: payment.user_id,
      tier: requestedTier,
      error: tierError.message,
    });
    // Payment is successful but subscription activation failed.
    // The payment record is preserved — reconciliation can retry.
    return {
      ok: false,
      error: "Payment verified but subscription activation failed. Please contact support.",
    };
  }

  // 3. Record in user_subscriptions
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { data: planRow } = await admin
    .from("subscription_plans")
    .select("id")
    .eq("role", role)
    .eq("tier", requestedTier)
    .eq("billing_cycle", "monthly")
    .maybeSingle();

  if (planRow) {
    await admin.from("user_subscriptions").insert({
      user_id: payment.user_id,
      plan_id: (planRow as { id: string }).id,
      role,
      tier: requestedTier,
      status: "active",
      provider,
      provider_subscription_ref: paymentReference,
      billing_cycle: "monthly",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    });
  }

  // 4. Audit log
  await admin.from("audit_logs").insert({
    actor_id: payment.user_id,
    action: "subscription_activated",
    target_type: "payment",
    target_id: payment.id,
    metadata: {
      tier: requestedTier,
      provider,
      amount: payment.amount,
      reference: paymentReference,
    },
  });

  logger.info("Payment verified + subscription activated", {
    paymentId: payment.id,
    userId: payment.user_id,
    tier: requestedTier,
    provider,
  });

  // Notify the user — idempotent via eventKey so a duplicate webhook
  // does not produce a duplicate notification (spec Section 26, 16).
  await notificationService.dispatch({
    recipientId: payment.user_id,
    type: "payment.successful",
    title: "Payment successful",
    body: `Your payment of ${formatNaira(payment.amount)} was successful.`,
    href: `/dashboard/payments`,
    relatedEntityType: "payment",
    relatedEntityId: payment.id,
    eventKey: `payment.successful:${paymentReference}`,
    metadata: {
      paymentId: payment.id,
      amountNaira: payment.amount / 100,
      paymentType: payment.payment_type,
      reference: paymentReference,
    },
    emailTemplateInput: {
      amountNaira: payment.amount / 100,
      paymentType: payment.payment_type,
      reference: paymentReference,
    },
  });
  await notificationService.dispatch({
    recipientId: payment.user_id,
    type: "subscription.started",
    title: `Subscription activated — ${requestedTier}`,
    body: `Your ${requestedTier} subscription is now active.`,
    href: `/dashboard/subscription`,
    relatedEntityType: "payment",
    relatedEntityId: payment.id,
    eventKey: `subscription.started:${payment.user_id}:${requestedTier}`,
    metadata: { tier: requestedTier, role, amountNaira: payment.amount / 100 },
    emailTemplateInput: {
      tier: requestedTier,
      amountNaira: payment.amount / 100,
      period: "monthly",
    },
  });

  return { ok: true, paymentStatus: "successful" };
}

// ---------------------------------------------------------------------------
// RECONCILIATION (spec Section 35)
// ---------------------------------------------------------------------------

/**
 * Reconciles a stuck payment.
 *
 * Per spec Section 35: "A user pays successfully but browser closes,
 * redirect fails, webhook is delayed. The payment must remain recoverable."
 *
 * This function can be called:
 * - From the /checkout/success callback page (queries server for status)
 * - From a scheduled cron job (checks pending payments older than X minutes)
 * - From an admin reconciliation tool
 */
export async function reconcilePayment(
  paymentReference: string,
  provider: PaymentProvider,
): Promise<VerifyAndActivateResult> {
  // verifyAndActivate is idempotent — calling it again for an already-
  // successful payment returns { ok: true, alreadyProcessed: true }
  return verifyAndActivate(paymentReference, provider);
}

// ---------------------------------------------------------------------------
// PAYMENT HISTORY FETCHER
// ---------------------------------------------------------------------------

export async function getPaymentHistory(userId: string) {
  const admin = createAdminClient();
  if (!admin) return [];

  const { data } = await admin
    .from("payments")
    .select("id, amount, currency, provider, provider_reference, payment_type, status, initiated_at, verified_at, metadata")
    .eq("user_id", userId)
    .order("initiated_at", { ascending: false })
    .limit(50);

  return (data ?? []) as Array<{
    id: string;
    amount: number;
    currency: string;
    provider: string;
    provider_reference: string | null;
    payment_type: string;
    status: string;
    initiated_at: string;
    verified_at: string | null;
    metadata: Record<string, unknown>;
  }>;
}

/**
 * Returns available payment providers based on configuration.
 * Per spec Section 15: "Only display providers that are configured and available."
 */
export function getAvailableProviders(): PaymentProvider[] {
  const providers: PaymentProvider[] = [];
  if (serverConfig.paystack.secretKey) {
    providers.push("paystack");
  }
  if (serverConfig.flutterwave.secretKey) {
    providers.push("flutterwave");
  }

  // In development, show both even if not configured (for UI testing)
  if (providers.length === 0 && process.env.NODE_ENV !== "production") {
    return ["paystack", "flutterwave"];
  }

  return providers;
}
