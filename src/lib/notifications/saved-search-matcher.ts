/**
 * Saved-search matcher (spec Section 14, 15).
 *
 * When a newly published property matches a user's saved search:
 *   1. Identify matching saved searches.
 *   2. Verify the property is publicly eligible.
 *   3. Respect the user's saved-search capability.
 *   4. Generate an in-app notification via the dispatcher.
 *   5. Send email if the user's preference allows it.
 *   6. Prevent excessive duplicate notifications (idempotency).
 *
 * The matcher is invoked from:
 *   - Property publish action (immediate, when alert_level=instant).
 *   - A scheduled cron endpoint /api/cron/saved-search-matcher.
 *
 * Alert frequency (instant / daily / weekly / off):
 *   - Instant: matcher runs on publish and immediately dispatches.
 *   - Daily / Weekly: matcher records a property_alerts row with
 *     delivery_status='pending' for the digest worker. The worker
 *     (next prompt) batches them into a single digest email.
 *   - Off: matcher does nothing.
 *
 * The capability system gates who can have which frequency. The matcher
 * reads `saved_searches.alert_level` and trusts that value (it was set
 * by the application layer, which already enforced the capability check).
 */

import { createAdminClient } from "@/lib/db/supabase";
import { logger } from "@/lib/logging";
import { capabilitiesFor } from "@/lib/capabilities";
import { notificationService } from "./dispatcher";
import type { AlertLevel } from "@/types";

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

export interface MatcherResult {
  matchedSearches: number;
  dispatchedAlerts: number;
  pendingDigestAlerts: number;
  skipped: number;
}

/**
 * Run the matcher for a single newly-published property.
 *
 * Called from the property publish action (after status change to
 * "available"). Should NEVER throw — failures are logged and returned.
 */
export async function matchPropertyToSavedSearches(
  propertyId: string,
): Promise<MatcherResult> {
  const admin = createAdminClient();
  if (!admin) {
    return { matchedSearches: 0, dispatchedAlerts: 0, pendingDigestAlerts: 0, skipped: 0 };
  }

  // Load the property — only publicly available listings trigger alerts.
  const { data: propertyRow } = await admin
    .from("properties")
    .select(
      "id, title, transaction_type, price, price_frequency, status, property_type_id, owner_profile_id, bedrooms, bathrooms",
    )
    .eq("id", propertyId)
    .maybeSingle();
  const property = propertyRow as
    | {
        id: string;
        title: string;
        transaction_type: string;
        price: number;
        price_frequency: string | null;
        status: string;
        property_type_id: string | null;
        owner_profile_id: string;
        bedrooms: number;
        bathrooms: number;
      }
    | null;
  if (!property) {
    return { matchedSearches: 0, dispatchedAlerts: 0, pendingDigestAlerts: 0, skipped: 0 };
  }
  if (property.status !== "available") {
    return { matchedSearches: 0, dispatchedAlerts: 0, pendingDigestAlerts: 0, skipped: 0 };
  }

  // Load the property location for state/city/area matching.
  const { data: locationRow } = await admin
    .from("property_locations")
    .select("state, city, area, landmark")
    .eq("property_id", propertyId)
    .maybeSingle();
  const location = (locationRow as {
    state: string | null;
    city: string | null;
    area: string | null;
    landmark: string | null;
  } | null) ?? { state: null, city: null, area: null, landmark: null };

  // Find saved searches that potentially match.
  // We do a coarse filter at SQL level (active + matching transaction_type
  // when set), then refine in JS. This is more efficient than loading
  // every saved search.
  const { data: candidateSearches, error } = await admin
    .from("saved_searches")
    .select(
      "id, user_id, name, criteria, transaction_type, property_type_id, state, city, price_min, price_max, bedrooms_min, bedrooms_max, alert_level, last_matched_at",
    )
    .eq("is_active", true);
  if (error || !candidateSearches) {
    logger.error("saved-search matcher: failed to load searches", {
      error: error?.message,
    });
    return { matchedSearches: 0, dispatchedAlerts: 0, pendingDigestAlerts: 0, skipped: 0 };
  }

  let matchedSearches = 0;
  let dispatchedAlerts = 0;
  let pendingDigestAlerts = 0;
  let skipped = 0;

  for (const row of candidateSearches as Array<{
    id: string;
    user_id: string;
    name: string;
    criteria: Record<string, unknown>;
    transaction_type: string | null;
    property_type_id: string | null;
    state: string | null;
    city: string | null;
    price_min: number | null;
    price_max: number | null;
    bedrooms_min: number | null;
    bedrooms_max: number | null;
    alert_level: AlertLevel;
    last_matched_at: string | null;
  }>) {
    // Don't match the owner's own saved searches against their own property.
    if (row.user_id === property.owner_profile_id) {
      skipped += 1;
      continue;
    }

    // Coarse match on transaction type.
    if (row.transaction_type && row.transaction_type !== property.transaction_type) {
      continue;
    }
    // Property type.
    if (row.property_type_id && row.property_type_id !== property.property_type_id) {
      continue;
    }
    // Location.
    if (row.state && row.state !== location.state) continue;
    if (row.city && row.city !== location.city) continue;
    // Price.
    if (row.price_min !== null && property.price < row.price_min) continue;
    if (row.price_max !== null && property.price > row.price_max) continue;
    // Bedrooms.
    if (row.bedrooms_min !== null && property.bedrooms < row.bedrooms_min) continue;
    if (row.bedrooms_max !== null && property.bedrooms > row.bedrooms_max) continue;

    matchedSearches += 1;

    // Verify the user's plan still allows this alert level.
    const { data: profileRow } = await admin
      .from("profiles")
      .select("role, subscription_tier")
      .eq("id", row.user_id)
      .maybeSingle();
    const profile = profileRow as
      | { role: "landlord" | "agent" | "company"; subscription_tier: "free" | "pro" | "premium" }
      | null;
    if (!profile) {
      skipped += 1;
      continue;
    }
    const caps = capabilitiesFor(profile.role, profile.subscription_tier);
    // Downgrade the alert level to the user's plan cap.
    const effectiveLevel = capAlertLevel(row.alert_level, caps.alertLevel);
    if (effectiveLevel === "off") {
      skipped += 1;
      continue;
    }

    // Create the property_alerts row (UNIQUE on (saved_search_id, property_id, alert_type)).
    // On conflict, the row already exists — skip.
    const { error: alertInsertError } = await admin
      .from("property_alerts")
      .insert({
        user_id: row.user_id,
        saved_search_id: row.id,
        property_id: property.id,
        alert_type: "new_match",
        delivery_status: "pending",
      } as never)
      .select("id")
      .maybeSingle();
    if (alertInsertError) {
      // Likely a unique violation — the alert already exists. Skip.
      skipped += 1;
      continue;
    }

    // For instant alerts, dispatch immediately.
    if (effectiveLevel === "instant" || effectiveLevel === "priority") {
      const eventKey = `saved_search.match:${row.id}:${property.id}`;
      await notificationService.dispatch({
        recipientId: row.user_id,
        type: "saved_search.match",
        title: `New match for "${row.name}"`,
        body: `${property.title} — ${location.city ?? ""}, ${location.state ?? ""}`.trim(),
        href: `/properties/${property.id}`,
        relatedEntityType: "property",
        relatedEntityId: property.id,
        eventKey,
        metadata: {
          savedSearchId: row.id,
          savedSearchName: row.name,
          propertyId: property.id,
          propertyTitle: property.title,
          price: property.price,
          priceFrequency: property.price_frequency,
          location: {
            state: location.state,
            city: location.city,
            area: location.area,
          },
        },
        emailTemplateInput: {
          searchName: row.name,
          propertyTitle: property.title,
          propertyLocation: `${location.area ?? location.city ?? ""}, ${location.state ?? ""}`.trim().replace(/^,\s*/, ""),
          priceDisplay: formatPrice(property.price, property.price_frequency),
          propertyId: property.id,
        },
      });
      dispatchedAlerts += 1;
    } else {
      // Daily / weekly — leave the property_alerts row for the digest
      // worker. The worker (next prompt) batches them.
      pendingDigestAlerts += 1;
    }

    // Update last_matched_at on the saved search.
    await admin
      .from("saved_searches")
      .update({ last_matched_at: new Date().toISOString() } as never)
      .eq("id", row.id);
  }

  return { matchedSearches, dispatchedAlerts, pendingDigestAlerts, skipped };
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------
function capAlertLevel(
  userLevel: AlertLevel,
  capLevel: AlertLevel,
): AlertLevel {
  const ORDER: AlertLevel[] = ["off", "basic", "advanced", "instant", "priority"];
  const userIdx = ORDER.indexOf(userLevel);
  const capIdx = ORDER.indexOf(capLevel);
  // If the user's setting exceeds their plan cap, downgrade to the cap.
  if (userIdx > capIdx) {
    return capLevel;
  }
  return userLevel;
}

function formatPrice(priceMinor: number, frequency: string | null): string {
  const naira = priceMinor / 100;
  const formatted = `₦${naira.toLocaleString("en-NG")}`;
  if (frequency === "monthly" || frequency === "yearly") {
    return `${formatted} / ${frequency === "monthly" ? "mo" : "yr"}`;
  }
  return formatted;
}
