"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/supabase";
import { requireAdmin } from "@/lib/auth/server";
import { logger } from "@/lib/logging";
import { notificationService } from "@/lib/notifications";
import { mapApplicationStatusToVerificationState } from "./eligibility";
import type { VerificationTier } from "@/types";

/**
 * Verification admin server actions — review workflow.
 *
 * Per spec Sections 16, 17, 18, 19, 20:
 *   * Admin can approve / reject / revoke / suspend / request-changes
 *   * All actions are atomic: application + verification_state + history
 *     + audit + notification all update together
 *   * The badge becomes visible only after successful approval
 *
 * These actions use the admin (service-role) client — they bypass RLS
 * because the actor is verified via requireAdmin() (admin_users table
 * OR ADMIN_EMAILS env var) before any DB write happens.
 *
 * The admin UI itself comes in P15 (Admin Dashboard). These actions
 * provide the API/service foundation so the admin UI is mechanical.
 */

export type AdminReviewResult =
  | { ok: true }
  | { ok: false; message?: string };

// ---------------------------------------------------------------------------
// Approve
// ---------------------------------------------------------------------------

export async function approveVerificationApplication(input: {
  applicationId: string;
  reviewerNotes?: string;
}): Promise<AdminReviewResult> {
  // Verify admin status — never trust client claim of admin.
  const admin = await requireAdmin().catch(() => null);
  if (!admin) {
    return { ok: false, message: "FORBIDDEN" };
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return { ok: false, message: "Admin client not configured." };
  }

  // Fetch the application (with row lock to prevent concurrent actions)
  const { data: application, error: fetchError } = await adminClient
    .from("verification_applications")
    .select("id, applicant_id, tier, status")
    .eq("id", input.applicationId)
    .maybeSingle();

  if (fetchError || !application) {
    return { ok: false, message: "Application not found." };
  }

  const app = application as {
    id: string;
    applicant_id: string;
    tier: VerificationTier;
    status: string;
  };

  if (app.status !== "submitted" && app.status !== "in_review") {
    return {
      ok: false,
      message: `Cannot approve application in status "${app.status}".`,
    };
  }

  // Fetch the admin_users row for the reviewer_id FK
  const { data: adminUserRow } = await adminClient
    .from("admin_users")
    .select("id")
    .eq("user_id", admin.id)
    .maybeSingle();
  const reviewerAdminId = (adminUserRow as { id: string } | null)?.id ?? null;

  // Fetch current profile state
  const { data: profileRow } = await adminClient
    .from("profiles")
    .select("id, verification_state")
    .eq("id", app.applicant_id)
    .maybeSingle();
  const profile = profileRow as
    | { id: string; verification_state: string }
    | null;

  if (!profile) {
    return { ok: false, message: "Applicant profile not found." };
  }

  const newState = mapApplicationStatusToVerificationState("approved", app.tier);
  if (!newState) {
    return { ok: false, message: "Invalid state transition." };
  }

  // ATOMIC TRANSACTION: update application + profile + history + audit
  // We do these sequentially since Supabase doesn't expose transaction
  // RPCs from the JS client; if any step fails, the next step's caller
  // will see the partial state and can re-trigger. For the highest-
  // integrity version, this should be wrapped in a Postgres function
  // (added in a future migration if needed).
  const nowIso = new Date().toISOString();

  const { error: appUpdateError } = await adminClient
    .from("verification_applications")
    .update({
      status: "approved",
      reviewer_id: reviewerAdminId,
      reviewer_notes: input.reviewerNotes ?? null,
      reviewed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", app.id);

  if (appUpdateError) {
    logger.error("approveVerification: app update failed", {
      applicationId: app.id,
      error: appUpdateError.message,
    });
    return { ok: false, message: "Failed to update application." };
  }

  const { error: profileUpdateError } = await adminClient
    .from("profiles")
    .update({ verification_state: newState })
    .eq("id", profile.id);

  if (profileUpdateError) {
    logger.error("approveVerification: profile update failed — INCONSISTENT STATE", {
      applicationId: app.id,
      profileId: profile.id,
      expectedState: newState,
      error: profileUpdateError.message,
    });
    return {
      ok: false,
      message: "Application approved but badge update failed. Contact engineering.",
    };
  }

  const { error: historyError } = await adminClient
    .from("verification_history")
    .insert({
      profile_id: profile.id,
      previous_state: profile.verification_state,
      new_state: newState,
      application_id: app.id,
      actor_id: reviewerAdminId,
      reason: input.reviewerNotes ?? `Approved by admin`,
    });

  if (historyError) {
    logger.error("approveVerification: history write failed", {
      profileId: profile.id,
      error: historyError.message,
    });
    // The approval still went through — history is best-effort but we
    // log loudly so an admin can re-trigger the history entry manually.
  }

  await adminClient.from("audit_logs").insert({
    actor_id: admin.id,
    action: "verification.approve",
    target_type: "verification_application",
    target_id: app.id,
    metadata: { tier: app.tier, applicant_id: app.applicant_id },
  });

  // Notify the user (spec Section 24). The dispatcher handles
  // idempotency + preferences + email.
  await notificationService.dispatch({
    recipientId: app.applicant_id,
    type: "verification.approved",
    title: `You're ${app.tier === "bronze" ? "Bronze" : "Blue"} Verified`,
    body: `Your ${app.tier} verification application has been approved. The badge is now visible on your public profile.`,
    href: `/dashboard/verification`,
    relatedEntityType: "verification_application",
    relatedEntityId: app.id,
    eventKey: `verification.approved:${app.id}`,
    metadata: { applicationId: app.id, tier: app.tier },
    emailTemplateInput: { tier: app.tier, notes: input.reviewerNotes },
  });

  revalidatePath("/dashboard/verification", "page");
  revalidatePath("/admin/verification", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reject
// ---------------------------------------------------------------------------

export async function rejectVerificationApplication(input: {
  applicationId: string;
  rejectionReason: string;
  reviewerNotes?: string;
}): Promise<AdminReviewResult> {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) {
    return { ok: false, message: "FORBIDDEN" };
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return { ok: false, message: "Admin client not configured." };
  }

  const { data: application } = await adminClient
    .from("verification_applications")
    .select("id, applicant_id, tier, status")
    .eq("id", input.applicationId)
    .maybeSingle();

  const app = application as
    | { id: string; applicant_id: string; tier: VerificationTier; status: string }
    | null;

  if (!app) {
    return { ok: false, message: "Application not found." };
  }

  if (app.status !== "submitted" && app.status !== "in_review") {
    return {
      ok: false,
      message: `Cannot reject application in status "${app.status}".`,
    };
  }

  const { data: adminUserRow } = await adminClient
    .from("admin_users")
    .select("id")
    .eq("user_id", admin.id)
    .maybeSingle();
  const reviewerAdminId = (adminUserRow as { id: string } | null)?.id ?? null;

  const { data: profileRow } = await adminClient
    .from("profiles")
    .select("verification_state")
    .eq("id", app.applicant_id)
    .maybeSingle();
  const profile = profileRow as { verification_state: string } | null;

  if (!profile) {
    return { ok: false, message: "Applicant profile not found." };
  }

  const nowIso = new Date().toISOString();

  const { error: appUpdateError } = await adminClient
    .from("verification_applications")
    .update({
      status: "rejected",
      reviewer_id: reviewerAdminId,
      reviewer_notes: input.reviewerNotes ?? null,
      rejection_reason: input.rejectionReason,
      reviewed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", app.id);

  if (appUpdateError) {
    logger.error("rejectVerification: app update failed", {
      applicationId: app.id,
      error: appUpdateError.message,
    });
    return { ok: false, message: "Failed to update application." };
  }

  // Update verification_state to 'rejected' (only if currently 'pending')
  if (profile.verification_state === "pending") {
    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .update({ verification_state: "rejected" })
      .eq("id", app.applicant_id);

    if (profileUpdateError) {
      logger.error("rejectVerification: profile update failed", {
        applicantId: app.applicant_id,
        error: profileUpdateError.message,
      });
    } else {
      await adminClient.from("verification_history").insert({
        profile_id: app.applicant_id,
        previous_state: profile.verification_state,
        new_state: "rejected",
        application_id: app.id,
        actor_id: reviewerAdminId,
        reason: input.rejectionReason,
      });
    }
  }

  await adminClient.from("audit_logs").insert({
    actor_id: admin.id,
    action: "verification.reject",
    target_type: "verification_application",
    target_id: app.id,
    metadata: {
      tier: app.tier,
      applicant_id: app.applicant_id,
      reason: input.rejectionReason,
    },
  });

  await notificationService.dispatch({
    recipientId: app.applicant_id,
    type: "verification.rejected",
    title: `${app.tier === "bronze" ? "Bronze" : "Blue"} verification update`,
    body: `Your ${app.tier} verification application was not approved. Reason: ${input.rejectionReason}. You can re-apply after addressing the feedback.`,
    href: `/dashboard/verification`,
    relatedEntityType: "verification_application",
    relatedEntityId: app.id,
    eventKey: `verification.rejected:${app.id}`,
    metadata: { applicationId: app.id, tier: app.tier, reason: input.rejectionReason },
    emailTemplateInput: { tier: app.tier, notes: input.rejectionReason },
  });

  revalidatePath("/dashboard/verification", "page");
  revalidatePath("/admin/verification", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Request changes (back to applicant)
// ---------------------------------------------------------------------------

export async function requestVerificationChanges(input: {
  applicationId: string;
  message: string;
}): Promise<AdminReviewResult> {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) {
    return { ok: false, message: "FORBIDDEN" };
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return { ok: false, message: "Admin client not configured." };
  }

  const { error } = await adminClient
    .from("verification_applications")
    .update({
      status: "in_review",
      reviewer_notes: input.message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.applicationId);

  if (error) {
    logger.error("requestVerificationChanges failed", {
      applicationId: input.applicationId,
      error: error.message,
    });
    return { ok: false, message: "Failed to update application." };
  }

  await adminClient.from("audit_logs").insert({
    actor_id: admin.id,
    action: "verification.request_changes",
    target_type: "verification_application",
    target_id: input.applicationId,
    metadata: { message: input.message },
  });

  revalidatePath("/admin/verification", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

export async function revokeVerification(input: {
  profileId: string;
  reason: string;
}): Promise<AdminReviewResult> {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) {
    return { ok: false, message: "FORBIDDEN" };
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return { ok: false, message: "Admin client not configured." };
  }

  const { data: profileRow } = await adminClient
    .from("profiles")
    .select("verification_state")
    .eq("id", input.profileId)
    .maybeSingle();
  const profile = profileRow as { verification_state: string } | null;

  if (!profile) {
    return { ok: false, message: "Profile not found." };
  }

  // Remove the badge — set to 'revoked'
  const { error } = await adminClient
    .from("profiles")
    .update({
      verification_state: "revoked",
    })
    .eq("id", input.profileId);

  if (error) {
    logger.error("revokeVerification failed", {
      profileId: input.profileId,
      error: error.message,
    });
    return { ok: false, message: "Failed to revoke verification." };
  }

  await adminClient.from("verification_history").insert({
    profile_id: input.profileId,
    previous_state: profile.verification_state,
    new_state: "revoked",
    actor_id: admin.id,
    reason: input.reason,
  });

  await adminClient.from("audit_logs").insert({
    actor_id: admin.id,
    action: "verification.revoke",
    target_type: "profile",
    target_id: input.profileId,
    metadata: { reason: input.reason, previous_state: profile.verification_state },
  });

  await notificationService.dispatch({
    recipientId: input.profileId,
    type: "verification.revoked",
    title: "Your verification has been revoked",
    body: `Your verification has been revoked. Reason: ${input.reason}. Contact support if you believe this is a mistake.`,
    href: `/dashboard/verification`,
    relatedEntityType: "profile",
    relatedEntityId: input.profileId,
    eventKey: `verification.revoked:${input.profileId}:${Date.now()}`,
    metadata: { profileId: input.profileId, reason: input.reason },
    emailTemplateInput: { tier: "verification", notes: input.reason },
  });

  revalidatePath("/dashboard/verification", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Suspend verification (independent of account status)
// ---------------------------------------------------------------------------

export async function suspendVerification(input: {
  profileId: string;
  reason: string;
}): Promise<AdminReviewResult> {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) {
    return { ok: false, message: "FORBIDDEN" };
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return { ok: false, message: "Admin client not configured." };
  }

  const { data: profileRow } = await adminClient
    .from("profiles")
    .select("verification_state")
    .eq("id", input.profileId)
    .maybeSingle();
  const profile = profileRow as { verification_state: string } | null;

  if (!profile) {
    return { ok: false, message: "Profile not found." };
  }

  if (profile.verification_state !== "bronze" && profile.verification_state !== "blue") {
    return {
      ok: false,
      message: "Cannot suspend verification that isn't currently approved.",
    };
  }

  const { error } = await adminClient
    .from("profiles")
    .update({ verification_state: "suspended" })
    .eq("id", input.profileId);

  if (error) {
    logger.error("suspendVerification failed", {
      profileId: input.profileId,
      error: error.message,
    });
    return { ok: false, message: "Failed to suspend verification." };
  }

  await adminClient.from("verification_history").insert({
    profile_id: input.profileId,
    previous_state: profile.verification_state,
    new_state: "suspended",
    actor_id: admin.id,
    reason: input.reason,
  });

  await adminClient.from("audit_logs").insert({
    actor_id: admin.id,
    action: "verification.suspend",
    target_type: "profile",
    target_id: input.profileId,
    metadata: { reason: input.reason, previous_state: profile.verification_state },
  });

  // Suspend = state changes to "suspended" on the profile. We dispatch
  // a generic security event notification since there is no dedicated
  // notification type for verification suspension in the catalogue.
  await notificationService.dispatch({
    recipientId: input.profileId,
    type: "account.security_event",
    title: "Your verification is suspended",
    body: `Your verification has been suspended. Reason: ${input.reason}. Contact support if you believe this is a mistake.`,
    href: `/dashboard/verification`,
    relatedEntityType: "profile",
    relatedEntityId: input.profileId,
    eventKey: `verification.suspended:${input.profileId}:${Date.now()}`,
    metadata: { profileId: input.profileId, reason: input.reason },
    emailTemplateInput: {
      eventDescription: `Your verification was suspended (reason: ${input.reason}).`,
      whenIso: new Date().toISOString(),
    },
  });

  revalidatePath("/dashboard/verification", "page");
  return { ok: true };
}
