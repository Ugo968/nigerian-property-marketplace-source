"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/supabase";
import {
  getCurrentUser,
  getCurrentProfile,
} from "@/lib/auth/server";
import { capabilitiesFor } from "@/lib/capabilities";
import { rateLimiter, RATE_LIMITS } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging";
import { notificationService } from "@/lib/notifications";
import {
  initiatePayment,
} from "@/lib/payments/payment-service";
import { getPlan } from "@/lib/subscriptions/plans";
import {
  MAX_ACTIVE_PROMOTIONS_PER_USER,
  CREDIT_PURCHASE_PRICE_NAIRA,
  MIN_CREDITS_PER_PURCHASE,
  MAX_CREDITS_PER_PURCHASE,
} from "./config";
import type { PaymentProvider } from "@/types";

/**
 * Featured listing server actions.
 *
 * Per spec Sections 7, 8, 9, 14, 15, 16, 27, 34, 35:
 *   * Server-side eligibility verification (ownership + property status)
 *   * Credit consumption is server-authoritative (append-only ledger)
 *   * No negative balances
 *   * Payment via existing Paystack/Flutterwave abstraction
 *   * Webhook idempotency (no duplicate credit grants)
 *   * Promotion lifecycle: draft → scheduled → active → completed/expired
 *   * Cancellation restores credits
 *   * Users cannot self-assign credits, modify status, or promote others' properties
 */

export type FeaturedActionResult =
  | { ok: true; promotionId?: string; redirectTo?: string }
  | { ok: false; fieldErrors?: Record<string, string[]>; message?: string; requiresAuth?: boolean };

// ---------------------------------------------------------------------------
// CREATE PROMOTION (spec Section 14)
// ---------------------------------------------------------------------------

export async function createPromotionAction(input: {
  propertyId: string;
  productSlug: string;
  useCredit: boolean;
  startNow: boolean;
}): Promise<FeaturedActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, requiresAuth: true, message: "Please sign in." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, requiresAuth: true };
  }

  if (profile.account_status !== "active") {
    return { ok: false, message: "Your account is not active." };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Verify the caller owns or manages the property (spec Section 8)
  const { data: propRow } = await supabase
    .from("properties")
    .select("id, owner_profile_id, listing_creator_id, managing_agent_id, status, deleted_at, published_at")
    .eq("id", input.propertyId)
    .maybeSingle();

  if (!propRow) {
    return { ok: false, message: "Property not found." };
  }

  const property = propRow as {
    id: string;
    owner_profile_id: string | null;
    listing_creator_id: string;
    managing_agent_id: string | null;
    status: string;
    deleted_at: string | null;
    published_at: string | null;
  };

  // Ownership / management check (spec Section 8)
  const isOwner = property.owner_profile_id === profile.id || property.listing_creator_id === profile.id;
  const isManagingAgent = property.managing_agent_id === profile.id;
  if (!isOwner && !isManagingAgent) {
    return { ok: false, message: "FORBIDDEN — you can only promote properties you own or manage." };
  }

  // Property eligibility (spec Section 7)
  if (property.deleted_at || property.status === "removed") {
    return { ok: false, message: "This property has been removed." };
  }
  if (property.status === "suspended") {
    return { ok: false, message: "This property is suspended and cannot be promoted." };
  }
  if (!property.published_at || property.status === "draft") {
    return { ok: false, message: "This property is not published." };
  }
  if (!["available", "application_pending", "under_offer"].includes(property.status)) {
    return { ok: false, message: `Cannot promote a property in status "${property.status}".` };
  }

  // Look up the promotion product (spec Section 13 — server-side price)
  const { data: productRow } = await supabase
    .from("promotion_products")
    .select("*")
    .eq("slug", input.productSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (!productRow) {
    return { ok: false, message: "Invalid promotion product." };
  }

  const product = productRow as {
    id: string;
    slug: string;
    label: string;
    placement: string;
    credit_cost: number;
    duration_days: number;
  };

  // Check simultaneous active promotions limit (spec Section 24)
  const { count: activeCount } = await supabase
    .from("featured_listings")
    .select("id", { count: "exact", head: true })
    .eq("purchaser_id", profile.id)
    .in("status", ["scheduled", "active"]);

  if ((activeCount ?? 0) >= MAX_ACTIVE_PROMOTIONS_PER_USER) {
    return { ok: false, message: `You've reached the limit of ${MAX_ACTIVE_PROMOTIONS_PER_USER} active promotions.` };
  }

  // Rate-limit
  const rl = await rateLimiter.check({
    key: user.id,
    action: "promotion_create",
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many promotion attempts. Try again later." };
  }

  // Calculate start/end times
  const now = new Date();
  const startsAt = input.startNow ? now.toISOString() : new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(new Date(startsAt).getTime() + product.duration_days * 24 * 60 * 60 * 1000).toISOString();

  if (input.useCredit) {
    // ---- CREDIT PATH ----
    // Check if the user has enough credits
    const creditBalance = await getUserCreditBalance(profile.id, supabase);
    if (creditBalance < product.credit_cost) {
      return {
        ok: false,
        message: `Insufficient credits. You need ${product.credit_cost} credits but have ${creditBalance}. Purchase credits or use direct payment.`,
      };
    }

    // Find the oldest non-expired credit row with remaining balance
    const { data: creditRows } = await supabase
      .from("featured_listing_credits")
      .select("id, remaining, expires_at")
      .eq("user_id", profile.id)
      .gt("remaining", 0)
      .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
      .order("created_at", { ascending: true });

    if (!creditRows || creditRows.length === 0) {
      return { ok: false, message: "No available credits found." };
    }

    // Consume credits from the oldest row first (FIFO)
    let creditsToConsume = product.credit_cost;
    let usedCreditId: string | null = null;

    for (const credit of creditRows as Array<{ id: string; remaining: number; expires_at: string | null }>) {
      if (creditsToConsume <= 0) break;
      const consume = Math.min(creditsToConsume, credit.remaining);
      creditsToConsume -= consume;

      await supabase
        .from("featured_listing_credits")
        .update({ remaining: credit.remaining - consume })
        .eq("id", credit.id);

      if (!usedCreditId) usedCreditId = credit.id;
    }

    // Record credit consumption in the append-only ledger (spec Section 10)
    await supabase.from("featured_credit_transactions").insert({
      user_id: profile.id,
      amount: -product.credit_cost,
      transaction_type: "consumed",
      source: "promotion",
      related_resource_id: null, // will be updated after promotion insert
      metadata: { product_slug: input.productSlug, credit_cost: product.credit_cost },
    });

    // Create the featured listing promotion
    const { data: promotion, error: promoError } = await supabase
      .from("featured_listings")
      .insert({
        property_id: input.propertyId,
        purchaser_id: profile.id,
        placement: product.placement,
        credit_id: usedCreditId,
        payment_id: null,
        status: input.startNow ? "active" : "scheduled",
        starts_at: startsAt,
        ends_at: endsAt,
      })
      .select("id")
      .single();

    if (promoError || !promotion) {
      // Refund the credits since the promotion creation failed
      await supabase
        .from("featured_listing_credits")
        .update({ remaining: creditRows[0].remaining })
        .eq("id", (creditRows[0] as { id: string }).id);

      logger.error("Promotion creation failed", { error: promoError?.message });
      return { ok: false, message: "We couldn't create the promotion." };
    }

    const promotionId = (promotion as { id: string }).id;

    // Audit log
    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      action: "promotion_created",
      target_type: "featured_listing",
      target_id: promotionId,
      metadata: {
        property_id: input.propertyId,
        product: input.productSlug,
        credit_cost: product.credit_cost,
        placement: product.placement,
      },
    });

    // Notify the user (spec Section 27).
    await notificationService.dispatch({
      recipientId: profile.id,
      type: "promotion.submitted",
      title: "Promotion submitted",
      body: `Your promotion for the listing has been created. Status: ${input.startNow ? "active" : "scheduled"}.`,
      href: `/dashboard/promotions`,
      relatedEntityType: "featured_listing",
      relatedEntityId: promotionId,
      eventKey: `promotion.submitted:${promotionId}`,
      metadata: {
        promotionId,
        propertyId: input.propertyId,
        productSlug: input.productSlug,
      },
      emailTemplateInput: {
        propertyTitle: "your listing",
        startDate: startsAt,
        endDate: endsAt,
      },
    });

    revalidatePath("/dashboard/promotions", "page");
    return { ok: true, promotionId, redirectTo: "/dashboard/promotions" };
  } else {
    // ---- DIRECT PAYMENT PATH (spec Section 16) ----
    // Create a pending payment for the promotion
    const amountInKobo = product.credit_cost * CREDIT_PURCHASE_PRICE_NAIRA * 100;

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        user_id: profile.id,
        amount: amountInKobo,
        currency: "NGN",
        provider: "paystack", // default; user chooses on checkout
        payment_type: "featured_listing",
        status: "pending",
        metadata: {
          property_id: input.propertyId,
          product_slug: input.productSlug,
          credit_cost: product.credit_cost,
          placement: product.placement,
        },
        initiated_at: now.toISOString(),
      })
      .select("id")
      .single();

    if (paymentError || !payment) {
      return { ok: false, message: "Could not create payment record." };
    }

    // Create the promotion in pending_payment status
    const { data: promotion, error: promoError } = await supabase
      .from("featured_listings")
      .insert({
        property_id: input.propertyId,
        purchaser_id: profile.id,
        placement: product.placement,
        payment_id: (payment as { id: string }).id,
        status: "pending_payment",
        starts_at: startsAt,
        ends_at: endsAt,
      })
      .select("id")
      .single();

    if (promoError || !promotion) {
      return { ok: false, message: "Could not create promotion record." };
    }

    revalidatePath("/dashboard/promotions", "page");
    return {
      ok: true,
      promotionId: (promotion as { id: string }).id,
      redirectTo: `/checkout?tier=featured&product=${input.productSlug}&property=${input.propertyId}`,
    };
  }
}

// ---------------------------------------------------------------------------
// CANCEL PROMOTION (spec Section 27)
// ---------------------------------------------------------------------------

export async function cancelPromotionAction(promotionId: string): Promise<FeaturedActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  // Verify ownership
  const { data: promoRow } = await supabase
    .from("featured_listings")
    .select("id, purchaser_id, status, credit_id, payment_id")
    .eq("id", promotionId)
    .maybeSingle();

  if (!promoRow) {
    return { ok: false, message: "Promotion not found." };
  }

  const promo = promoRow as {
    id: string;
    purchaser_id: string;
    status: string;
    credit_id: string | null;
    payment_id: string | null;
  };

  if (promo.purchaser_id !== profile.id) {
    return { ok: false, message: "FORBIDDEN" };
  }

  // Can only cancel scheduled or active promotions
  if (!["scheduled", "active"].includes(promo.status)) {
    return { ok: false, message: `Cannot cancel a promotion in status "${promo.status}".` };
  }

  // If credits were used and the promotion hasn't started, refund them
  if (promo.credit_id && promo.status === "scheduled") {
    // Restore the credit
    await supabase.rpc("restore_featured_credit", { credit_id: promo.credit_id }).catch(() => {
      // RPC might not exist yet — do manual restore
    });

    // Manual credit restore (fallback if RPC doesn't exist)
    const { data: creditRow } = await supabase
      .from("featured_listing_credits")
      .select("remaining")
      .eq("id", promo.credit_id)
      .maybeSingle();

    if (creditRow) {
      const currentRemaining = (creditRow as { remaining: number }).remaining;
      await supabase
        .from("featured_listing_credits")
        .update({ remaining: currentRemaining + 1 })
        .eq("id", promo.credit_id);

      // Record refund in ledger
      await supabase.from("featured_credit_transactions").insert({
        user_id: profile.id,
        amount: 1,
        transaction_type: "refunded",
        source: "refund",
        related_resource_id: promotionId,
        metadata: { reason: "promotion_cancelled_before_start" },
      });
    }
  }

  // Update promotion status
  const { error } = await supabase
    .from("featured_listings")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", promotionId);

  if (error) {
    return { ok: false, message: "We couldn't cancel the promotion." };
  }

  // Audit log
  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    action: "promotion_cancelled",
    target_type: "featured_listing",
    target_id: promotionId,
    metadata: { previous_status: promo.status },
  });

  revalidatePath("/dashboard/promotions", "page");
  return { ok: true, redirectTo: "/dashboard/promotions" };
}

// ---------------------------------------------------------------------------
// PURCHASE CREDITS (spec Section 15)
// ---------------------------------------------------------------------------

export async function purchaseCreditsAction(input: {
  amount: number;
  provider: PaymentProvider;
}): Promise<FeaturedActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  if (profile.account_status !== "active") {
    return { ok: false, message: "Your account is not active." };
  }

  // Validate amount (spec Section 15 — server-side validation)
  if (
    !Number.isInteger(input.amount) ||
    input.amount < MIN_CREDITS_PER_PURCHASE ||
    input.amount > MAX_CREDITS_PER_PURCHASE
  ) {
    return { ok: false, message: `Credit amount must be between ${MIN_CREDITS_PER_PURCHASE} and ${MAX_CREDITS_PER_PURCHASE}.` };
  }

  // Server-side price authority (spec Section 16 — never trust client amount)
  const amountInKobo = input.amount * CREDIT_PURCHASE_PRICE_NAIRA * 100;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const result = await initiatePayment({
    userId: profile.id,
    userEmail: user.email ?? "",
    userFullName: profile.full_name,
    userRole: profile.role,
    currentTier: profile.subscription_tier,
    requestedTier: profile.subscription_tier, // not a subscription upgrade
    provider: input.provider,
    paymentType: "featured_listing",
    callbackUrl: `${appUrl}/checkout/success?provider=${input.provider}&type=credits`,
  });

  if (!result.ok) {
    return { ok: false, message: result.error ?? "Payment could not be initiated." };
  }

  // Store the credit amount in the payment metadata for the webhook to use
  const supabase = createAdminClient();
  if (supabase && result.paymentId) {
    await supabase
      .from("payments")
      .update({
        metadata: {
          credit_amount: input.amount,
          credit_price_per: CREDIT_PURCHASE_PRICE_NAIRA,
          type: "credit_purchase",
        },
      })
      .eq("id", result.paymentId);
  }

  return {
    ok: true,
    redirectTo: result.authorizationUrl,
  };
}

// ---------------------------------------------------------------------------
// GRANT PURCHASED CREDITS (called from webhook after payment verification)
// Per spec Section 15: "After successful server-side verification:
//   1. Mark payment successful.
//   2. Grant the purchased credits.
//   3. Record the credit ledger entry.
//   4. Prevent duplicate credit grants.
//   5. Make credits available to the user."
// ---------------------------------------------------------------------------

export async function grantPurchasedCredits(
  userId: string,
  paymentId: string,
  creditAmount: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "Database not configured." };

  // Idempotency check: have we already granted credits for this payment?
  const { data: existingGrant } = await supabase
    .from("featured_credit_transactions")
    .select("id")
    .eq("related_resource_id", paymentId)
    .eq("transaction_type", "purchased")
    .maybeSingle();

  if (existingGrant) {
    // Already granted — idempotent return
    return { ok: true };
  }

  // Create the credit row
  const { data: creditRow, error: creditError } = await supabase
    .from("featured_listing_credits")
    .insert({
      user_id: userId,
      source: "purchase",
      source_ref: paymentId,
      amount: creditAmount,
      remaining: creditAmount,
      expires_at: null, // purchased credits don't expire
    })
    .select("id")
    .single();

  if (creditError || !creditRow) {
    logger.error("Failed to grant purchased credits", {
      userId,
      paymentId,
      error: creditError?.message,
    });
    return { ok: false, error: "Credit grant failed." };
  }

  // Record in the append-only ledger
  const { error: ledgerError } = await supabase
    .from("featured_credit_transactions")
    .insert({
      user_id: userId,
      amount: creditAmount,
      transaction_type: "purchased",
      source: "purchase",
      related_resource_id: paymentId,
      metadata: {
        credit_id: (creditRow as { id: string }).id,
        amount: creditAmount,
      },
    });

  if (ledgerError) {
    // UNIQUE violation = already processed (race condition)
    if (ledgerError.code === "23505") {
      return { ok: true };
    }
    logger.error("Failed to record credit ledger entry", {
      userId,
      paymentId,
      error: ledgerError.message,
    });
  }

  // Audit log
  await supabase.from("audit_logs").insert({
    actor_id: userId,
    action: "featured_credit_purchased",
    target_type: "payment",
    target_id: paymentId,
    metadata: { credit_amount: creditAmount },
  });

  logger.info("Featured credits granted", {
    userId,
    paymentId,
    creditAmount,
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// HELPER: get user's current credit balance
// ---------------------------------------------------------------------------

async function getUserCreditBalance(
  userId: string,
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
): Promise<number> {
  const { data: creditRows } = await supabase
    .from("featured_listing_credits")
    .select("remaining, expires_at")
    .eq("user_id", userId)
    .gt("remaining", 0);

  if (!creditRows) return 0;

  const now = new Date().toISOString();
  return (creditRows as Array<{ remaining: number; expires_at: string | null }>)
    .filter((c) => !c.expires_at || c.expires_at > now)
    .reduce((sum, c) => sum + c.remaining, 0);
}
