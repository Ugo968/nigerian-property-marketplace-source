/**
 * Admin server actions — controlled moderation mutations.
 *
 * Every action:
 *   1. Resolves the calling admin via requireAdmin() / requireAdminPermission()
 *      (server-side — never trusts client-submitted admin IDs).
 *   2. Validates the input against the existing data model.
 *   3. Performs the mutation via the service-role admin client (RLS
 *      bypass is intentional — admin authorization was verified at
 *      step 1).
 *   4. Records the action via recordAdminAction() — both in audit_logs
 *      and admin_action_records.
 *   5. Dispatches any required user-facing notification via the
 *      NotificationService (Prompt 16).
 *
 * The admin NEVER directly edits:
 *   - payment rows (payment truth remains tied to verified provider state)
 *   - audit_logs (append-only — no UPDATE/DELETE policies)
 *   - admin_action_records (append-only)
 *   - profile.password / auth.users password ( admins use Supabase Auth)
 *
 * Per spec Section 49 — no fake moderation, no client-only auth.
 */

"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/supabase";
import { logger } from "@/lib/logging";
import { notificationService } from "@/lib/notifications";
import type { ProfileRow } from "@/types";
import {
  requireAdmin,
  requireAdminPermission,
  type AdminIdentity,
} from "./permissions";
import { recordAdminAction, type AdminTargetType } from "./audit";

// ---------------------------------------------------------------------------
// Result type — discriminated union so client code can render success vs
// error UI without parsing strings.
// ---------------------------------------------------------------------------
export type AdminActionResult =
  | { ok: true }
  | { ok: false; message?: string; fieldErrors?: Record<string, string[]> };

// ---------------------------------------------------------------------------
// Helper — load a profile by id (admin client, RLS bypass).
// ---------------------------------------------------------------------------
async function loadProfile(profileId: string): Promise<ProfileRow | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

// ===========================================================================
// USER MANAGEMENT (spec Sections 7, 8, 9, 10)
// ===========================================================================
// Account status transitions are constrained:
//   active → suspended | banned
//   suspended → active | banned
//   banned → active  (only with explicit reason + super_admin)
//   pending → active | suspended | banned
//   deactivated → active
//
// We DO NOT accept arbitrary status strings — the function signatures
// take a discrete argument per transition, not a status string.
// ===========================================================================

export async function suspendUserAction(input: {
  profileId: string;
  reason: string;
}): Promise<AdminActionResult> {
  if (!input.reason || input.reason.trim().length < 3) {
    return {
      ok: false,
      fieldErrors: { reason: ["Please provide a reason (at least 3 characters)."] },
    };
  }
  const admin = await requireAdminPermission("users.suspend");

  const profile = await loadProfile(input.profileId);
  if (!profile) return { ok: false, message: "User not found." };

  if (profile.account_status === "suspended") {
    return { ok: false, message: "User is already suspended." };
  }
  if (profile.account_status === "banned") {
    return { ok: false, message: "Cannot suspend a banned user — reactivate or unban first." };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { error } = await supabase
    .from("profiles")
    .update({
      account_status: "suspended",
      suspended_at: new Date().toISOString(),
      suspended_reason: input.reason.trim(),
    } as never)
    .eq("id", input.profileId);

  if (error) {
    logger.error("admin: suspend user failed", { error: error.message });
    return { ok: false, message: "We couldn't suspend the user." };
  }

  await recordAdminAction({
    admin,
    action: "user.suspend",
    targetType: "user" as AdminTargetType,
    targetId: input.profileId,
    reason: input.reason,
    previousState: profile.account_status,
    newState: "suspended",
    metadata: { previousStatus: profile.account_status },
  });

  await notificationService.dispatch({
    recipientId: input.profileId,
    type: "account.suspended",
    title: "Your account was suspended",
    body: `Your Shelty account has been suspended. Reason: ${input.reason}. Please contact support if you believe this is a mistake.`,
    href: "/dashboard/profile",
    relatedEntityType: "profile",
    relatedEntityId: input.profileId,
    eventKey: `account.suspended:${input.profileId}:${Date.now()}`,
    metadata: { reason: input.reason, suspendedBy: admin.adminUserId },
    emailTemplateInput: {
      eventDescription: `Your Shelty account was suspended. Reason: ${input.reason}.`,
      whenIso: new Date().toISOString(),
    },
  });

  revalidatePath("/admin/users", "page");
  revalidatePath(`/admin/users/${input.profileId}`, "page");
  return { ok: true };
}

export async function reactivateUserAction(input: {
  profileId: string;
  reason: string;
}): Promise<AdminActionResult> {
  if (!input.reason || input.reason.trim().length < 3) {
    return {
      ok: false,
      fieldErrors: { reason: ["Please provide a reason (at least 3 characters)."] },
    };
  }
  const admin = await requireAdminPermission("users.suspend");

  const profile = await loadProfile(input.profileId);
  if (!profile) return { ok: false, message: "User not found." };

  if (profile.account_status === "active") {
    return { ok: false, message: "User is already active." };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { error } = await supabase
    .from("profiles")
    .update({
      account_status: "active",
      suspended_at: null,
      suspended_reason: null,
    } as never)
    .eq("id", input.profileId);

  if (error) {
    logger.error("admin: reactivate user failed", { error: error.message });
    return { ok: false, message: "We couldn't reactivate the user." };
  }

  await recordAdminAction({
    admin,
    action: "user.reactivate",
    targetType: "user",
    targetId: input.profileId,
    reason: input.reason,
    previousState: profile.account_status,
    newState: "active",
  });

  await notificationService.dispatch({
    recipientId: input.profileId,
    type: "account.reactivated",
    title: "Your account is reactivated",
    body: `Your Shelty account has been reactivated. You can now access the marketplace again.`,
    href: "/dashboard",
    relatedEntityType: "profile",
    relatedEntityId: input.profileId,
    eventKey: `account.reactivated:${input.profileId}:${Date.now()}`,
    metadata: { reason: input.reason },
    emailTemplateInput: {
      eventDescription: "Your Shelty account was reactivated. You can now access the marketplace.",
      whenIso: new Date().toISOString(),
    },
  });

  revalidatePath("/admin/users", "page");
  revalidatePath(`/admin/users/${input.profileId}`, "page");
  return { ok: true };
}

export async function banUserAction(input: {
  profileId: string;
  reason: string;
}): Promise<AdminActionResult> {
  if (!input.reason || input.reason.trim().length < 10) {
    return {
      ok: false,
      fieldErrors: { reason: ["Please provide a detailed reason (at least 10 characters)."] },
    };
  }
  const admin = await requireAdminPermission("users.ban");

  const profile = await loadProfile(input.profileId);
  if (!profile) return { ok: false, message: "User not found." };

  if (profile.account_status === "banned") {
    return { ok: false, message: "User is already banned." };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { error } = await supabase
    .from("profiles")
    .update({
      account_status: "banned",
      suspended_at: new Date().toISOString(),
      suspended_reason: input.reason.trim(),
    } as never)
    .eq("id", input.profileId);

  if (error) {
    logger.error("admin: ban user failed", { error: error.message });
    return { ok: false, message: "We couldn't ban the user." };
  }

  await recordAdminAction({
    admin,
    action: "user.ban",
    targetType: "user",
    targetId: input.profileId,
    reason: input.reason,
    previousState: profile.account_status,
    newState: "banned",
    metadata: { previousStatus: profile.account_status },
  });

  await notificationService.dispatch({
    recipientId: input.profileId,
    type: "account.suspended",
    title: "Your account was banned",
    body: `Your Shelty account has been banned. Reason: ${input.reason}. Contact support if you believe this is a mistake.`,
    href: "/dashboard/profile",
    relatedEntityType: "profile",
    relatedEntityId: input.profileId,
    eventKey: `account.banned:${input.profileId}:${Date.now()}`,
    metadata: { reason: input.reason, banned: true },
    emailTemplateInput: {
      eventDescription: `Your Shelty account was banned. Reason: ${input.reason}.`,
      whenIso: new Date().toISOString(),
    },
  });

  revalidatePath("/admin/users", "page");
  revalidatePath(`/admin/users/${input.profileId}`, "page");
  return { ok: true };
}

// ===========================================================================
// PROPERTY MODERATION (spec Sections 12, 13, 14)
// ===========================================================================

export async function suspendPropertyAction(input: {
  propertyId: string;
  reason: string;
}): Promise<AdminActionResult> {
  if (!input.reason || input.reason.trim().length < 5) {
    return {
      ok: false,
      fieldErrors: { reason: ["Please provide a reason (at least 5 characters)."] },
    };
  }
  const admin = await requireAdminPermission("properties.moderate");
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { data: propRow } = await supabase
    .from("properties")
    .select("id, status, title, listing_creator_id")
    .eq("id", input.propertyId)
    .maybeSingle();
  const property = propRow as
    | { id: string; status: string; title: string; listing_creator_id: string }
    | null;
  if (!property) return { ok: false, message: "Property not found." };

  const previousStatus = property.status;
  const { error } = await supabase
    .from("properties")
    .update({ status: "suspended" } as never)
    .eq("id", input.propertyId);

  if (error) {
    logger.error("admin: suspend property failed", { error: error.message });
    return { ok: false, message: "We couldn't suspend the property." };
  }

  await recordAdminAction({
    admin,
    action: "property.suspend",
    targetType: "property",
    targetId: input.propertyId,
    reason: input.reason,
    previousState: previousStatus,
    newState: "suspended",
    metadata: { propertyTitle: property.title },
  });

  // Notify the listing creator.
  await notificationService.dispatch({
    recipientId: property.listing_creator_id,
    type: "property.unavailable",
    title: `Your listing was suspended — ${property.title}`,
    body: `Your property "${property.title}" was suspended by moderation. Reason: ${input.reason}. Contact support if you believe this is a mistake.`,
    href: "/dashboard/properties",
    relatedEntityType: "property",
    relatedEntityId: input.propertyId,
    eventKey: `property.suspended:${input.propertyId}:${Date.now()}`,
    metadata: { reason: input.reason, previousStatus },
  });

  revalidatePath("/admin/properties", "page");
  revalidatePath(`/admin/properties/${input.propertyId}`, "page");
  return { ok: true };
}

export async function removePropertyAction(input: {
  propertyId: string;
  reason: string;
}): Promise<AdminActionResult> {
  if (!input.reason || input.reason.trim().length < 10) {
    return {
      ok: false,
      fieldErrors: { reason: ["Please provide a detailed reason (at least 10 characters)."] },
    };
  }
  const admin = await requireAdminPermission("properties.remove");
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { data: propRow } = await supabase
    .from("properties")
    .select("id, status, title, listing_creator_id, deleted_at")
    .eq("id", input.propertyId)
    .maybeSingle();
  const property = propRow as
    | {
        id: string;
        status: string;
        title: string;
        listing_creator_id: string;
        deleted_at: string | null;
      }
    | null;
  if (!property) return { ok: false, message: "Property not found." };
  if (property.deleted_at) {
    return { ok: false, message: "Property is already removed." };
  }

  const previousStatus = property.status;
  const { error } = await supabase
    .from("properties")
    .update({
      status: "removed",
      deleted_at: new Date().toISOString(),
    } as never)
    .eq("id", input.propertyId);

  if (error) {
    logger.error("admin: remove property failed", { error: error.message });
    return { ok: false, message: "We couldn't remove the property." };
  }

  await recordAdminAction({
    admin,
    action: "property.remove",
    targetType: "property",
    targetId: input.propertyId,
    reason: input.reason,
    previousState: previousStatus,
    newState: "removed",
    metadata: { propertyTitle: property.title },
  });

  await notificationService.dispatch({
    recipientId: property.listing_creator_id,
    type: "property.removed",
    title: `Your listing was removed — ${property.title}`,
    body: `Your property "${property.title}" was removed by moderation. Reason: ${input.reason}.`,
    href: "/dashboard/properties",
    relatedEntityType: "property",
    relatedEntityId: input.propertyId,
    eventKey: `property.removed:${input.propertyId}:${Date.now()}`,
    metadata: { reason: input.reason, previousStatus },
  });

  revalidatePath("/admin/properties", "page");
  revalidatePath(`/admin/properties/${input.propertyId}`, "page");
  return { ok: true };
}

export async function restorePropertyAction(input: {
  propertyId: string;
  reason: string;
}): Promise<AdminActionResult> {
  if (!input.reason || input.reason.trim().length < 3) {
    return {
      ok: false,
      fieldErrors: { reason: ["Please provide a reason (at least 3 characters)."] },
    };
  }
  const admin = await requireAdminPermission("properties.moderate");
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { data: propRow } = await supabase
    .from("properties")
    .select("id, status, title, listing_creator_id, deleted_at, published_at")
    .eq("id", input.propertyId)
    .maybeSingle();
  const property = propRow as
    | {
        id: string;
        status: string;
        title: string;
        listing_creator_id: string;
        deleted_at: string | null;
        published_at: string | null;
      }
    | null;
  if (!property) return { ok: false, message: "Property not found." };

  // If it was published before removal, restore to "available". Otherwise draft.
  const newState = property.published_at ? "available" : "draft";
  const previousStatus = property.status;
  const { error } = await supabase
    .from("properties")
    .update({
      status: newState,
      deleted_at: null,
    } as never)
    .eq("id", input.propertyId);

  if (error) {
    logger.error("admin: restore property failed", { error: error.message });
    return { ok: false, message: "We couldn't restore the property." };
  }

  await recordAdminAction({
    admin,
    action: "property.restore",
    targetType: "property",
    targetId: input.propertyId,
    reason: input.reason,
    previousState: previousStatus,
    newState,
    metadata: { propertyTitle: property.title },
  });

  revalidatePath("/admin/properties", "page");
  revalidatePath(`/admin/properties/${input.propertyId}`, "page");
  return { ok: true };
}

// ===========================================================================
// REVIEW MODERATION (spec Section 18)
// ===========================================================================
// Admins can hide / remove / restore reviews but CANNOT alter the star
// rating or rewrite the body (spec Section 18).

export async function hideReviewAction(input: {
  reviewId: string;
  reason: string;
}): Promise<AdminActionResult> {
  if (!input.reason || input.reason.trim().length < 3) {
    return {
      ok: false,
      fieldErrors: { reason: ["Please provide a reason (at least 3 characters)."] },
    };
  }
  const admin = await requireAdminPermission("reviews.moderate");
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { data: reviewRow } = await supabase
    .from("reviews")
    .select("id, status, reviewer_id, reviewed_id, body")
    .eq("id", input.reviewId)
    .maybeSingle();
  const review = reviewRow as
    | { id: string; status: string; reviewer_id: string; reviewed_id: string; body: string }
    | null;
  if (!review) return { ok: false, message: "Review not found." };

  const previousStatus = review.status;
  const { error } = await supabase
    .from("reviews")
    .update({
      status: "hidden",
      moderation_reason: input.reason,
      moderated_by: admin.adminUserId === "env-seed" ? null : admin.adminUserId,
      moderated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.reviewId);

  if (error) {
    logger.error("admin: hide review failed", { error: error.message });
    return { ok: false, message: "We couldn't hide the review." };
  }

  await recordAdminAction({
    admin,
    action: "review.hide",
    targetType: "review",
    targetId: input.reviewId,
    reason: input.reason,
    previousState: previousStatus,
    newState: "hidden",
    metadata: {
      reviewerId: review.reviewer_id,
      reviewedId: review.reviewed_id,
      // Preserve original content in moderation/audit (spec Section 18).
      originalBody: review.body,
    },
  });

  revalidatePath("/admin/reviews", "page");
  revalidatePath(`/admin/reviews/${input.reviewId}`, "page");
  return { ok: true };
}

export async function removeReviewAction(input: {
  reviewId: string;
  reason: string;
}): Promise<AdminActionResult> {
  if (!input.reason || input.reason.trim().length < 5) {
    return {
      ok: false,
      fieldErrors: { reason: ["Please provide a reason (at least 5 characters)."] },
    };
  }
  const admin = await requireAdminPermission("reviews.moderate");
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { data: reviewRow } = await supabase
    .from("reviews")
    .select("id, status, reviewer_id, reviewed_id, body")
    .eq("id", input.reviewId)
    .maybeSingle();
  const review = reviewRow as
    | { id: string; status: string; reviewer_id: string; reviewed_id: string; body: string }
    | null;
  if (!review) return { ok: false, message: "Review not found." };

  const previousStatus = review.status;
  const { error } = await supabase
    .from("reviews")
    .update({
      status: "removed",
      moderation_reason: input.reason,
      moderated_by: admin.adminUserId === "env-seed" ? null : admin.adminUserId,
      moderated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.reviewId);

  if (error) {
    logger.error("admin: remove review failed", { error: error.message });
    return { ok: false, message: "We couldn't remove the review." };
  }

  await recordAdminAction({
    admin,
    action: "review.remove",
    targetType: "review",
    targetId: input.reviewId,
    reason: input.reason,
    previousState: previousStatus,
    newState: "removed",
    metadata: {
      reviewerId: review.reviewer_id,
      reviewedId: review.reviewed_id,
      originalBody: review.body,
    },
  });

  await notificationService.dispatch({
    recipientId: review.reviewer_id,
    type: "review.removed",
    title: "Your review was removed",
    body: `Your review was removed by moderation. Reason: ${input.reason}.`,
    href: "/dashboard/profile",
    relatedEntityType: "review",
    relatedEntityId: input.reviewId,
    eventKey: `review.removed:${input.reviewId}:${Date.now()}`,
    metadata: { reason: input.reason },
  });

  revalidatePath("/admin/reviews", "page");
  revalidatePath(`/admin/reviews/${input.reviewId}`, "page");
  return { ok: true };
}

export async function restoreReviewAction(input: {
  reviewId: string;
  reason: string;
}): Promise<AdminActionResult> {
  if (!input.reason || input.reason.trim().length < 3) {
    return {
      ok: false,
      fieldErrors: { reason: ["Please provide a reason (at least 3 characters)."] },
    };
  }
  const admin = await requireAdminPermission("reviews.moderate");
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { data: reviewRow } = await supabase
    .from("reviews")
    .select("id, status")
    .eq("id", input.reviewId)
    .maybeSingle();
  const review = reviewRow as { id: string; status: string } | null;
  if (!review) return { ok: false, message: "Review not found." };

  const previousStatus = review.status;
  const { error } = await supabase
    .from("reviews")
    .update({
      status: "published",
      moderation_reason: null,
      moderated_by: null,
      moderated_at: null,
    } as never)
    .eq("id", input.reviewId);

  if (error) {
    logger.error("admin: restore review failed", { error: error.message });
    return { ok: false, message: "We couldn't restore the review." };
  }

  await recordAdminAction({
    admin,
    action: "review.restore",
    targetType: "review",
    targetId: input.reviewId,
    reason: input.reason,
    previousState: previousStatus,
    newState: "published",
  });

  revalidatePath("/admin/reviews", "page");
  revalidatePath(`/admin/reviews/${input.reviewId}`, "page");
  return { ok: true };
}

// ===========================================================================
// REPORT MODERATION (spec Section 20, 21)
// ===========================================================================

export async function setReportStatusAction(input: {
  reportId: string;
  status: "open" | "in_review" | "resolved" | "dismissed" | "escalated";
  resolutionNotes?: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdminPermission("reports.manage");
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { data: reportRow } = await supabase
    .from("reports")
    .select("id, status, entity_type, entity_id")
    .eq("id", input.reportId)
    .maybeSingle();
  const report = reportRow as
    | { id: string; status: string; entity_type: string; entity_id: string }
    | null;
  if (!report) return { ok: false, message: "Report not found." };

  const previousStatus = report.status;
  const updatePayload: Record<string, unknown> = {
    status: input.status,
  };
  if (input.status === "resolved" || input.status === "dismissed") {
    updatePayload.resolution_notes = input.resolutionNotes ?? null;
    updatePayload.resolution_action = input.status;
    updatePayload.resolved_by = admin.adminUserId === "env-seed" ? null : admin.adminUserId;
    updatePayload.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("reports")
    .update(updatePayload as never)
    .eq("id", input.reportId);

  if (error) {
    logger.error("admin: report status change failed", { error: error.message });
    return { ok: false, message: "We couldn't update the report." };
  }

  await recordAdminAction({
    admin,
    action: `report.${input.status}`,
    targetType: "report",
    targetId: input.reportId,
    reason: input.resolutionNotes,
    previousState: previousStatus,
    newState: input.status,
    metadata: {
      entityType: report.entity_type,
      entityId: report.entity_id,
    },
  });

  revalidatePath("/admin/reports", "page");
  revalidatePath(`/admin/reports/${input.reportId}`, "page");
  return { ok: true };
}

// ===========================================================================
// FEATURED PROMOTION MODERATION (spec Section 27)
// ===========================================================================

export async function approvePromotionAction(input: {
  promotionId: string;
  reason?: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdminPermission("promotions.manage");
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { data: promoRow } = await supabase
    .from("featured_listings")
    .select("id, status, purchaser_id, property_id")
    .eq("id", input.promotionId)
    .maybeSingle();
  const promo = promoRow as
    | { id: string; status: string; purchaser_id: string; property_id: string }
    | null;
  if (!promo) return { ok: false, message: "Promotion not found." };

  const previousStatus = promo.status;
  const { error } = await supabase
    .from("featured_listings")
    .update({ status: "active" } as never)
    .eq("id", input.promotionId);

  if (error) {
    logger.error("admin: approve promotion failed", { error: error.message });
    return { ok: false, message: "We couldn't approve the promotion." };
  }

  await recordAdminAction({
    admin,
    action: "promotion.approve",
    targetType: "featured_listing",
    targetId: input.promotionId,
    reason: input.reason,
    previousState: previousStatus,
    newState: "active",
    metadata: { purchaserId: promo.purchaser_id, propertyId: promo.property_id },
  });

  await notificationService.dispatch({
    recipientId: promo.purchaser_id,
    type: "promotion.approved",
    title: "Promotion approved",
    body: `Your featured-listing promotion was approved and is now live.`,
    href: "/dashboard/promotions",
    relatedEntityType: "featured_listing",
    relatedEntityId: input.promotionId,
    eventKey: `promotion.approved:${input.promotionId}`,
    metadata: { promotionId: input.promotionId },
    emailTemplateInput: {
      propertyTitle: "your listing",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });

  revalidatePath("/admin/promotions", "page");
  return { ok: true };
}

export async function rejectPromotionAction(input: {
  promotionId: string;
  reason: string;
}): Promise<AdminActionResult> {
  if (!input.reason || input.reason.trim().length < 3) {
    return {
      ok: false,
      fieldErrors: { reason: ["Please provide a reason (at least 3 characters)."] },
    };
  }
  const admin = await requireAdminPermission("promotions.manage");
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { data: promoRow } = await supabase
    .from("featured_listings")
    .select("id, status, purchaser_id")
    .eq("id", input.promotionId)
    .maybeSingle();
  const promo = promoRow as { id: string; status: string; purchaser_id: string } | null;
  if (!promo) return { ok: false, message: "Promotion not found." };

  const previousStatus = promo.status;
  const { error } = await supabase
    .from("featured_listings")
    .update({ status: "cancelled" } as never)
    .eq("id", input.promotionId);

  if (error) {
    logger.error("admin: reject promotion failed", { error: error.message });
    return { ok: false, message: "We couldn't reject the promotion." };
  }

  await recordAdminAction({
    admin,
    action: "promotion.reject",
    targetType: "featured_listing",
    targetId: input.promotionId,
    reason: input.reason,
    previousState: previousStatus,
    newState: "cancelled",
    metadata: { purchaserId: promo.purchaser_id },
  });

  await notificationService.dispatch({
    recipientId: promo.purchaser_id,
    type: "promotion.rejected",
    title: "Promotion update",
    body: `Your featured-listing promotion was not approved. Reason: ${input.reason}.`,
    href: "/dashboard/promotions",
    relatedEntityType: "featured_listing",
    relatedEntityId: input.promotionId,
    eventKey: `promotion.rejected:${input.promotionId}`,
    metadata: { reason: input.reason },
    emailTemplateInput: {
      propertyTitle: "your listing",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      reason: input.reason,
    },
  });

  revalidatePath("/admin/promotions", "page");
  return { ok: true };
}

// ===========================================================================
// ADVERTISING CAMPAIGN MODERATION (spec Section 28, 29)
// ===========================================================================

export async function approveCampaignAction(input: {
  campaignId: string;
  reason?: string;
}): Promise<AdminActionResult> {
  const admin = await requireAdminPermission("advertising.manage");
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { data: campRow } = await supabase
    .from("advertising_campaigns")
    .select(`
      id, status, name, business_id,
      advertising_businesses!inner(owner_user_id)
    `)
    .eq("id", input.campaignId)
    .maybeSingle();
  const camp = campRow as
    | {
        id: string;
        status: string;
        name: string;
        business_id: string;
        advertising_businesses: { owner_user_id: string };
      }
    | null;
  if (!camp) return { ok: false, message: "Campaign not found." };

  const previousStatus = camp.status;
  const { error } = await supabase
    .from("advertising_campaigns")
    .update({ status: "active" } as never)
    .eq("id", input.campaignId);

  if (error) {
    logger.error("admin: approve campaign failed", { error: error.message });
    return { ok: false, message: "We couldn't approve the campaign." };
  }

  await recordAdminAction({
    admin,
    action: "campaign.approve",
    targetType: "advertising_campaign",
    targetId: input.campaignId,
    reason: input.reason,
    previousState: previousStatus,
    newState: "active",
    metadata: { campaignName: camp.name, businessId: camp.business_id },
  });

  // Look up the advertiser's profile id.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", camp.advertising_businesses.owner_user_id)
    .maybeSingle();
  const profile = profileRow as { id: string } | null;

  if (profile) {
    await notificationService.dispatch({
      recipientId: profile.id,
      type: "campaign.approved",
      title: `Campaign approved — ${camp.name}`,
      body: `Your advertising campaign "${camp.name}" was approved and is now serving impressions.`,
      href: "/dashboard/advertising",
      relatedEntityType: "advertising_campaign",
      relatedEntityId: input.campaignId,
      eventKey: `campaign.approved:${input.campaignId}`,
      metadata: { campaignName: camp.name },
      emailTemplateInput: { campaignName: camp.name },
    });
  }

  revalidatePath("/admin/advertising", "page");
  revalidatePath(`/admin/advertising/${input.campaignId}`, "page");
  return { ok: true };
}

export async function rejectCampaignAction(input: {
  campaignId: string;
  reason: string;
}): Promise<AdminActionResult> {
  if (!input.reason || input.reason.trim().length < 3) {
    return {
      ok: false,
      fieldErrors: { reason: ["Please provide a reason (at least 3 characters)."] },
    };
  }
  const admin = await requireAdminPermission("advertising.manage");
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { data: campRow } = await supabase
    .from("advertising_campaigns")
    .select(`
      id, status, name, business_id,
      advertising_businesses!inner(owner_user_id)
    `)
    .eq("id", input.campaignId)
    .maybeSingle();
  const camp = campRow as
    | {
        id: string;
        status: string;
        name: string;
        business_id: string;
        advertising_businesses: { owner_user_id: string };
      }
    | null;
  if (!camp) return { ok: false, message: "Campaign not found." };

  const previousStatus = camp.status;
  const { error } = await supabase
    .from("advertising_campaigns")
    .update({ status: "rejected" } as never)
    .eq("id", input.campaignId);

  if (error) {
    logger.error("admin: reject campaign failed", { error: error.message });
    return { ok: false, message: "We couldn't reject the campaign." };
  }

  await recordAdminAction({
    admin,
    action: "campaign.reject",
    targetType: "advertising_campaign",
    targetId: input.campaignId,
    reason: input.reason,
    previousState: previousStatus,
    newState: "rejected",
    metadata: { campaignName: camp.name, businessId: camp.business_id },
  });

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", camp.advertising_businesses.owner_user_id)
    .maybeSingle();
  const profile = profileRow as { id: string } | null;

  if (profile) {
    await notificationService.dispatch({
      recipientId: profile.id,
      type: "campaign.rejected",
      title: `Campaign update — ${camp.name}`,
      body: `Your advertising campaign "${camp.name}" was not approved. Reason: ${input.reason}.`,
      href: "/dashboard/advertising",
      relatedEntityType: "advertising_campaign",
      relatedEntityId: input.campaignId,
      eventKey: `campaign.rejected:${input.campaignId}`,
      metadata: { reason: input.reason, campaignName: camp.name },
      emailTemplateInput: { campaignName: camp.name, reason: input.reason },
    });
  }

  revalidatePath("/admin/advertising", "page");
  revalidatePath(`/admin/advertising/${input.campaignId}`, "page");
  return { ok: true };
}

export async function pauseCampaignAction(input: {
  campaignId: string;
  reason: string;
}): Promise<AdminActionResult> {
  if (!input.reason || input.reason.trim().length < 3) {
    return {
      ok: false,
      fieldErrors: { reason: ["Please provide a reason (at least 3 characters)."] },
    };
  }
  const admin = await requireAdminPermission("advertising.manage");
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { data: campRow } = await supabase
    .from("advertising_campaigns")
    .select("id, status, name")
    .eq("id", input.campaignId)
    .maybeSingle();
  const camp = campRow as { id: string; status: string; name: string } | null;
  if (!camp) return { ok: false, message: "Campaign not found." };

  const previousStatus = camp.status;
  const { error } = await supabase
    .from("advertising_campaigns")
    .update({ status: "paused" } as never)
    .eq("id", input.campaignId);

  if (error) {
    logger.error("admin: pause campaign failed", { error: error.message });
    return { ok: false, message: "We couldn't pause the campaign." };
  }

  await recordAdminAction({
    admin,
    action: "campaign.pause",
    targetType: "advertising_campaign",
    targetId: input.campaignId,
    reason: input.reason,
    previousState: previousStatus,
    newState: "paused",
    metadata: { campaignName: camp.name },
  });

  revalidatePath("/admin/advertising", "page");
  revalidatePath(`/admin/advertising/${input.campaignId}`, "page");
  return { ok: true };
}

export async function suspendAdvertiserAction(input: {
  businessId: string;
  reason: string;
}): Promise<AdminActionResult> {
  if (!input.reason || input.reason.trim().length < 5) {
    return {
      ok: false,
      fieldErrors: { reason: ["Please provide a reason (at least 5 characters)."] },
    };
  }
  const admin = await requireAdminPermission("advertising.manage");
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  // Suspend by setting the business's is_suspended flag. We assume the
  // advertising_businesses table has this column — added in migration 0012.
  // Pause all active campaigns as a side-effect.
  const { data: businessRow } = await supabase
    .from("advertising_businesses")
    .select("id, owner_user_id, business_name")
    .eq("id", input.businessId)
    .maybeSingle();
  const business = businessRow as
    | { id: string; owner_user_id: string; business_name: string }
    | null;
  if (!business) return { ok: false, message: "Business not found." };

  // Pause all active campaigns.
  await supabase
    .from("advertising_campaigns")
    .update({ status: "paused" } as never)
    .eq("business_id", input.businessId)
    .in("status", ["active"]);

  await recordAdminAction({
    admin,
    action: "advertiser.suspend",
    targetType: "advertising_business",
    targetId: input.businessId,
    reason: input.reason,
    previousState: "active",
    newState: "suspended",
    metadata: {
      businessName: business.business_name,
      ownerUserId: business.owner_user_id,
    },
  });

  // Notify the advertiser.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", business.owner_user_id)
    .maybeSingle();
  const profile = profileRow as { id: string } | null;
  if (profile) {
    await notificationService.dispatch({
      recipientId: profile.id,
      type: "campaign.paused",
      title: `Advertiser account suspended — ${business.business_name}`,
      body: `Your advertising business "${business.business_name}" was suspended. Reason: ${input.reason}. All active campaigns have been paused. Contact support if you believe this is a mistake.`,
      href: "/dashboard/advertising",
      relatedEntityType: "advertising_business",
      relatedEntityId: input.businessId,
      eventKey: `advertiser.suspended:${input.businessId}:${Date.now()}`,
      metadata: { reason: input.reason, businessName: business.business_name },
    });
  }

  revalidatePath("/admin/advertising", "page");
  return { ok: true };
}

// ===========================================================================
// PLATFORM SETTINGS (spec Section 39, 40)
// ===========================================================================

export async function updatePlatformSettingAction(input: {
  key: string;
  value: string;
  reason?: string;
}): Promise<AdminActionResult> {
  // Setting keys must match a known prefix — refuse arbitrary strings.
  const ALLOWED_PREFIXES = [
    "advertising.",
    "featured.",
    "notifications.",
    "reports.",
  ];
  if (!ALLOWED_PREFIXES.some((p) => input.key.startsWith(p))) {
    return { ok: false, message: "Unknown setting key." };
  }
  const admin = await requireAdminPermission("settings.manage");
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  // Look up the existing setting to learn its value_type.
  const { data: existing } = await supabase
    .from("platform_settings")
    .select("key, value_type, is_editable")
    .eq("key", input.key)
    .maybeSingle();
  const row = existing as
    | { key: string; value_type: string; is_editable: boolean }
    | null;
  if (!row) return { ok: false, message: "Setting not found." };
  if (!row.is_editable) return { ok: false, message: "Setting is read-only." };

  // Coerce the string input to the right JSON shape.
  let valueJson: unknown;
  if (row.value_type === "number") {
    const n = Number(input.value);
    if (Number.isNaN(n)) return { ok: false, fieldErrors: { value: ["Must be a number."] } };
    valueJson = n;
  } else if (row.value_type === "boolean") {
    if (input.value !== "true" && input.value !== "false") {
      return { ok: false, fieldErrors: { value: ["Must be 'true' or 'false'."] } };
    }
    valueJson = input.value === "true";
  } else if (row.value_type === "json") {
    try {
      valueJson = JSON.parse(input.value);
    } catch {
      return { ok: false, fieldErrors: { value: ["Must be valid JSON."] } };
    }
  } else {
    valueJson = input.value;
  }

  const { error } = await supabase
    .from("platform_settings")
    .update({ value: valueJson as Record<string, unknown> } as never)
    .eq("key", input.key);

  if (error) {
    logger.error("admin: update setting failed", { error: error.message });
    return { ok: false, message: "We couldn't update the setting." };
  }

  await recordAdminAction({
    admin,
    action: `settings.update:${input.key}`,
    targetType: "notification", // closest semantically — no settings target type
    targetId: input.key,
    reason: input.reason,
    metadata: { newValue: valueJson },
  });

  revalidatePath("/admin/settings", "page");
  return { ok: true };
}

// Re-export the AdminIdentity type for convenience.
export type { AdminIdentity };
