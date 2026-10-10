"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerClient, createAdminClient } from "@/lib/db/supabase";
import {
  getCurrentUser,
  getCurrentProfile,
} from "@/lib/auth/server";
import { capabilitiesFor } from "@/lib/capabilities";
import { rateLimiter, RATE_LIMITS } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging";
import type { ProfileRow } from "@/types";
import type { SearchParams } from "./params";
import { serialiseSearchParams } from "./params";

/**
 * Saved-property + saved-search server actions.
 *
 * Per spec Sections 21, 22, 23, 24, 25, 26, 28, 35:
 *   * Users can save/unsave properties (UNIQUE constraint prevents duplicates)
 *   * Users can create / edit / delete saved searches
 *   * Limits enforced via capability system — when at limit, show upgrade
 *     prompt, NEVER delete existing saves
 *   * Identity derived from server-side session, never client-supplied userId
 *   * Rate-limited per user
 *   * RLS enforces cross-user isolation (migration 0008)
 */

export type SavedActionResult =
  | { ok: true; saved?: boolean; redirectTo?: string }
  | { ok: false; message?: string; limitReached?: boolean; requiresAuth?: boolean };

// ---------------------------------------------------------------------------
// SAVE / UNSAVE PROPERTY
// ---------------------------------------------------------------------------

export async function toggleSavedProperty(propertyId: string): Promise<SavedActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      requiresAuth: true,
      message: "Please sign in to save properties.",
    };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, requiresAuth: true };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Check if already saved
  const { data: existing } = await supabase
    .from("saved_properties")
    .select("id")
    .eq("user_id", profile.id)
    .eq("property_id", propertyId)
    .maybeSingle();

  if (existing) {
    // Unsave
    const { error } = await supabase
      .from("saved_properties")
      .delete()
      .eq("user_id", profile.id)
      .eq("property_id", propertyId);
    if (error) {
      logger.error("Unsave property failed", {
        userId: user.id,
        propertyId,
        error: error.message,
      });
      return { ok: false, message: "We couldn't remove the save." };
    }
    revalidatePath("/dashboard/saved", "page");
    return { ok: true, saved: false };
  }

  // Check capability limit before saving
  const caps = capabilitiesFor(profile.role, profile.subscription_tier);
  if (caps.maxSavedProperties !== null) {
    const { count } = await supabase
      .from("saved_properties")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id);
    if ((count ?? 0) >= caps.maxSavedProperties) {
      return {
        ok: false,
        limitReached: true,
        message: `You've reached your ${caps.maxSavedProperties} saved-property limit on the ${profile.subscription_tier} plan. Upgrade to save more.`,
      };
    }
  }

  // Rate-limit
  const rl = await rateLimiter.check({
    key: user.id,
    action: "save_property",
    limit: 30,
    windowMs: 60 * 60 * 1000, // 30 saves / hour
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many actions. Try again later." };
  }

  // Save
  const { error } = await supabase.from("saved_properties").insert({
    user_id: profile.id,
    property_id: propertyId,
  });
  if (error) {
    // UNIQUE constraint violation = already saved (race condition) — return ok
    if (error.code === "23505") {
      return { ok: true, saved: true };
    }
    logger.error("Save property failed", {
      userId: user.id,
      propertyId,
      error: error.message,
    });
    return { ok: false, message: "We couldn't save the property." };
  }

  revalidatePath("/dashboard/saved", "page");
  revalidatePath("/properties", "page");
  return { ok: true, saved: true };
}

// ---------------------------------------------------------------------------
// SAVED SEARCH CRUD
// ---------------------------------------------------------------------------

export async function createSavedSearch(input: {
  name: string;
  criteria: SearchParams;
}): Promise<SavedActionResult & { savedSearchId?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, requiresAuth: true, message: "Please sign in." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, requiresAuth: true };
  }

  // Validate name
  const trimmedName = input.name.trim();
  if (trimmedName.length < 3 || trimmedName.length > 80) {
    return {
      ok: false,
      message: "Search name must be 3–80 characters.",
    };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Capability check
  const caps = capabilitiesFor(profile.role, profile.subscription_tier);
  if (caps.maxSavedSearches !== null) {
    const { count } = await supabase
      .from("saved_searches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id);
    if ((count ?? 0) >= caps.maxSavedSearches) {
      return {
        ok: false,
        limitReached: true,
        message: `You've reached your ${caps.maxSavedSearches} saved-search limit on the ${profile.subscription_tier} plan.`,
      };
    }
  }

  // Rate-limit
  const rl = await rateLimiter.check({
    key: user.id,
    action: "save_search",
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many actions. Try again later." };
  }

  // Derive structural columns from criteria for indexing
  const criteria = input.criteria;
  const insertPayload = {
    user_id: profile.id,
    name: trimmedName,
    criteria: criteria as unknown as Record<string, unknown>,
    transaction_type: criteria.transaction ?? null,
    property_type_id: criteria.propertyType ?? null, // will be resolved by FK if UUID; for slugs we store null + lookup in criteria
    state: criteria.state ?? null,
    city: criteria.city ?? null,
    price_min: criteria.minPrice ?? null,
    price_max: criteria.maxPrice ?? null,
    bedrooms_min: criteria.bedroomsMin ?? null,
    bedrooms_max: null,
    is_active: true,
    alert_level: profile.subscription_tier === "premium" ? "priority" : "basic",
  };

  const { data, error } = await supabase
    .from("saved_searches")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    logger.error("Saved search create failed", {
      userId: user.id,
      error: error.message,
    });
    return { ok: false, message: "We couldn't save your search." };
  }

  revalidatePath("/dashboard/alerts", "page");
  return { ok: true, savedSearchId: (data as { id: string }).id };
}

export async function renameSavedSearch(input: {
  savedSearchId: string;
  name: string;
}): Promise<SavedActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const trimmedName = input.name.trim();
  if (trimmedName.length < 3 || trimmedName.length > 80) {
    return { ok: false, message: "Search name must be 3–80 characters." };
  }

  const supabase = await createServerClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { error } = await supabase
    .from("saved_searches")
    .update({ name: trimmedName })
    .eq("id", input.savedSearchId)
    .eq("user_id", profile.id);

  if (error) {
    return { ok: false, message: "We couldn't rename the search." };
  }

  revalidatePath("/dashboard/alerts", "page");
  return { ok: true };
}

export async function deleteSavedSearch(savedSearchId: string): Promise<SavedActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const supabase = await createServerClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { error } = await supabase
    .from("saved_searches")
    .delete()
    .eq("id", savedSearchId)
    .eq("user_id", profile.id);

  if (error) {
    return { ok: false, message: "We couldn't delete the search." };
  }

  revalidatePath("/dashboard/alerts", "page");
  return { ok: true };
}

export async function toggleSavedSearchActive(savedSearchId: string): Promise<SavedActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const supabase = await createServerClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  // Fetch current state
  const { data: row } = await supabase
    .from("saved_searches")
    .select("is_active")
    .eq("id", savedSearchId)
    .eq("user_id", profile.id)
    .maybeSingle();
  if (!row) return { ok: false, message: "Search not found." };

  const current = (row as { is_active: boolean }).is_active;
  const { error } = await supabase
    .from("saved_searches")
    .update({ is_active: !current })
    .eq("id", savedSearchId)
    .eq("user_id", profile.id);

  if (error) {
    return { ok: false, message: "We couldn't update the search." };
  }

  revalidatePath("/dashboard/alerts", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// FETCH HELPERS — used by Server Components
// ---------------------------------------------------------------------------

/**
 * Returns the IDs of properties the caller has saved. Used by the search
 * page to mark cards with a heart state.
 */
export async function getSavedPropertyIds(): Promise<Set<string>> {
  const profile = await getCurrentProfile();
  if (!profile) return new Set();

  const supabase = await createServerClient();
  if (!supabase) return new Set();

  const { data } = await supabase
    .from("saved_properties")
    .select("property_id")
    .eq("user_id", profile.id);

  if (!data) return new Set();
  return new Set((data as Array<{ property_id: string }>).map((r) => r.property_id));
}

/**
 * Returns the caller's saved searches (for /dashboard/alerts).
 */
export async function getSavedSearches() {
  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = await createServerClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("saved_searches")
    .select("id, name, criteria, is_active, alert_level, last_matched_at, created_at, updated_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  return (data ?? []) as Array<{
    id: string;
    name: string;
    criteria: Record<string, unknown>;
    is_active: boolean;
    alert_level: string;
    last_matched_at: string | null;
    created_at: string;
    updated_at: string;
  }>;
}
