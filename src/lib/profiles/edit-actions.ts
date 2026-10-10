"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/db/supabase";
import {
  getCurrentProfile,
  getCurrentUser,
} from "@/lib/auth/server";
import { capabilitiesFor } from "@/lib/capabilities";
import { rateLimiter, RATE_LIMITS } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging";
import { normalizeNigerianPhone } from "@/lib/utils/phone";
import { validateFile } from "@/lib/storage/file-validation";
import { STORAGE_BUCKETS } from "@/lib/verification/constants";

/**
 * Profile editing server actions.
 *
 * Per spec Section 21 (profile editing) + Section 32 (security):
 *   * Users can update their own profile fields.
 *   * Users CANNOT modify: role, verification_state, subscription_tier,
 *     account_status, email_verified, phone_verified, deleted_at,
 *     audit records, another user's profile.
 *
 * The DB RLS UPDATE policy blocks role / subscription_tier changes;
 * the server actions never write those fields at all (defense in depth).
 *
 * Per spec Section 23 (social media handles): only Premium plan users
 * can have social handles. The capability check is enforced server-side
 * here, NOT in the UI — so a malicious client can't bypass it.
 */

export type ProfileEditResult =
  | { ok: true; redirectTo?: string }
  | { ok: false; fieldErrors?: Record<string, string[]>; message?: string };

// ---------------------------------------------------------------------------
// Update basic profile (shared across all roles)
// ---------------------------------------------------------------------------

export async function updateBasicProfile(input: {
  fullName?: string;
  phone?: string;
  bio?: string;
  preferredLocation?: string;
}): Promise<ProfileEditResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "You must be signed in." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Profile not found." };
  }

  // Build the update payload — only fields explicitly provided
  const updates: Record<string, unknown> = {};

  if (input.fullName !== undefined) {
    const trimmed = input.fullName.trim();
    if (trimmed.length < 2) {
      return {
        ok: false,
        fieldErrors: { fullName: ["Name must be at least 2 characters."] },
      };
    }
    if (trimmed.length > 80) {
      return {
        ok: false,
        fieldErrors: { fullName: ["Name must be at most 80 characters."] },
      };
    }
    updates.full_name = trimmed;
  }

  if (input.phone !== undefined) {
    const normalised = normalizeNigerianPhone(input.phone);
    if (!normalised) {
      return {
        ok: false,
        fieldErrors: { phone: ["Enter a valid Nigerian phone number."] },
      };
    }
    updates.phone = normalised;
  }

  if (input.bio !== undefined) {
    if (input.bio.length > 500) {
      return {
        ok: false,
        fieldErrors: { bio: ["Bio must be at most 500 characters."] },
      };
    }
    updates.bio = input.bio.trim() || null;
  }

  if (input.preferredLocation !== undefined) {
    if (input.preferredLocation.length > 120) {
      return {
        ok: false,
        fieldErrors: {
          preferredLocation: ["Location must be at most 120 characters."],
        },
      };
    }
    updates.preferred_location = input.preferredLocation.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, message: "No fields to update." };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", profile.id);

  if (error) {
    logger.error("updateBasicProfile failed", {
      userId: user.id,
      error: error.message,
    });
    return { ok: false, message: "We couldn't save your changes. Please try again." };
  }

  revalidatePath("/dashboard/profile", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Update social media handles — capability-gated
// ---------------------------------------------------------------------------

export async function updateSocialHandles(input: {
  handles: Record<string, string>;
}): Promise<ProfileEditResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "You must be signed in." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Profile not found." };
  }

  // Capability check — only Premium plan users can have social handles.
  // Per spec Section 23 + Section 31 (centralised capability system).
  const caps = capabilitiesFor(profile.role, profile.subscription_tier);
  if (!caps.canShowSocialMediaHandles) {
    return {
      ok: false,
      message:
        "Social media handles are a Premium plan feature. Upgrade to Premium to add them.",
    };
  }

  // Validate each handle
  const cleaned: Record<string, string> = {};
  const fieldErrors: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(input.handles)) {
    const cleanKey = key.trim().toLowerCase();
    if (!cleanKey) {
      fieldErrors.handles = ["Platform name cannot be empty."];
      continue;
    }
    if (!/^[a-z0-9_-]+$/.test(cleanKey)) {
      fieldErrors.handles = [
        `Platform "${cleanKey}" has invalid characters. Use lowercase letters, numbers, dashes, or underscores.`,
      ];
      continue;
    }
    const cleanValue = value.trim();
    if (cleanValue.length === 0) {
      // Empty value means "remove this handle"
      continue;
    }
    if (cleanValue.length > 120) {
      fieldErrors.handles = [`Handle for ${cleanKey} is too long (max 120 chars).`];
      continue;
    }
    cleaned[cleanKey] = cleanValue;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ social_handles: cleaned })
    .eq("id", profile.id);

  if (error) {
    logger.error("updateSocialHandles failed", {
      userId: user.id,
      error: error.message,
    });
    return { ok: false, message: "We couldn't save your social handles." };
  }

  revalidatePath("/dashboard/profile", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Update role-specific profile (landlord / agent / company)
// ---------------------------------------------------------------------------

export async function updateLandlordProfile(input: {
  preferredContactMethod?: "phone" | "email" | "whatsapp" | "";
  preferredContactValue?: string;
  ownershipSummary?: string;
}): Promise<ProfileEditResult> {
  return updateRoleSpecificProfile("landlord", input);
}

export async function updateAgentProfile(input: {
  professionalName?: string;
  agencyName?: string;
  yearsOfExperience?: number;
  licenseNumber?: string;
  licenseIssuingBody?: string;
  professionalDescription?: string;
  portfolioUrl?: string;
}): Promise<ProfileEditResult> {
  return updateRoleSpecificProfile("agent", input);
}

export async function updateCompanyProfile(input: {
  companyName?: string;
  companyDescription?: string;
  officeAddress?: string;
  officeState?: string;
  officeLga?: string;
  website?: string;
  cacRegistered?: boolean;
  cacRegistrationNumber?: string;
}): Promise<ProfileEditResult> {
  return updateRoleSpecificProfile("company", input);
}

async function updateRoleSpecificProfile(
  role: "landlord" | "agent" | "company",
  input: Record<string, unknown>,
): Promise<ProfileEditResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "You must be signed in." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Profile not found." };
  }

  // Role mismatch — user is trying to update the wrong role's row.
  // This is a server-side guard; the UI doesn't expose this path but
  // we defend against direct calls.
  if (profile.role !== role) {
    return { ok: false, message: "FORBIDDEN" };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Build the update payload — strip undefined + empty strings → null
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") {
      // Empty strings → null (so we don't store empty string in NOT NULL cols)
      updates[k] = null;
    } else {
      updates[k] = v;
    }
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, message: "No fields to update." };
  }

  const tableName =
    role === "landlord"
      ? "landlord_profiles"
      : role === "agent"
        ? "agent_profiles"
        : "company_profiles";

  // Upsert — if the role-specific row doesn't exist yet, create it.
  // The (profile_id) primary key makes the upsert target the right row.
  const { error } = await supabase
    .from(tableName)
    .upsert({
      profile_id: profile.id,
      ...updates,
    });

  if (error) {
    logger.error(`updateRoleSpecificProfile (${role}) failed`, {
      userId: user.id,
      error: error.message,
    });
    return { ok: false, message: "We couldn't save your changes. Please try again." };
  }

  revalidatePath("/dashboard/profile", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Upload profile photo / company logo
// ---------------------------------------------------------------------------

export async function uploadProfilePhoto(input: {
  fileName: string;
  clientMimeType: string;
  fileSize: number;
  firstBytesBase64: string;
  fileBufferBase64: string;
}): Promise<ProfileEditResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "You must be signed in." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Profile not found." };
  }

  // Rate-limit uploads
  const rl = await rateLimiter.check({
    key: user.id,
    action: "onboarding",
    ...RATE_LIMITS.application,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many uploads. Try again later." };
  }

  // Validate file (MIME + size + extension + magic bytes)
  const firstBytes = Buffer.from(input.firstBytesBase64, "base64");
  const validation = validateFile({
    fileName: input.fileName,
    clientMimeType: input.clientMimeType,
    size: input.fileSize,
    firstBytes: new Uint8Array(firstBytes),
    context: "avatar",
  });
  if (!validation.ok) {
    return { ok: false, message: validation.error };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Storage path: avatars/{user_id}/{uuid}.{ext}
  const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "jpg";
  const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const fileBuffer = Buffer.from(input.fileBufferBase64, "base64");

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKETS.avatars)
    .upload(storagePath, fileBuffer, {
      contentType: validation.detectedMimeType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    logger.error("Avatar upload failed", {
      userId: user.id,
      error: uploadError.message,
    });
    return { ok: false, message: "We couldn't upload the image. Please try again." };
  }

  // Get the public URL (avatars bucket is public-read)
  const { data: publicUrlData } = supabase.storage
    .from(STORAGE_BUCKETS.avatars)
    .getPublicUrl(storagePath);

  // Update the profile.avatar_url + company_profiles.company_logo_url for companies
  const { error: profileUpdateError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrlData.publicUrl })
    .eq("id", profile.id);

  if (profileUpdateError) {
    logger.error("Avatar URL update failed", {
      userId: user.id,
      error: profileUpdateError.message,
    });
    // Clean up the uploaded file
    await supabase.storage.from(STORAGE_BUCKETS.avatars).remove([storagePath]);
    return { ok: false, message: "We couldn't update your profile photo." };
  }

  // For companies, also mirror the logo to company_profiles.company_logo_url
  if (profile.role === "company") {
    await supabase
      .from("company_profiles")
      .update({ company_logo_url: publicUrlData.publicUrl })
      .eq("profile_id", profile.id);
  }

  revalidatePath("/dashboard/profile", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Submit a profile report (uses the existing reports table)
// ---------------------------------------------------------------------------

export async function submitProfileReport(input: {
  reportedProfileId: string;
  reason: string;
  description: string;
}): Promise<ProfileEditResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to report a profile." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Profile not found." };
  }

  // Validate input
  const allowedReasons = new Set([
    "fake_profile",
    "fraudulent_agent",
    "fraudulent_owner",
    "wrong_information",
    "harassment",
    "scam_attempt",
    "suspicious_payment_request",
    "inappropriate_content",
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

  // Don't allow self-reports
  if (input.reportedProfileId === profile.id) {
    return { ok: false, message: "You cannot report your own profile." };
  }

  // Rate-limit
  const rl = await rateLimiter.check({
    key: user.id,
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

  // Insert into the existing reports table
  const { error } = await supabase.from("reports").insert({
    reporter_id: profile.id,
    entity_type: "profile",
    entity_id: input.reportedProfileId,
    reason: input.reason,
    description: input.description.trim(),
    status: "open",
  });

  if (error) {
    logger.error("Profile report insert failed", {
      reporterId: profile.id,
      reportedId: input.reportedProfileId,
      error: error.message,
    });
    return { ok: false, message: "We couldn't submit your report. Please try again." };
  }

  return { ok: true, redirectTo: "/agents" };
}

// Helper removed — refer back to the listing page directly.
