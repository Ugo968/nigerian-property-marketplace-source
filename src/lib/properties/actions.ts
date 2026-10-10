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
import { checkTitleQuality, sanitizeDescription } from "./anti-spam";
import { canTransition } from "./status-machine";
import { fullPropertyPublishSchema } from "./validation";
import { notificationService } from "@/lib/notifications";
import { matchPropertyToSavedSearches } from "@/lib/notifications";
import type {
  ProfileRow,
  PropertyRow,
  PropertyTypeRow,
} from "@/types";
import type { ListingStatus } from "@/types";

/**
 * Property CRUD server actions.
 *
 * Per spec Sections 22, 23, 26, 29, 40:
 *   * Only landlords + companies can create listings (agents apply, don't create)
 *   * Owners + managing agents + authorised company staff can edit
 *   * Ownership is immutable from the client (the 3-column model:
 *     owner_profile_id / listing_creator_id / managing_agent_id)
 *   * Drafts are private (RLS enforces — see migration 0005)
 *   * Publishing requires server-side validation of all required fields
 *   * Status changes are gated by the status-machine
 *   * Subscription limits are enforced server-side via the capability system
 */

export type PropertyActionResult =
  | { ok: true; propertyId?: string; redirectTo?: string }
  | { ok: false; fieldErrors?: Record<string, string[]>; message?: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the caller's role for status-machine purposes.
 * "owner" if the caller is the property owner or listing_creator or
 * managing_agent. "admin" if the caller is an admin (separate concern).
 *
 * Throws if the caller is not authorised to manage the property at all.
 */
async function getActorRole(
  property: Pick<PropertyRow, "owner_profile_id" | "listing_creator_id" | "managing_agent_id">,
  callerProfileId: string,
): Promise<"owner" | "company_staff" | "agent" | null> {
  if (property.owner_profile_id === callerProfileId) return "owner";
  if (property.listing_creator_id === callerProfileId) return "owner";
  if (property.managing_agent_id === callerProfileId) return "agent";
  // Company staff: TODO when team accounts are implemented (P16).
  // For now, only the listing creator or owner can manage.
  return null;
}

/**
 * Verifies the caller is signed in + has completed onboarding + is active.
 * Returns the profile row. Throws (redirects) otherwise.
 */
async function requireListerProfile(): Promise<ProfileRow> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error("UNAUTHORIZED");
  }
  if (profile.account_status === "banned") {
    throw new Error("BANNED");
  }
  if (profile.account_status === "suspended") {
    throw new Error("SUSPENDED");
  }
  if (profile.account_status === "deactivated") {
    throw new Error("DEACTIVATED");
  }
  if (!profile.onboarding_completed) {
    throw new Error("ONBOARDING_INCOMPLETE");
  }
  return profile;
}

// ---------------------------------------------------------------------------
// CREATE — starts a new draft
// ---------------------------------------------------------------------------

export async function createPropertyDraft(input: {
  propertyTypeId: string;
  transactionType: "rent" | "sale" | "shortlet";
}): Promise<PropertyActionResult> {
  let profile: ProfileRow;
  try {
    profile = await requireListerProfile();
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNAUTHORIZED";
    return { ok: false, message };
  }

  // Only landlords + companies can create listings (agents apply to
  // represent — they don't create). Per spec Section 3 + capability matrix.
  const caps = capabilitiesFor(profile.role, profile.subscription_tier);
  if (caps.maxListingsPerMonth === 0) {
    return {
      ok: false,
      message: `${profile.role === "agent" ? "Agents" : "You"} cannot create property listings directly. Agents apply to represent existing listings.`,
    };
  }

  // Rate-limit
  const rl = await rateLimiter.check({
    key: profile.user_id,
    action: "property_create",
    limit: 20,
    windowMs: 60 * 60 * 1000, // 20 / hour
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many listings created. Try again later." };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Verify the property type exists + is active
  const { data: propertyType } = await supabase
    .from("property_types")
    .select("id, is_active")
    .eq("id", input.propertyTypeId)
    .maybeSingle();
  if (!propertyType || !(propertyType as { is_active: boolean }).is_active) {
    return { ok: false, fieldErrors: { propertyTypeId: ["Invalid property type"] } };
  }

  // Check subscription listing limit (count listings created THIS MONTH)
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("listing_creator_id", profile.id)
    .gte("created_at", monthStart.toISOString())
    .neq("status", "removed");

  const currentMonthCount = count ?? 0;
  if (
    caps.maxListingsPerMonth !== null &&
    currentMonthCount >= caps.maxListingsPerMonth
  ) {
    return {
      ok: false,
      message: `You've reached your monthly listing limit (${caps.maxListingsPerMonth} listings/month on your ${profile.subscription_tier} plan). Upgrade to create more listings.`,
    };
  }

  // Insert the draft
  const { data: draft, error } = await supabase
    .from("properties")
    .insert({
      owner_profile_id: profile.id, // landlord/company owns it themselves
      listing_creator_id: profile.id,
      title: "Untitled draft", // placeholder — user updates in step 3
      description: null,
      property_type_id: input.propertyTypeId,
      transaction_type: input.transactionType,
      price: 0,
      price_frequency: input.transactionType === "sale" ? "one_off" : null,
      currency: "NGN",
      status: "draft",
      furnished_status: "not_applicable",
    })
    .select("id")
    .single();

  if (error || !draft) {
    logger.error("Property draft creation failed", {
      userId: profile.user_id,
      error: error?.message,
    });
    return { ok: false, message: "We couldn't create the draft. Please try again." };
  }

  // Audit log
  const admin = createAdminClient();
  if (admin) {
    await admin.from("audit_logs").insert({
      actor_id: profile.user_id,
      action: "property.create_draft",
      target_type: "property",
      target_id: (draft as { id: string }).id,
      metadata: {
        property_type_id: input.propertyTypeId,
        transaction_type: input.transactionType,
      },
    });
  }

  revalidatePath("/dashboard/properties", "page");
  return {
    ok: true,
    propertyId: (draft as { id: string }).id,
    redirectTo: `/dashboard/properties/${(draft as { id: string }).id}/edit`,
  };
}

// ---------------------------------------------------------------------------
// UPDATE — save step data (wizard step)
// ---------------------------------------------------------------------------

export async function updatePropertyStep(input: {
  propertyId: string;
  // Per-step data — each step saves independently
  step:
    | "basic_details"
    | "pricing"
    | "location"
    | "features"
    | "description"
    | "media_reorder";
  data: Record<string, unknown>;
}): Promise<PropertyActionResult> {
  let profile: ProfileRow;
  try {
    profile = await requireListerProfile();
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNAUTHORIZED";
    return { ok: false, message };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Fetch the property + verify ownership
  const { data: propRow } = await supabase
    .from("properties")
    .select("id, owner_profile_id, listing_creator_id, managing_agent_id, status")
    .eq("id", input.propertyId)
    .maybeSingle();
  if (!propRow) {
    return { ok: false, message: "Property not found." };
  }

  const prop = propRow as {
    id: string;
    owner_profile_id: string | null;
    listing_creator_id: string;
    managing_agent_id: string | null;
    status: string;
  };

  const actor = await getActorRole(prop, profile.id);
  if (!actor) {
    return { ok: false, message: "FORBIDDEN" };
  }

  // Cannot edit a removed property
  if (prop.status === "removed") {
    return {
      ok: false,
      message: "This listing has been removed and cannot be edited.",
    };
  }

  // Build the update payload from the step data
  const updates: Record<string, unknown> = {};
  const locationUpdates: Record<string, unknown> = {};

  switch (input.step) {
    case "basic_details": {
      const d = input.data as {
        title?: string;
        bedrooms?: number;
        bathrooms?: number;
        toilets?: number;
        yearBuilt?: number;
        parkingSpaces?: number;
        floors?: number;
      };
      if (d.title !== undefined) {
        const quality = checkTitleQuality(d.title);
        updates.title = d.title;
        updates.title_quality = quality.quality;
      }
      if (d.bedrooms !== undefined) updates.bedrooms = d.bedrooms;
      if (d.bathrooms !== undefined) updates.bathrooms = d.bathrooms;
      if (d.toilets !== undefined) updates.toilets = d.toilets;
      if (d.yearBuilt !== undefined) updates.year_built = d.yearBuilt;
      if (d.parkingSpaces !== undefined) updates.parking_spaces = d.parkingSpaces;
      if (d.floors !== undefined) updates.floors = d.floors;
      break;
    }
    case "pricing": {
      const d = input.data as {
        price?: number;
        currency?: "NGN" | "USD";
        priceFrequency?: string | null;
      };
      if (d.price !== undefined) updates.price = d.price;
      if (d.currency !== undefined) updates.currency = d.currency;
      if (d.priceFrequency !== undefined)
        updates.price_frequency = d.priceFrequency;
      break;
    }
    case "location": {
      const d = input.data as {
        country?: string;
        state?: string;
        city?: string;
        area?: string;
        landmark?: string;
        addressLine?: string;
        addressLga?: string;
        privateLat?: number;
        privateLng?: number;
        // Computed public coords (rounded to ~100m)
        publicLat?: number;
        publicLng?: number;
      };
      Object.assign(locationUpdates, d);
      // Map camelCase to snake_case for DB
      if (d.addressLine !== undefined) {
        locationUpdates.address_line = d.addressLine;
        delete (locationUpdates as Record<string, unknown>).addressLine;
      }
      if (d.addressLga !== undefined) {
        locationUpdates.address_lga = d.addressLga;
        delete (locationUpdates as Record<string, unknown>).addressLga;
      }
      if (d.privateLat !== undefined) locationUpdates.private_lat = d.privateLat;
      if (d.privateLng !== undefined) locationUpdates.private_lng = d.privateLng;
      if (d.publicLat !== undefined) locationUpdates.public_lat = d.publicLat;
      if (d.publicLng !== undefined) locationUpdates.public_lng = d.publicLng;
      break;
    }
    case "features": {
      const d = input.data as {
        furnishedStatus?: string;
        sizeValue?: number;
        sizeUnit?: string;
        amenityIds?: string[];
      };
      if (d.furnishedStatus !== undefined)
        updates.furnished_status = d.furnishedStatus;
      if (d.sizeValue !== undefined) updates.size_value = d.sizeValue;
      if (d.sizeUnit !== undefined) updates.size_unit = d.sizeUnit;
      // Amenities handled separately below
      if (d.amenityIds) {
        // Delete existing + insert new (upsert pattern)
        await supabase
          .from("property_amenities")
          .delete()
          .eq("property_id", input.propertyId);
        if (d.amenityIds.length > 0) {
          const rows = d.amenityIds.map((amenityId) => ({
            property_id: input.propertyId,
            amenity_id: amenityId,
          }));
          await supabase.from("property_amenities").insert(rows);
        }
      }
      break;
    }
    case "description": {
      const d = input.data as { description?: string };
      if (d.description !== undefined) {
        updates.description = d.description ? sanitizeDescription(d.description) : null;
      }
      break;
    }
  }

  // Update the properties row
  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await supabase
      .from("properties")
      .update(updates)
      .eq("id", input.propertyId);
    if (updateError) {
      logger.error("Property step update failed", {
        propertyId: input.propertyId,
        step: input.step,
        error: updateError.message,
      });
      return { ok: false, message: "We couldn't save your changes." };
    }
  }

  // Update property_locations (upsert)
  if (Object.keys(locationUpdates).length > 0) {
    const { error: locError } = await supabase
      .from("property_locations")
      .upsert({
        property_id: input.propertyId,
        ...locationUpdates,
      });
    if (locError) {
      logger.error("Property location update failed", {
        propertyId: input.propertyId,
        error: locError.message,
      });
      return { ok: false, message: "We couldn't save the location." };
    }
  }

  revalidatePath("/dashboard/properties", "page");
  revalidatePath(`/dashboard/properties/${input.propertyId}/edit`, "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// PUBLISH — server-side validation + status transition
// ---------------------------------------------------------------------------

export async function publishProperty(propertyId: string): Promise<PropertyActionResult> {
  let profile: ProfileRow;
  try {
    profile = await requireListerProfile();
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNAUTHORIZED";
    return { ok: false, message };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Fetch property + location + amenities + media count
  const { data: propRow } = await supabase
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .maybeSingle();
  if (!propRow) {
    return { ok: false, message: "Property not found." };
  }
  const property = propRow as PropertyRow;

  const actor = await getActorRole(property, profile.id);
  if (!actor) {
    return { ok: false, message: "FORBIDDEN" };
  }

  // Status check: can only publish from 'draft' or 'unavailable' state
  if (property.status !== "draft" && property.status !== "unavailable") {
    return {
      ok: false,
      message: `Cannot publish a property in status "${property.status}".`,
    };
  }

  // Fetch location
  const { data: locationRow } = await supabase
    .from("property_locations")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle();

  // Fetch amenities
  const { data: amenityRows } = await supabase
    .from("property_amenities")
    .select("amenity_id")
    .eq("property_id", propertyId);
  const amenityIds = (amenityRows ?? []).map((r: { amenity_id: string }) => r.amenity_id);

  // Fetch media count
  const { count: photoCount } = await supabase
    .from("property_media")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId)
    .eq("media_type", "image");

  // Validate the FULL payload
  const fullPayload = {
    title: property.title,
    description: property.description ?? "",
    propertyTypeId: property.property_type_id,
    transactionType: property.transaction_type,
    price: property.price,
    currency: property.currency,
    priceFrequency: property.price_frequency,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    toilets: property.toilets,
    yearBuilt: property.year_built ?? undefined,
    parkingSpaces: property.parking_spaces ?? 0,
    floors: property.floors ?? undefined,
    furnishedStatus: property.furnished_status,
    sizeValue: property.size_value ?? undefined,
    sizeUnit: property.size_unit ?? undefined,
    country: locationRow?.country ?? "Nigeria",
    state: locationRow?.state ?? "",
    city: locationRow?.city ?? "",
    area: locationRow?.area ?? "",
    landmark: locationRow?.landmark ?? "",
    addressLine: locationRow?.address_line ?? "",
    addressLga: locationRow?.address_lga ?? "",
    privateLat: locationRow?.private_lat ?? undefined,
    privateLng: locationRow?.private_lng ?? undefined,
    amenityIds,
  };

  const parsed = fullPropertyPublishSchema.safeParse(fullPayload);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
      message: "Cannot publish — some fields are missing or invalid.",
    };
  }

  // Verify at least 1 photo (minimum required media)
  if (!photoCount || photoCount < 1) {
    return {
      ok: false,
      message: "At least one photo is required before publishing.",
    };
  }

  // Verify listing title isn't flagged as severe spam
  if (property.title_quality === "spam_pattern") {
    return {
      ok: false,
      message:
        "This listing's title has been flagged as potential spam. Edit the title and remove any promotional language before publishing.",
    };
  }

  // Authorise the status transition
  if (!canTransition(property.status, "available", actor === "agent" ? "agent" : "owner")) {
    return {
      ok: false,
      message: "You're not authorised to publish this property.",
    };
  }

  // Atomic update: status → available, published_at → now
  const { error: publishError } = await supabase
    .from("properties")
    .update({
      status: "available",
      published_at: new Date().toISOString(),
    })
    .eq("id", propertyId);

  if (publishError) {
    logger.error("Property publish failed", {
      propertyId,
      error: publishError.message,
    });
    return { ok: false, message: "We couldn't publish the listing." };
  }

  // Audit log
  const admin = createAdminClient();
  if (admin) {
    await admin.from("audit_logs").insert({
      actor_id: profile.user_id,
      action: "property.publish",
      target_type: "property",
      target_id: propertyId,
      metadata: { previous_status: property.status, new_status: "available" },
    });
  }

  // Notify the property owner/listing creator (spec Section 29).
  await notificationService.dispatch({
    recipientId: profile.id,
    type: "property.published",
    title: `Property published — ${property.title}`,
    body: `Your property "${property.title}" is now live and visible to the public.`,
    href: `/properties/${propertyId}`,
    relatedEntityType: "property",
    relatedEntityId: propertyId,
    eventKey: `property.published:${propertyId}`,
    metadata: { propertyId, propertyTitle: property.title, previousStatus: property.status },
  });

  // Best-effort: run the saved-search matcher for the newly published
  // property. Spec Section 14. Failures here don't block the publish.
  try {
    await matchPropertyToSavedSearches(propertyId);
  } catch (err) {
    logger.warn("saved-search matcher failed", {
      propertyId,
      error: err instanceof Error ? err.message : "unknown",
    });
  }

  revalidatePath("/dashboard/properties", "page");
  revalidatePath(`/properties/${propertyId}`, "page");
  return {
    ok: true,
    redirectTo: `/properties/${propertyId}`,
  };
}

// ---------------------------------------------------------------------------
// STATUS TRANSITION — generic
// ---------------------------------------------------------------------------

export async function changePropertyStatus(
  propertyId: string,
  newStatus: ListingStatus,
): Promise<PropertyActionResult> {
  let profile: ProfileRow;
  try {
    profile = await requireListerProfile();
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNAUTHORIZED";
    return { ok: false, message };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  const { data: propRow } = await supabase
    .from("properties")
    .select("id, owner_profile_id, listing_creator_id, managing_agent_id, status, deleted_at")
    .eq("id", propertyId)
    .maybeSingle();
  if (!propRow) {
    return { ok: false, message: "Property not found." };
  }
  const prop = propRow as {
    id: string;
    owner_profile_id: string | null;
    listing_creator_id: string;
    managing_agent_id: string | null;
    status: ListingStatus;
    deleted_at: string | null;
  };

  if (prop.deleted_at) {
    return { ok: false, message: "This property has been removed." };
  }

  const actor = await getActorRole(prop, profile.id);
  if (!actor) {
    return { ok: false, message: "FORBIDDEN" };
  }

  // Status transitions to "suspended" or restoring from "removed"/"suspended"
  // require admin — block here.
  const actorForMachine: "owner" | "agent" | "admin" =
    actor === "agent" ? "agent" : "owner";
  if (!canTransition(prop.status, newStatus, actorForMachine)) {
    // If the user is an admin (via requireAdmin), allow admin-level transitions.
    // For now, return forbidden.
    return {
      ok: false,
      message: `Cannot change status from "${prop.status}" to "${newStatus}".`,
    };
  }

  const updatePayload: Record<string, unknown> = { status: newStatus };
  if (newStatus === "removed") {
    updatePayload.deleted_at = new Date().toISOString();
  }
  if (newStatus === "available" && prop.status === "draft") {
    updatePayload.published_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from("properties")
    .update(updatePayload)
    .eq("id", propertyId);

  if (updateError) {
    logger.error("Property status change failed", {
      propertyId,
      error: updateError.message,
    });
    return { ok: false, message: "We couldn't change the status." };
  }

  // Audit log
  const admin = createAdminClient();
  if (admin) {
    await admin.from("audit_logs").insert({
      actor_id: profile.user_id,
      action: "property.status_change",
      target_type: "property",
      target_id: propertyId,
      metadata: { previous_status: prop.status, new_status: newStatus },
    });
  }

  // Notify the owner/listing creator of the status change (spec Section 29).
  // Only the property-related statuses produce notifications here.
  const notifyTypes: Record<string, string> = {
    rented: "property.rented",
    sold: "property.sold",
    under_offer: "property.under_offer",
    unavailable: "property.unavailable",
    removed: "property.removed",
    suspended: "property.unavailable",
  };
  const notifyType = notifyTypes[newStatus];
  if (notifyType) {
    await notificationService.dispatch({
      recipientId: profile.id,
      type: notifyType,
      title: `Property status changed to ${newStatus.replace(/_/g, " ")}`,
      body: `Your property is now ${newStatus.replace(/_/g, " ")}. Previous status: ${prop.status}.`,
      href: `/dashboard/properties`,
      relatedEntityType: "property",
      relatedEntityId: propertyId,
      eventKey: `property.status_change:${propertyId}:${newStatus}:${Date.now()}`,
      metadata: {
        propertyId,
        previousStatus: prop.status,
        newStatus,
      },
    });
  }

  revalidatePath("/dashboard/properties", "page");
  revalidatePath(`/properties/${propertyId}`, "page");
  return { ok: true };
}

// Convenience wrappers for the dashboard action menu
export async function unpublishProperty(propertyId: string) {
  return changePropertyStatus(propertyId, "unavailable");
}
export async function markPropertyRented(propertyId: string) {
  return changePropertyStatus(propertyId, "rented");
}
export async function markPropertySold(propertyId: string) {
  return changePropertyStatus(propertyId, "sold");
}
export async function markPropertyUnavailable(propertyId: string) {
  return changePropertyStatus(propertyId, "unavailable");
}
export async function removeProperty(propertyId: string) {
  return changePropertyStatus(propertyId, "removed");
}
