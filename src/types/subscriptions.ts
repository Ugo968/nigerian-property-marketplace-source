import type { UserRole } from "./auth";

/**
 * Subscription tier types.
 *
 * Everyone starts Free. Three tiers: Free, Pro, Premium.
 * Pricing is owned by `lib/subscriptions/plans.ts` — never hard-code here.
 */

export const SUBSCRIPTION_TIERS = ["free", "pro", "premium"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  pro: "Pro",
  premium: "Premium",
};

/**
 * Subscription status — the lifecycle state of a user's active subscription.
 */
export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "cancelled",
  "expired",
  "paused",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Composite key — a (role, tier) pair uniquely identifies a plan with its
 * own price and feature matrix. This is the canonical identifier used
 * throughout the codebase.
 */
export type PlanKey = `${UserRole}-${SubscriptionTier}`;

/**
 * Subscription plan record. Concrete values live in lib/subscriptions/plans.ts.
 */
export interface SubscriptionPlan {
  role: UserRole;
  tier: SubscriptionTier;
  priceNaira: number;
  /** Whether this plan is the default for the role at signup. */
  isDefault: boolean;
  /** Display tagline shown on pricing cards. */
  tagline: string;
  /** Bullet list of human-readable feature highlights. */
  highlights: string[];
  /** Whether this plan is currently sellable. Used to retire plans cleanly. */
  sellable: boolean;
}
