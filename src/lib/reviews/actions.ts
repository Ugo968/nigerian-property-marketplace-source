"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createAdminClient } from "@/lib/db/supabase";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/server";
import { rateLimiter, RATE_LIMITS } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging";
import { notificationService } from "@/lib/notifications";
import { canCreateReview } from "./eligibility";
import type { UserRole } from "@/types";

/**
 * Review server actions.
 *
 * Per spec Sections 7, 8, 9, 10, 16, 17, 18, 22, 23, 25, 37:
 *   * Eligibility checked server-side via canCreateReview()
 *   * Duplicate prevention via DB UNIQUE constraints
 *   * Content sanitised (HTML-escaped, length-validated)
 *   * Reviewer identity derived from server session
 *   * Reviewee + interaction validated server-side
 *   * Rate-limited (review creation: 10/hr, editing: 20/hr)
 *   * Soft removal (status='removed') — never hard-deleted
 *   * Audit events for all lifecycle changes
 *   * No fake reviews (spec Section 36)
 */

export type ReviewActionResult =
  | { ok: true; reviewId?: string; redirectTo?: string }
  | { ok: false; fieldErrors?: Record<string, string[]>; message?: string; requiresAuth?: boolean };

const MAX_REVIEW_BODY = 3000;
const MAX_REVIEW_TITLE = 200;

// ---------------------------------------------------------------------------
// CREATE REVIEW
// ---------------------------------------------------------------------------

export async function createReviewAction(input: {
  revieweeId: string;
  rating: number;
  title?: string;
  body: string;
  applicationId?: string;
  conversationId?: string;
  propertyId?: string;
}): Promise<ReviewActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, requiresAuth: true, message: "Please sign in to leave a review." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, requiresAuth: true };
  }

  // Eligibility check (spec Section 7) — centralized service
  const eligibility = await canCreateReview(input.revieweeId);
  if (!eligibility.canReview) {
    return { ok: false, message: eligibility.reason ?? "You're not eligible to review this user." };
  }

  // Validate rating (spec Section 6) — 1 to 5 whole numbers
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return {
      ok: false,
      fieldErrors: { rating: ["Rating must be a whole number between 1 and 5."] },
    };
  }

  // Validate body (spec Section 16)
  const body = input.body?.trim();
  if (!body || body.length < 10) {
    return {
      ok: false,
      fieldErrors: { body: ["Review must be at least 10 characters."] },
    };
  }
  if (body.length > MAX_REVIEW_BODY) {
    return {
      ok: false,
      fieldErrors: { body: [`Review must be at most ${MAX_REVIEW_BODY} characters.`] },
    };
  }

  // Validate title (optional, max 200 chars)
  const title = input.title?.trim() || null;
  if (title && title.length > MAX_REVIEW_TITLE) {
    return {
      ok: false,
      fieldErrors: { title: [`Title must be at most ${MAX_REVIEW_TITLE} characters.`] },
    };
  }

  // Rate-limit (spec Section 25)
  const rl = await rateLimiter.check({
    key: user.id,
    action: "review_create",
    limit: 10,
    windowMs: 60 * 60 * 1000, // 10 reviews / hour
  });
  if (!rl.ok) {
    return { ok: false, message: "You've submitted too many reviews recently. Please try again later." };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Determine the reviewee's role for reviewed_entity_type
  const { data: revieweeRow } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", input.revieweeId)
    .maybeSingle();
  const revieweeRole = (revieweeRow as { role: UserRole } | null)?.role;
  if (!revieweeRole || !["landlord", "agent", "company"].includes(revieweeRole)) {
    return { ok: false, message: "Invalid reviewee." };
  }

  // Sanitise body — HTML-escape (spec Section 16: "prevent HTML/script injection")
  const sanitisedBody = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const sanitisedTitle = title
    ? title
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
    : null;

  // Insert the review — reviewer_id derived from server session
  const { data: review, error } = await supabase
    .from("reviews")
    .insert({
      reviewer_id: profile.id,
      reviewed_id: input.revieweeId,
      reviewed_entity_type: revieweeRole,
      rating: input.rating,
      title: sanitisedTitle,
      body: sanitisedBody,
      status: "published", // V1: auto-publish (future: pending → admin review)
      application_id: input.applicationId ?? null,
      conversation_id: input.conversationId ?? null,
      property_id: input.propertyId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // UNIQUE constraint violation = duplicate review
    if (error.code === "23505") {
      return { ok: false, message: "You've already reviewed this user for this interaction." };
    }
    logger.error("Review creation failed", { userId: user.id, error: error.message });
    return { ok: false, message: "We couldn't submit your review." };
  }

  // Audit log (metadata only — no review body in audit)
  const admin = createAdminClient();
  if (admin) {
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "review_created",
      target_type: "review",
      target_id: (review as { id: string }).id,
      metadata: {
        reviewee_id: input.revieweeId,
        rating: input.rating,
        interaction_type: eligibility.qualifyingInteraction?.type,
      },
    });
  }

  revalidatePath(`/agents/${input.revieweeId}`, "page");
  revalidatePath(`/companies/${input.revieweeId}`, "page");
  revalidatePath(`/landlords/${input.revieweeId}`, "page");

  // Notify the reviewed party (spec Section 23). Idempotent via eventKey.
  const reviewId = (review as { id: string }).id;
  await notificationService.dispatch({
    recipientId: input.revieweeId,
    type: "review.received",
    title: `${profile.full_name} left you a review`,
    body: `${profile.full_name} rated you ${input.rating} star${input.rating === 1 ? "" : "s"}.`,
    href: `/dashboard/profile`,
    relatedEntityType: "review",
    relatedEntityId: reviewId,
    eventKey: `review.received:${reviewId}`,
    metadata: {
      reviewId,
      reviewerProfileId: profile.id,
      reviewerName: profile.full_name,
      rating: input.rating,
    },
    emailTemplateInput: {
      reviewerName: profile.full_name,
      rating: input.rating,
      preview: sanitisedBody,
    },
  });
  // Confirm to the reviewer that the review was published
  await notificationService.dispatch({
    recipientId: profile.id,
    type: "review.published",
    title: "Review published",
    body: `Your review was published.`,
    href: `/dashboard/profile`,
    relatedEntityType: "review",
    relatedEntityId: reviewId,
    eventKey: `review.published:${reviewId}`,
    metadata: { reviewId, revieweeId: input.revieweeId, rating: input.rating },
  });

  return { ok: true, reviewId };
}

// ---------------------------------------------------------------------------
// EDIT REVIEW (spec Section 9)
// ---------------------------------------------------------------------------

export async function editReviewAction(input: {
  reviewId: string;
  rating?: number;
  title?: string;
  body?: string;
}): Promise<ReviewActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const supabase = await createServerClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  // Verify ownership (spec Section 22: "edit only their own reviews")
  const { data: reviewRow } = await supabase
    .from("reviews")
    .select("id, reviewer_id, status")
    .eq("id", input.reviewId)
    .maybeSingle();

  if (!reviewRow) {
    return { ok: false, message: "Review not found." };
  }

  const review = reviewRow as { id: string; reviewer_id: string; status: string };
  if (review.reviewer_id !== profile.id) {
    return { ok: false, message: "FORBIDDEN" };
  }

  // Rate-limit
  const rl = await rateLimiter.check({
    key: user.id,
    action: "review_edit",
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many edits. Try again later." };
  }

  // Build update payload — only allow content fields (spec Section 9:
  // "Do not allow changing the reviewer or reviewee")
  const updates: Record<string, unknown> = {};

  if (input.rating !== undefined) {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      return { ok: false, fieldErrors: { rating: ["Rating must be 1-5."] } };
    }
    updates.rating = input.rating;
  }

  if (input.body !== undefined) {
    const body = input.body.trim();
    if (body.length < 10 || body.length > MAX_REVIEW_BODY) {
      return { ok: false, fieldErrors: { body: [`Review must be 10-${MAX_REVIEW_BODY} characters.`] } };
    }
    // Sanitise
    updates.body = body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  if (input.title !== undefined) {
    const title = input.title.trim();
    updates.title = title || null;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, message: "No fields to update." };
  }

  updates.edited_at = new Date().toISOString();

  const { error } = await supabase
    .from("reviews")
    .update(updates)
    .eq("id", input.reviewId);

  if (error) {
    return { ok: false, message: "We couldn't update your review." };
  }

  // Audit
  const admin = createAdminClient();
  if (admin) {
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "review_updated",
      target_type: "review",
      target_id: input.reviewId,
      metadata: {},
    });
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// REQUEST REMOVAL (spec Section 10)
// ---------------------------------------------------------------------------

export async function requestReviewRemovalAction(reviewId: string): Promise<ReviewActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const supabase = await createServerClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  // Verify ownership
  const { data: reviewRow } = await supabase
    .from("reviews")
    .select("id, reviewer_id, status")
    .eq("id", reviewId)
    .maybeSingle();

  if (!reviewRow) {
    return { ok: false, message: "Review not found." };
  }

  const review = reviewRow as { id: string; reviewer_id: string; status: string };
  if (review.reviewer_id !== profile.id) {
    return { ok: false, message: "FORBIDDEN" };
  }

  // Soft-remove (spec Section 10: "Use a soft-removal/moderation model")
  const { error } = await supabase
    .from("reviews")
    .update({
      status: "removed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  if (error) {
    return { ok: false, message: "We couldn't remove the review." };
  }

  // Audit (spec Section 23)
  const admin = createAdminClient();
  if (admin) {
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "review_removed",
      target_type: "review",
      target_id: reviewId,
      metadata: { previous_status: review.status },
    });
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// REPORT REVIEW (spec Section 17)
// ---------------------------------------------------------------------------

export async function reportReviewAction(input: {
  reviewId: string;
  reason: string;
  description: string;
}): Promise<ReviewActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  // Validate reason (spec Section 17)
  const allowedReasons = new Set([
    "spam", "fake_misleading", "harassment", "threatening_abusive",
    "personal_information", "conflict_of_interest", "other",
  ]);
  if (!allowedReasons.has(input.reason)) {
    return { ok: false, fieldErrors: { reason: ["Invalid report reason."] } };
  }

  if (input.description.trim().length < 10) {
    return {
      ok: false,
      fieldErrors: { description: ["Please describe the issue (at least 10 characters)."] },
    };
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
  if (!supabase) return { ok: false, message: "Database not configured." };

  // Check for duplicate reports (spec Section 17: "Prevent users from endlessly submitting duplicate reports")
  const { data: existingReport } = await supabase
    .from("reports")
    .select("id")
    .eq("reporter_id", profile.id)
    .eq("entity_type", "review")
    .eq("entity_id", input.reviewId)
    .maybeSingle();

  if (existingReport) {
    return { ok: false, message: "You've already reported this review." };
  }

  // Insert report into the existing reports table
  const { error } = await supabase.from("reports").insert({
    reporter_id: profile.id,
    entity_type: "review",
    entity_id: input.reviewId,
    reason: input.reason,
    description: input.description.trim(),
    status: "open",
  });

  if (error) {
    return { ok: false, message: "We couldn't submit your report." };
  }

  // Audit
  const admin = createAdminClient();
  if (admin) {
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "review_reported",
      target_type: "review",
      target_id: input.reviewId,
      metadata: { reason: input.reason },
    });
  }

  return { ok: true };
}
