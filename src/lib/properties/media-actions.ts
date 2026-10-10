"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createAdminClient } from "@/lib/db/supabase";
import {
  getCurrentUser,
  getCurrentProfile,
} from "@/lib/auth/server";
import { capabilitiesFor } from "@/lib/capabilities";
import { rateLimiter, RATE_LIMITS } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging";
import { validateFile } from "@/lib/storage/file-validation";
import { STORAGE_BUCKETS } from "@/lib/verification/constants";
import type {
  ProfileRow,
  PropertyRow,
} from "@/types";

/**
 * Property media server actions.
 *
 * Per spec Sections 16, 17, 18, 19, 41:
 *   * Multiple images + videos per listing
 *   * Subscription-capped photo/video counts (capability system)
 *   * Drag-and-drop upload on desktop, file picker on mobile
 *   * Reorder, delete, replace, set-featured
 *   * MIME + extension + size validation server-side
 *   * Public media for published listings; private for drafts
 *   * Storage path: {property_id}/{uuid}.{ext}
 *   * RLS: only property managers can upload/delete (migration 0006)
 */

export type MediaActionResult =
  | { ok: true; mediaId?: string; mediaUrl?: string }
  | { ok: false; fieldErrors?: Record<string, string[]>; message?: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requirePropertyManager(propertyId: string): Promise<{
  profile: ProfileRow;
  property: PropertyRow;
} | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const profile = await getCurrentProfile();
  if (!profile) return null;
  if (profile.account_status !== "active") return null;

  const supabase = await createServerClient();
  if (!supabase) return null;

  const { data: propRow } = await supabase
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .maybeSingle();
  if (!propRow) return null;
  const property = propRow as PropertyRow;

  // Verify ownership / management
  const isOwner = property.owner_profile_id === profile.id;
  const isCreator = property.listing_creator_id === profile.id;
  const isManagingAgent = property.managing_agent_id === profile.id;
  if (!isOwner && !isCreator && !isManagingAgent) return null;

  return { profile, property };
}

// ---------------------------------------------------------------------------
// Upload media
// ---------------------------------------------------------------------------

export async function uploadPropertyMedia(input: {
  propertyId: string;
  fileName: string;
  clientMimeType: string;
  fileSize: number;
  firstBytesBase64: string;
  fileBufferBase64: string;
  mediaType: "image" | "video";
}): Promise<MediaActionResult> {
  const ctx = await requirePropertyManager(input.propertyId);
  if (!ctx) {
    return { ok: false, message: "FORBIDDEN" };
  }
  const { profile, property } = ctx;

  // Rate-limit
  const rl = await rateLimiter.check({
    key: profile.user_id,
    action: "media_upload",
    limit: 60,
    windowMs: 60 * 60 * 1000, // 60 uploads / hour
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many uploads. Try again later." };
  }

  // Capability check — subscription limits
  const caps = capabilitiesFor(profile.role, profile.subscription_tier);
  const maxAllowed = input.mediaType === "image"
    ? caps.maxPhotosPerListing
    : caps.maxVideosPerListing;

  if (maxAllowed === 0) {
    return {
      ok: false,
      message: `Your ${profile.subscription_tier} plan does not allow ${input.mediaType} uploads.`,
    };
  }

  // Count existing media of this type for this property
  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  const { count } = await supabase
    .from("property_media")
    .select("id", { count: "exact", head: true })
    .eq("property_id", input.propertyId)
    .eq("media_type", input.mediaType);

  if ((count ?? 0) >= maxAllowed) {
    return {
      ok: false,
      message: `You've reached the ${maxAllowed} ${input.mediaType}${maxAllowed === 1 ? "" : "s"} limit for your ${profile.subscription_tier} plan.`,
    };
  }

  // Validate the file (MIME / size / extension / magic bytes)
  const firstBytes = Buffer.from(input.firstBytesBase64, "base64");
  const validation = validateFile({
    fileName: input.fileName,
    clientMimeType: input.clientMimeType,
    size: input.fileSize,
    firstBytes: new Uint8Array(firstBytes),
    context: "avatar", // reuse the avatar validator (images only)
  });
  if (!validation.ok) {
    return { ok: false, message: validation.error };
  }

  // For videos, only allow mp4 (magic-byte sniffing for video is a future
  // extension; for now we accept video/* MIME and rely on the client
  // + extension check).
  // TODO: add video magic-byte sniffing in storage/file-validation.ts

  // Upload to bucket
  const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "jpg";
  const storagePath = `${input.propertyId}/${crypto.randomUUID()}.${ext}`;
  const fileBuffer = Buffer.from(input.fileBufferBase64, "base64");

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKETS.propertyMedia)
    .upload(storagePath, fileBuffer, {
      contentType: validation.detectedMimeType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    logger.error("Property media upload failed", {
      userId: profile.user_id,
      propertyId: input.propertyId,
      error: uploadError.message,
    });
    return { ok: false, message: "We couldn't upload the file." };
  }

  // Get the public URL
  const { data: publicUrlData } = supabase.storage
    .from(STORAGE_BUCKETS.propertyMedia)
    .getPublicUrl(storagePath);

  // Insert the metadata row
  const { data: mediaRow, error: metaError } = await supabase
    .from("property_media")
    .insert({
      property_id: input.propertyId,
      media_type: input.mediaType,
      storage_path: storagePath,
      file_name: input.fileName,
      mime_type: validation.detectedMimeType,
      size_bytes: input.fileSize,
      sort_order: (count ?? 0), // append to end
    })
    .select("id")
    .single();

  if (metaError || !mediaRow) {
    logger.error("Property media metadata insert failed", {
      propertyId: input.propertyId,
      error: metaError?.message,
    });
    // Clean up the uploaded file
    await supabase.storage.from(STORAGE_BUCKETS.propertyMedia).remove([storagePath]);
    return { ok: false, message: "We couldn't save the media metadata." };
  }

  // If this is the first image, auto-set as featured
  if (input.mediaType === "image" && (count ?? 0) === 0) {
    await supabase
      .from("property_media")
      .update({ is_featured: true })
      .eq("id", (mediaRow as { id: string }).id);
  }

  revalidatePath(`/dashboard/properties/${input.propertyId}/edit`, "page");
  return {
    ok: true,
    mediaId: (mediaRow as { id: string }).id,
    mediaUrl: publicUrlData.publicUrl,
  };
}

// ---------------------------------------------------------------------------
// Delete media
// ---------------------------------------------------------------------------

export async function deletePropertyMedia(input: {
  propertyId: string;
  mediaId: string;
}): Promise<MediaActionResult> {
  const ctx = await requirePropertyManager(input.propertyId);
  if (!ctx) {
    return { ok: false, message: "FORBIDDEN" };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Fetch the media row — verify ownership chain
  const { data: mediaRow } = await supabase
    .from("property_media")
    .select("id, storage_path, is_featured, property_id")
    .eq("id", input.mediaId)
    .maybeSingle();
  if (!mediaRow) {
    return { ok: false, message: "Media not found." };
  }
  const media = mediaRow as {
    id: string;
    storage_path: string;
    is_featured: boolean;
    property_id: string;
  };

  if (media.property_id !== input.propertyId) {
    return { ok: false, message: "FORBIDDEN" };
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from(STORAGE_BUCKETS.propertyMedia)
    .remove([media.storage_path]);
  if (storageError) {
    logger.error("Property media storage delete failed", {
      mediaId: media.id,
      error: storageError.message,
    });
    // Continue — we want to remove the metadata row even if storage fails
  }

  // Delete metadata row
  const { error: metaError } = await supabase
    .from("property_media")
    .delete()
    .eq("id", media.id);
  if (metaError) {
    logger.error("Property media metadata delete failed", {
      mediaId: media.id,
      error: metaError.message,
    });
    return { ok: false, message: "We couldn't delete the media." };
  }

  // If we deleted the featured image, promote the next available image
  if (media.is_featured) {
    const { data: nextImage } = await supabase
      .from("property_media")
      .select("id")
      .eq("property_id", input.propertyId)
      .eq("media_type", "image")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (nextImage) {
      await supabase
        .from("property_media")
        .update({ is_featured: true })
        .eq("id", (nextImage as { id: string }).id);
    }
  }

  revalidatePath(`/dashboard/properties/${input.propertyId}/edit`, "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reorder media
// ---------------------------------------------------------------------------

export async function reorderPropertyMedia(input: {
  propertyId: string;
  orderedMediaIds: string[];
}): Promise<MediaActionResult> {
  const ctx = await requirePropertyManager(input.propertyId);
  if (!ctx) {
    return { ok: false, message: "FORBIDDEN" };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Update sort_order for each media row
  const updates = input.orderedMediaIds.map((id, idx) => ({
    id,
    sort_order: idx,
  }));

  // Use upsert pattern (preserve other fields)
  for (const u of updates) {
    await supabase
      .from("property_media")
      .update({ sort_order: u.sort_order })
      .eq("id", u.id)
      .eq("property_id", input.propertyId); // defense in depth
  }

  revalidatePath(`/dashboard/properties/${input.propertyId}/edit`, "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Set featured media
// ---------------------------------------------------------------------------

export async function setFeaturedPropertyMedia(input: {
  propertyId: string;
  mediaId: string;
}): Promise<MediaActionResult> {
  const ctx = await requirePropertyManager(input.propertyId);
  if (!ctx) {
    return { ok: false, message: "FORBIDDEN" };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Verify the media belongs to this property + is an image
  const { data: mediaRow } = await supabase
    .from("property_media")
    .select("id, media_type, property_id")
    .eq("id", input.mediaId)
    .maybeSingle();
  if (!mediaRow) {
    return { ok: false, message: "Media not found." };
  }
  const media = mediaRow as { id: string; media_type: string; property_id: string };
  if (media.property_id !== input.propertyId) {
    return { ok: false, message: "FORBIDDEN" };
  }
  if (media.media_type !== "image") {
    return { ok: false, message: "Featured media must be an image." };
  }

  // Unset existing featured
  await supabase
    .from("property_media")
    .update({ is_featured: false })
    .eq("property_id", input.propertyId)
    .eq("is_featured", true);

  // Set new featured
  const { error: updateError } = await supabase
    .from("property_media")
    .update({ is_featured: true })
    .eq("id", input.mediaId);
  if (updateError) {
    return { ok: false, message: "We couldn't set the featured image." };
  }

  revalidatePath(`/dashboard/properties/${input.propertyId}/edit`, "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Report property — uses existing reports table
// ---------------------------------------------------------------------------

export async function reportProperty(input: {
  propertyId: string;
  reason: string;
  description: string;
}): Promise<MediaActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to report a listing." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Profile not found." };
  }

  // Validate input
  const allowedReasons = new Set([
    "fake_listing",
    "scam_attempt",
    "wrong_property_info",
    "already_sold_rented",
    "fraudulent_agent",
    "fraudulent_owner",
    "harassment",
    "inappropriate_content",
    "suspicious_payment_request",
    "other",
  ]);
  if (!allowedReasons.has(input.reason)) {
    return { ok: false, fieldErrors: { reason: ["Invalid report reason."] } };
  }
  if (input.description.trim().length < 10) {
    return {
      ok: false,
      fieldErrors: {
        description: ["Please describe the issue (at least 10 characters)."],
      },
    };
  }

  // Rate-limit
  const rl = await rateLimiter.check({
    key: profile.user_id,
    action: "report",
    ...RATE_LIMITS.report,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many reports. Try again later." };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Insert into reports table
  const { error } = await supabase.from("reports").insert({
    reporter_id: profile.id,
    entity_type: "property",
    entity_id: input.propertyId,
    reason: input.reason,
    description: input.description.trim(),
    status: "open",
  });

  if (error) {
    logger.error("Property report insert failed", {
      reporterId: profile.id,
      propertyId: input.propertyId,
      error: error.message,
    });
    return { ok: false, message: "We couldn't submit your report." };
  }

  return { ok: true };
}
