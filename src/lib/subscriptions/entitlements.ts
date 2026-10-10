import { createServerClient } from "@/lib/db/supabase";
import { getCurrentProfile } from "@/lib/auth/server";
import { capabilitiesFor } from "@/lib/capabilities";
import { getPlan, formatNaira } from "@/lib/subscriptions/plans";
import type {
  UserRole,
  SubscriptionTier,
  ProfileRow,
} from "@/types";
import type { Capabilities } from "@/lib/capabilities";

/**
 * Entitlement resolver — answers "What can this user do right now?"
 *
 * Per spec Sections 5, 6, 7, 13, 14, 15, 29:
 *   * Centralised — imported by all server actions, route handlers, services
 *   * Server-side authoritative — client uses for UX only
 *   * Usage calculated from real server-side data (not client counters)
 *   * Free plan is first-class (every user has effective Free entitlement)
 *   * One active plan per user (profiles.subscription_tier is the source of truth)
 *
 * Per spec Section 22: subscription determines ELIGIBILITY for verification,
 * NOT approval. Upgrading a plan never sets verification_state.
 */

export interface EffectivePlan {
  role: UserRole;
  tier: SubscriptionTier;
  priceNaira: number;
  isVariablePrice: boolean;
  tagline: string;
}

export interface UsageInfo {
  metric: string;
  used: number;
  limit: number | null; // null = unlimited
  remaining: number | null; // null = unlimited
}

/**
 * Returns the caller's effective plan (role + tier + price).
 * Uses profiles.subscription_tier as the source of truth — the RLS UPDATE
 * policy makes this immutable from the client side.
 */
export async function getEffectivePlan(): Promise<EffectivePlan | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const plan = getPlan(profile.role, profile.subscription_tier);
  return {
    role: profile.role,
    tier: profile.subscription_tier,
    priceNaira: plan.priceNaira,
    isVariablePrice: plan.is_variable_price,
    tagline: plan.tagline,
  };
}

/**
 * Returns the caller's full entitlements (Capabilities object).
 * This is the single source of truth for "what can this user do".
 */
export async function getEntitlements(): Promise<Capabilities | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  return capabilitiesFor(profile.role, profile.subscription_tier);
}

/**
 * Returns the caller's current usage for all metered capabilities.
 * Per spec Section 13: usage calculated from reliable server-side data.
 */
export async function getUsage(): Promise<UsageInfo[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];

  const caps = capabilitiesFor(profile.role, profile.subscription_tier);
  const supabase = await createServerClient();
  if (!supabase) return [];

  const usage: UsageInfo[] = [];
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();

  // 1. Listings this month (landlord + company)
  if (profile.role === "landlord" || profile.role === "company") {
    const { count } = await supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("listing_creator_id", profile.id)
      .gte("created_at", monthStartIso)
      .neq("status", "removed");
    usage.push({
      metric: "monthly_listings",
      used: count ?? 0,
      limit: caps.maxListingsPerMonth,
      remaining: caps.maxListingsPerMonth === null ? null : Math.max(0, caps.maxListingsPerMonth - (count ?? 0)),
    });
  }

  // 2. Applications this month (agent only)
  if (profile.role === "agent") {
    const { count } = await supabase
      .from("property_applications")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", profile.id)
      .gte("created_at", monthStartIso);
    usage.push({
      metric: "monthly_applications",
      used: count ?? 0,
      limit: caps.maxApplicationsPerMonth,
      remaining: caps.maxApplicationsPerMonth === null ? null : Math.max(0, caps.maxApplicationsPerMonth - (count ?? 0)),
    });
  }

  // 3. New conversations this month (agent + company)
  if (profile.role === "agent" || profile.role === "company") {
    const { count } = await supabase
      .from("conversation_participants")
      .select("conversation_id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .gte("joined_at", monthStartIso);
    usage.push({
      metric: "monthly_new_conversations",
      used: count ?? 0,
      limit: caps.maxNewConversationsPerMonth,
      remaining: caps.maxNewConversationsPerMonth === null ? null : Math.max(0, caps.maxNewConversationsPerMonth - (count ?? 0)),
    });
  }

  // 4. Saved properties (all roles with the capability)
  {
    const { count } = await supabase
      .from("saved_properties")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id);
    usage.push({
      metric: "saved_properties",
      used: count ?? 0,
      limit: caps.maxSavedProperties,
      remaining: caps.maxSavedProperties === null ? null : Math.max(0, caps.maxSavedProperties - (count ?? 0)),
    });
  }

  // 5. Saved searches (all roles)
  {
    const { count } = await supabase
      .from("saved_searches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id);
    usage.push({
      metric: "saved_searches",
      used: count ?? 0,
      limit: caps.maxSavedSearches,
      remaining: caps.maxSavedSearches === null ? null : Math.max(0, caps.maxSavedSearches - (count ?? 0)),
    });
  }

  return usage;
}

/**
 * Checks if the caller can consume a specific metered capability.
 * Per spec Section 15: "Avoid race conditions" — this checks usage
 * server-side. The actual consumption (insert) must also be validated
 * by the specific service (e.g. submitApplication checks the count again).
 *
 * @param metric — "monthly_listings" | "monthly_applications" | "monthly_new_conversations" | "saved_properties" | "saved_searches"
 * @param quantity — how many to consume (default 1)
 */
export async function canConsume(
  metric: string,
  quantity: number = 1,
): Promise<{ allowed: boolean; remaining: number | null; limit: number | null; used: number }> {
  const usage = await getUsage();
  const item = usage.find((u) => u.metric === metric);

  if (!item) {
    return { allowed: false, remaining: 0, limit: 0, used: 0 };
  }

  if (item.limit === null) {
    // Unlimited — always allowed (fair-use applies at the service level)
    return { allowed: true, remaining: null, limit: null, used: item.used };
  }

  const remaining = item.remaining ?? 0;
  const allowed = remaining >= quantity;
  return { allowed, remaining, limit: item.limit, used: item.used };
}

/**
 * Checks if the caller has a specific boolean capability.
 * Per spec Section 6: "hasCapability(userId, 'advanced_search')"
 */
export async function hasCapability(
  capability: keyof Capabilities,
): Promise<boolean> {
  const caps = await getEntitlements();
  if (!caps) return false;
  return Boolean(caps[capability]);
}

/**
 * Returns the limit for a specific metered capability.
 * Per spec Section 6: "getLimit(userId, 'monthly_property_applications')"
 */
export async function getLimit(
  capability: keyof Capabilities,
): Promise<number | null> {
  const caps = await getEntitlements();
  if (!caps) return null;
  const value = caps[capability];
  return typeof value === "number" ? value : null;
}
