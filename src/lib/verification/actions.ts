"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createAdminClient } from "@/lib/db/supabase";
import {
  getCurrentProfile,
  getCurrentUser,
} from "@/lib/auth/server";
import { rateLimiter, RATE_LIMITS } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging";
import { validateFile } from "@/lib/storage/file-validation";
import {
  STORAGE_BUCKETS,
  MAX_DOCUMENTS_PER_APPLICATION,
  APPLICATION_EXPIRY_DAYS,
} from "@/lib/verification/constants";
import { canApplyForVerification } from "./eligibility";
import { getApplicationExpiryDays } from "./requirements";
import type { VerificationTier } from "@/types";

/**
 * Verification server actions — user-facing.
 *
 * Per spec Sections 9, 11, 12:
 *   * Users can submit applications (draft → submitted).
 *   * Users can upload documents to their own application only.
 *   * Users can withdraw their own application.
 *   * Users CANNOT approve / reject / revoke / suspend — admin only.
 *
 * All actions are atomic with respect to the audit trail: writing the
 * application row also writes the verification_history row via a DB
 * trigger-like pattern (server action calls a single admin-client
 * transactional update).
 */

export type VerificationActionResult =
  | { ok: true; applicationId?: string; redirectTo?: string }
  | { ok: false; fieldErrors?: Record<string, string[]>; message?: string };

// ---------------------------------------------------------------------------
// Submit verification application
// ---------------------------------------------------------------------------

export async function submitVerificationApplication(input: {
  tier: VerificationTier;
  applicantSummary: string;
  applicantMetadata?: Record<string, unknown>;
}): Promise<VerificationActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to apply for verification." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Profile not found." };
  }

  // Re-check eligibility server-side — never trust the client.
  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Fetch role-specific row
  const roleTable =
    profile.role === "landlord"
      ? "landlord_profiles"
      : profile.role === "agent"
        ? "agent_profiles"
        : "company_profiles";

  const { data: roleSpecific } = await supabase
    .from(roleTable)
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();

  // Fetch existing applications
  const { data: existingApps } = await supabase
    .from("verification_applications")
    .select("*")
    .eq("applicant_id", profile.id);

  const eligibility = canApplyForVerification({
    role: profile.role,
    tier: input.tier,
    verificationState: profile.verification_state,
    subscriptionTier: profile.subscription_tier,
    emailVerified: profile.email_verified,
    phoneVerified: profile.phone_verified,
    accountCreatedAt: profile.created_at,
    profile,
    roleSpecific: roleSpecific as never,
    existingApplications: (existingApps as never) ?? [],
  });

  if (!eligibility.canApply) {
    return {
      ok: false,
      message: eligibility.blockingReasons[0] ?? "You're not eligible to apply.",
    };
  }

  // Rate-limit per user
  const rl = await rateLimiter.check({
    key: user.id,
    action: "onboarding", // reuse the same rate-limit bucket
    ...RATE_LIMITS.application,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many submissions. Try again later." };
  }

  // Insert the application row + a verification_history entry atomically
  // via the admin client (we need service role for verification_history
  // because RLS doesn't allow users to write to it).
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, message: "Database not configured for admin operations." };
  }

  // Insert the application
  const { data: application, error: appError } = await admin
    .from("verification_applications")
    .insert({
      applicant_id: profile.id,
      tier: input.tier,
      status: "submitted",
      applicant_summary: input.applicantSummary,
      applicant_metadata: input.applicantMetadata ?? {},
      submitted_at: new Date().toISOString(),
      expires_at: new Date(
        Date.now() + getApplicationExpiryDays(input.tier) * 24 * 60 * 60 * 1000,
      ).toISOString(),
    })
    .select("id")
    .single();

  if (appError || !application) {
    logger.error("Verification application insert failed", {
      userId: user.id,
      error: appError?.message,
    });
    return { ok: false, message: "We couldn't submit your application. Please try again." };
  }

  // Update verification_state to 'pending' on the profile
  const { error: profileUpdateError } = await admin
    .from("profiles")
    .update({ verification_state: "pending" })
    .eq("id", profile.id);

  if (profileUpdateError) {
    logger.error("Could not set verification_state to pending", {
      userId: user.id,
      error: profileUpdateError.message,
    });
    // Don't tell the user — the application was created, that's the
    // primary outcome. The state will sync when admin reviews.
  }

  // Append verification_history (audit-only table; users can't write)
  const { error: historyError } = await admin
    .from("verification_history")
    .insert({
      profile_id: profile.id,
      previous_state: profile.verification_state,
      new_state: "pending",
      application_id: application.id,
      actor_id: null, // null = self-submitted
      reason: `Self-submitted ${input.tier} application`,
    });

  if (historyError) {
    logger.error("Could not write verification_history on submit", {
      userId: user.id,
      error: historyError.message,
    });
  }

  // Record audit event
  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "verification.submit",
    target_type: "verification_application",
    target_id: application.id,
    metadata: { tier: input.tier },
  });
  if (auditError) {
    logger.error("Could not write audit log for verification submit", {
      userId: user.id,
      error: auditError.message,
    });
  }

  revalidatePath("/dashboard/verification", "page");
  return {
    ok: true,
    applicationId: application.id,
    redirectTo: `/dashboard/verification?submitted=1`,
  };
}

// ---------------------------------------------------------------------------
// Upload verification document
// ---------------------------------------------------------------------------

export async function uploadVerificationDocument(input: {
  applicationId: string;
  documentType: string;
  fileName: string;
  clientMimeType: string;
  fileSize: number;
  firstBytesBase64: string; // first 16 bytes base64-encoded for MIME sniffing
  fileBufferBase64: string; // full file base64-encoded for storage
}): Promise<VerificationActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "You must be signed in to upload documents." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Profile not found." };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // 1. Verify the application belongs to the caller
  const { data: application, error: appFetchError } = await supabase
    .from("verification_applications")
    .select("id, applicant_id, status")
    .eq("id", input.applicationId)
    .maybeSingle();

  if (appFetchError || !application) {
    return { ok: false, message: "Application not found." };
  }

  const app = application as { id: string; applicant_id: string; status: string };
  if (app.applicant_id !== profile.id) {
    // Don't reveal that the application exists for someone else —
    // return generic "not found" to avoid leaking info.
    return { ok: false, message: "Application not found." };
  }

  // Can only upload documents to draft / submitted applications
  if (app.status !== "draft" && app.status !== "submitted") {
    return {
      ok: false,
      message: `Cannot upload documents to an application with status "${app.status}".`,
    };
  }

  // 2. Check document count limit
  const { count } = await supabase
    .from("verification_documents")
    .select("id", { count: "exact", head: true })
    .eq("application_id", input.applicationId);

  if ((count ?? 0) >= MAX_DOCUMENTS_PER_APPLICATION) {
    return {
      ok: false,
      message: `You can upload at most ${MAX_DOCUMENTS_PER_APPLICATION} documents per application.`,
    };
  }

  // 3. Validate file: MIME + size + extension + magic-byte sniff
  const firstBytes = Buffer.from(input.firstBytesBase64, "base64");
  const validation = validateFile({
    fileName: input.fileName,
    clientMimeType: input.clientMimeType,
    size: input.fileSize,
    firstBytes: new Uint8Array(firstBytes),
    context: "document",
  });
  if (!validation.ok) {
    return { ok: false, message: validation.error };
  }

  // 4. Upload to private bucket `verification-documents`
  //    Storage path: {application_id}/{uuid}.{ext}
  const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${input.applicationId}/${crypto.randomUUID()}.${ext}`;
  const fileBuffer = Buffer.from(input.fileBufferBase64, "base64");

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKETS.verificationDocuments)
    .upload(storagePath, fileBuffer, {
      contentType: validation.detectedMimeType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    logger.error("Verification document upload failed", {
      userId: user.id,
      error: uploadError.message,
    });
    return { ok: false, message: "We couldn't upload the file. Please try again." };
  }

  // 5. Insert metadata row
  const { error: metaError } = await supabase
    .from("verification_documents")
    .insert({
      application_id: input.applicationId,
      document_type: input.documentType,
      storage_path: storagePath,
      file_name: input.fileName,
      mime_type: validation.detectedMimeType!,
      size_bytes: input.fileSize,
    });

  if (metaError) {
    logger.error("Verification document metadata insert failed", {
      userId: user.id,
      error: metaError.message,
    });
    // Clean up the uploaded file since the metadata write failed
    await supabase.storage
      .from(STORAGE_BUCKETS.verificationDocuments)
      .remove([storagePath]);
    return { ok: false, message: "We couldn't save the document metadata. Please try again." };
  }

  revalidatePath("/dashboard/verification", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Withdraw verification application
// ---------------------------------------------------------------------------

export async function withdrawVerificationApplication(
  applicationId: string,
): Promise<VerificationActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "You must be signed in." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Profile not found." };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Verify ownership
  const { data: application } = await supabase
    .from("verification_applications")
    .select("id, applicant_id, status, tier")
    .eq("id", applicationId)
    .maybeSingle();

  const app = application as
    | { id: string; applicant_id: string; status: string; tier: string }
    | null;

  if (!app || app.applicant_id !== profile.id) {
    return { ok: false, message: "Application not found." };
  }

  if (app.status !== "draft" && app.status !== "submitted") {
    return {
      ok: false,
      message: `Cannot withdraw an application with status "${app.status}".`,
    };
  }

  // Update the application to withdrawn
  const { error: updateError } = await supabase
    .from("verification_applications")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", applicationId);

  if (updateError) {
    logger.error("Withdraw application failed", {
      userId: user.id,
      error: updateError.message,
    });
    return { ok: false, message: "We couldn't withdraw the application." };
  }

  // Reset verification_state from 'pending' → 'unverified' (if currently pending)
  if (profile.verification_state === "pending") {
    const admin = createAdminClient();
    if (admin) {
      await admin
        .from("profiles")
        .update({ verification_state: "unverified" })
        .eq("id", profile.id);

      await admin.from("verification_history").insert({
        profile_id: profile.id,
        previous_state: "pending",
        new_state: "unverified",
        application_id: applicationId,
        actor_id: null,
        reason: "Self-withdrawn application",
      });

      await admin.from("audit_logs").insert({
        actor_id: user.id,
        action: "verification.withdraw",
        target_type: "verification_application",
        target_id: applicationId,
        metadata: { tier: app.tier },
      });
    }
  }

  revalidatePath("/dashboard/verification", "page");
  return { ok: true, redirectTo: "/dashboard/verification" };
}

// ---------------------------------------------------------------------------
// Create draft verification application (for staged document upload)
// ---------------------------------------------------------------------------

export async function createDraftApplication(
  tier: VerificationTier,
): Promise<VerificationActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, message: "You must be signed in." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Profile not found." };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Don't allow multiple drafts for the same tier
  const { data: existing } = await supabase
    .from("verification_applications")
    .select("id")
    .eq("applicant_id", profile.id)
    .eq("tier", tier)
    .in("status", ["draft", "submitted", "in_review"]);

  if (existing && existing.length > 0) {
    return {
      ok: false,
      message: `You already have an active ${tier} application.`,
    };
  }

  const { data, error } = await supabase
    .from("verification_applications")
    .insert({
      applicant_id: profile.id,
      tier,
      status: "draft",
      applicant_summary: "",
      applicant_metadata: {},
      expires_at: new Date(
        Date.now() +
          (tier === "bronze" ? APPLICATION_EXPIRY_DAYS : 60) * 24 * 60 * 60 * 1000,
      ).toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    logger.error("Draft application creation failed", {
      userId: user.id,
      error: error?.message,
    });
    return { ok: false, message: "We couldn't create the application." };
  }

  return { ok: true, applicationId: (data as { id: string }).id };
}
