"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createAdminClient } from "@/lib/db/supabase";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/server";
import { getPlan } from "@/lib/subscriptions/plans";
import { logger } from "@/lib/logging";
import type { SubscriptionTier } from "@/types";

/**
 * Subscription lifecycle server actions.
 *
 * Per spec Sections 10, 11, 27, 28, 30, 31, 32:
 *   * One active plan per user (profiles.subscription_tier is the source of truth)
 *   * Role-plan compatibility enforced (can't assign Agent plan to Landlord)
 *   * Subscription transitions: upgrade, downgrade, cancel, expire, pause
 *   * Graceful downgrade — never delete user content (spec Section 28)
 *   * Users CANNOT assign themselves Premium (RLS blocks subscription_tier changes)
 *   * Verification NOT auto-granted on upgrade (spec Section 22)
 *   * All transitions audited
 *
 * Per spec Section 43: NO Paystack/Flutterwave integration yet.
 * These actions change the subscription_tier on the profile directly —
 * Prompt 13 will add payment verification before allowing the change.
 */

export type SubscriptionActionResult =
  | { ok: true; redirectTo?: string }
  | { ok: false; message?: string; requiresAuth?: boolean };

// ---------------------------------------------------------------------------
// UPGRADE / CHANGE PLAN (spec Sections 10, 11, 27)
// ---------------------------------------------------------------------------

export async function changePlanAction(input: {
  newTier: SubscriptionTier;
}): Promise<SubscriptionActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, requiresAuth: true, message: "Please sign in." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, requiresAuth: true };
  }

  // Account must be active
  if (profile.account_status !== "active") {
    return { ok: false, message: `Your account is ${profile.account_status}.` };
  }

  // Role-plan compatibility (spec Section 11)
  // Verify the requested tier is valid for the user's role
  const targetPlan = getPlan(profile.role, input.newTier);
  if (!targetPlan || !targetPlan.sellable) {
    return { ok: false, message: "Invalid plan for your role." };
  }

  // Can't change to the same tier
  if (profile.subscription_tier === input.newTier) {
    return { ok: false, message: `You're already on the ${input.newTier} plan.` };
  }

  // Per spec Section 43: NO payment processing yet.
  // In a later prompt (P13), this action will:
  // 1. Initiate payment via Paystack/Flutterwave
  // 2. Wait for webhook confirmation
  // 3. Only then update the subscription_tier
  //
  // For now, we allow direct tier changes as a "dev/preview" mode.
  // In production, the payment check will gate this.

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, message: "Database not configured." };
  }

  // Update profiles.subscription_tier (service-role — users can't do this via RLS)
  const { error } = await admin
    .from("profiles")
    .update({ subscription_tier: input.newTier })
    .eq("id", profile.id);

  if (error) {
    logger.error("Plan change failed", {
      userId: user.id,
      newTier: input.newTier,
      error: error.message,
    });
    return { ok: false, message: "We couldn't change your plan." };
  }

  // Record in user_subscriptions (insert a new row)
  const planRow = await admin
    .from("subscription_plans")
    .select("id")
    .eq("role", profile.role)
    .eq("tier", input.newTier)
    .eq("billing_cycle", "monthly")
    .maybeSingle();

  if (planRow.data) {
    const planId = (planRow.data as { id: string }).id;
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await admin.from("user_subscriptions").insert({
      user_id: profile.id,
      plan_id: planId,
      role: profile.role,
      tier: input.newTier,
      status: input.newTier === "free" ? "active" : "active", // P13 will set "pending" until payment confirmed
      billing_cycle: "monthly",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    });
  }

  // Audit log
  const previousTier = profile.subscription_tier;
  const action =
    input.newTier === "free"
      ? "subscription.downgraded"
      : isUpgrade(previousTier, input.newTier)
        ? "subscription.upgraded"
        : "subscription.downgraded";

  await admin.from("audit_logs").insert({
    actor_id: user.id,
    action,
    target_type: "profile",
    target_id: profile.id,
    metadata: {
      previous_tier: previousTier,
      new_tier: input.newTier,
      role: profile.role,
    },
  });

  // Per spec Section 22: NEVER auto-grant verification on upgrade
  // The verification system (P5) is completely separate.
  // We do NOT touch verification_state here.

  revalidatePath("/dashboard/subscription", "page");
  revalidatePath("/dashboard", "layout");
  return { ok: true, redirectTo: "/dashboard/subscription" };
}

// ---------------------------------------------------------------------------
// CANCEL PLAN (spec Section 27)
// ---------------------------------------------------------------------------

export async function cancelPlanAction(): Promise<SubscriptionActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  // Can't cancel Free (it's the default)
  if (profile.subscription_tier === "free") {
    return { ok: false, message: "You're already on the Free plan." };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };

  // Downgrade to Free (spec Section 28: graceful — don't delete content)
  const { error } = await admin
    .from("profiles")
    .update({ subscription_tier: "free" })
    .eq("id", profile.id);

  if (error) {
    return { ok: false, message: "We couldn't cancel your subscription." };
  }

  // Mark current subscription as cancelled
  await admin
    .from("user_subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("user_id", profile.id)
    .eq("status", "active");

  // Audit
  await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "subscription.cancelled",
    target_type: "profile",
    target_id: profile.id,
    metadata: {
      previous_tier: profile.subscription_tier,
      new_tier: "free",
    },
  });

  // Per spec Section 28: graceful downgrade
  // We do NOT delete saved properties, saved searches, listings, or any
  // user content. New actions beyond Free limits will be blocked by
  // the respective services.

  revalidatePath("/dashboard/subscription", "page");
  revalidatePath("/dashboard", "layout");
  return { ok: true, redirectTo: "/dashboard/subscription" };
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function isUpgrade(from: SubscriptionTier, to: SubscriptionTier): boolean {
  const order: Record<SubscriptionTier, number> = { free: 0, pro: 1, premium: 2 };
  return order[to] > order[from];
}
