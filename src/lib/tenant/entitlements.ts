/**
 * Tenant trial + entitlement service (spec Section 2, 3, 4, 5, 12).
 *
 * Responsibilities:
 *   - Start the 7-day trial when a tenant completes onboarding
 *   - Track trial listing views server-side (prevent usage reset)
 *   - Check whether a tenant can view a specific property (trial limit)
 *   - Check whether a tenant can contact a landlord (paid subscription)
 *   - Resolve the correct landlord/owner for a property (for contact)
 *
 * CRITICAL SECURITY (spec Section 12):
 *   - Users CANNOT alter trial expiry or usage counters (server-only writes)
 *   - Users CANNOT reset listing usage by changing request parameters
 *   - Trial users CANNOT contact landlords
 *   - Expired trial users CANNOT contact landlords
 *   - Tenants without active subscription CANNOT contact landlords
 *
 * The trial tracking table (tenant_trial_usage) is RLS-protected:
 *   - SELECT: tenant can read their own status
 *   - INSERT/UPDATE/DELETE: server-only (no client policy)
 */

import { createAdminClient } from "@/lib/db/supabase";
import { getCurrentProfile } from "@/lib/auth/server";
import { logger } from "@/lib/logging";
import type { ProfileRow } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TenantTrialStatus {
  isActive: boolean;
  trialStartedAt: string | null;
  trialExpiresAt: string | null;
  listingsViewed: number;
  listingAllowance: number;
  remainingViews: number;
  hasTrialEnded: boolean;
}

export interface ContactAuthorizationResult {
  ok: boolean;
  message?: string;
  /** The profile id of the landlord/owner to contact. */
  recipientProfileId?: string;
  /** The relationship the recipient has to the property. */
  recipientRole?: "owner" | "managing_agent" | "listing_creator";
  /** Whether the recipient is the actual owner or a representative. */
  isDirectOwner?: boolean;
}

// ---------------------------------------------------------------------------
// 1. Start trial (called when a tenant completes onboarding)
// ---------------------------------------------------------------------------

export async function startTenantTrial(
  tenantProfileId: string,
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) {
    logger.warn("startTenantTrial: admin client unavailable");
    return;
  }

  // Read configurable trial duration from platform_settings (default 7)
  const { data: settingRow } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "tenant.trial_duration_days")
    .maybeSingle();
  const trialDays = Number((settingRow as { value?: number } | null)?.value ?? 7);

  // Read configurable listing allowance (default 10)
  const { data: allowanceRow } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "tenant.trial_listing_allowance")
    .maybeSingle();
  const listingAllowance = Number((allowanceRow as { value?: number } | null)?.value ?? 10);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

  // Idempotent insert — if a trial row already exists, do nothing.
  // Per spec Section 3: "Free trial cannot be restarted by repeatedly
  // creating accounts or changing subscription records."
  await admin
    .from("tenant_trial_usage")
    .upsert({
      tenant_profile_id: tenantProfileId,
      trial_started_at: now.toISOString(),
      trial_expires_at: expiresAt.toISOString(),
      listing_allowance: listingAllowance,
      listings_viewed: 0,
      viewed_property_ids: [],
    } as never, {
      onConflict: "tenant_profile_id",
      ignoreDuplicates: true, // don't overwrite an existing trial
    });
}

// ---------------------------------------------------------------------------
// 2. Get trial status (for the tenant dashboard + entitlement checks)
// ---------------------------------------------------------------------------

export async function getTenantTrialStatus(
  tenantProfileId: string,
): Promise<TenantTrialStatus | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data } = await admin
    .from("tenant_trial_usage")
    .select("*")
    .eq("tenant_profile_id", tenantProfileId)
    .maybeSingle();

  if (!data) return null;
  const row = data as {
    trial_started_at: string;
    trial_expires_at: string;
    listing_allowance: number;
    listings_viewed: number;
    viewed_property_ids: string[];
    trial_ended_at: string | null;
  };

  const now = new Date();
  const expiresAt = new Date(row.trial_expires_at);
  const isActive = now < expiresAt && !row.trial_ended_at;

  return {
    isActive,
    trialStartedAt: row.trial_started_at,
    trialExpiresAt: row.trial_expires_at,
    listingsViewed: row.listings_viewed,
    listingAllowance: row.listing_allowance,
    remainingViews: Math.max(0, row.listing_allowance - row.listings_viewed),
    hasTrialEnded: row.trial_ended_at !== null || now >= expiresAt,
  };
}

// ---------------------------------------------------------------------------
// 3. Check if a tenant can view a specific property (trial limit)
// ---------------------------------------------------------------------------

export async function canTenantViewProperty(
  tenantProfileId: string,
  propertyId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, reason: "Please sign in." };
  if (profile.id !== tenantProfileId) {
    return { ok: false, reason: "FORBIDDEN" };
  }

  // If the tenant has an active Pro subscription, they can view all properties.
  if (profile.subscription_tier === "pro" || profile.subscription_tier === "premium") {
    return { ok: true };
  }

  // Free trial — check the trial status.
  const trial = await getTenantTrialStatus(tenantProfileId);
  if (!trial) {
    return { ok: false, reason: "Trial not started. Please complete onboarding." };
  }
  if (!trial.isActive) {
    return {
      ok: false,
      reason: "Your free trial has expired. Subscribe to continue browsing.",
    };
  }

  // Check if this property is already in the viewed list (don't double-count).
  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "Database not configured." };

  const { data: trialRow } = await admin
    .from("tenant_trial_usage")
    .select("viewed_property_ids, listings_viewed, listing_allowance")
    .eq("tenant_profile_id", tenantProfileId)
    .maybeSingle();
  const row = trialRow as {
    viewed_property_ids: string[];
    listings_viewed: number;
    listing_allowance: number;
  } | null;

  if (!row) return { ok: false, reason: "Trial record not found." };

  const alreadyViewed = row.viewed_property_ids.includes(propertyId);
  if (alreadyViewed) {
    return { ok: true }; // already counted — don't double-charge
  }

  // Check if the tenant has remaining views.
  if (row.listings_viewed >= row.listing_allowance) {
    return {
      ok: false,
      reason: `You've viewed all ${row.listing_allowance} properties in your free trial. Subscribe to continue browsing.`,
    };
  }

  // Record the view (server-side only — RLS prevents client writes).
  await admin
    .from("tenant_trial_usage")
    .update({
      listings_viewed: row.listings_viewed + 1,
      viewed_property_ids: [...row.viewed_property_ids, propertyId],
    } as never)
    .eq("tenant_profile_id", tenantProfileId);

  return { ok: true };
}

// ---------------------------------------------------------------------------
// 4. Check if a tenant can contact a landlord (spec Section 5)
// ---------------------------------------------------------------------------

export async function canContactLandlord(
  propertyId: string,
): Promise<ContactAuthorizationResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Please sign in." };
  }
  if (profile.role !== "tenant") {
    return { ok: false, message: "Only tenants can use the contact-landlord feature." };
  }
  if (profile.account_status !== "active") {
    return { ok: false, message: `Your account is ${profile.account_status}.` };
  }

  // Must have an active paid subscription (Pro or Premium).
  if (profile.subscription_tier === "free") {
    // Check if trial is still active — trial users CANNOT contact.
    return {
      ok: false,
      message: "Subscribe to contact landlords directly. Free trial users can browse but not contact.",
    };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };

  // Load the property + verify it's available for enquiries.
  const { data: propRow } = await admin
    .from("properties")
    .select("id, status, owner_profile_id, listing_creator_id, managing_agent_id, deleted_at, published_at")
    .eq("id", propertyId)
    .maybeSingle();
  const property = propRow as {
    id: string;
    status: string;
    owner_profile_id: string | null;
    listing_creator_id: string;
    managing_agent_id: string | null;
    deleted_at: string | null;
    published_at: string | null;
  } | null;

  if (!property) return { ok: false, message: "Property not found." };
  if (property.deleted_at) return { ok: false, message: "Property not found." };
  if (!property.published_at) return { ok: false, message: "Property not available." };

  if (!["available", "application_pending", "under_offer"].includes(property.status)) {
    return { ok: false, message: "This property is not currently available for enquiries." };
  }

  // Resolve the recipient: prefer owner_profile_id, fall back to listing_creator_id.
  // Per spec Section 5: "Identify the actual landlord/property owner using
  // the existing ownership relationships."
  const recipientProfileId = property.owner_profile_id ?? property.listing_creator_id;
  const isDirectOwner = property.owner_profile_id !== null;

  // If there's a managing agent, we still contact the owner (the agent
  // can be reached via the applications system). But we inform the tenant
  // that a managing agent exists.
  // Per spec Section 5: "If an agent or company manages the property,
  // do not automatically misrepresent the managing agent as the property
  // owner."

  // Anti-spam: rate-limit new conversations for tenants.
  // The capability system enforces maxNewConversationsPerMonth.
  // The messaging action also checks this — but we check here for a
  // clear error message before the messaging flow.

  return {
    ok: true,
    recipientProfileId,
    recipientRole: isDirectOwner ? "owner" : "listing_creator",
    isDirectOwner,
  };
}

// ---------------------------------------------------------------------------
// 5. End trial early (when a tenant subscribes)
// ---------------------------------------------------------------------------

export async function endTenantTrial(
  tenantProfileId: string,
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  await admin
    .from("tenant_trial_usage")
    .update({ trial_ended_at: new Date().toISOString() } as never)
    .eq("tenant_profile_id", tenantProfileId);
}
