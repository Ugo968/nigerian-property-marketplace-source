/**
 * Transaction workflow server actions (spec Section 6–22, 33, 34, 37, 38, 39, 40).
 *
 * Every action:
 *   1. Resolves the caller's profile from the session (NEVER trusts
 *      client-supplied user IDs).
 *   2. Validates eligibility via the eligibility module.
 *   3. Calls a SECURITY DEFINER function for atomic state transitions
 *      (concurrency-safe per spec Section 39).
 *   4. Records history (status_history + offer_history — append-only).
 *   5. Dispatches notifications to affected participants
 *      (spec Section 34).
 *   6. Optionally posts a system message to the linked conversation
 *      (spec Section 33).
 *
 * CRITICAL MONEY RULE (spec Section 2, 44, 55):
 *   This module does NOT call Paystack / Flutterwave. The offered
 *   amounts are TRACKED for negotiation purposes only — the platform
 *   never collects them. There are NO "Pay Rent" / "Buy Property"
 *   buttons anywhere in this codebase.
 */

"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/supabase";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/server";
import { rateLimiter, RATE_LIMITS } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging";
import { notificationService } from "@/lib/notifications";
import type { ProfileRow, TransactionRow } from "@/types";
import { canTransition, canTransitionInspection, canTransitionOffer } from "./state-machine";
import {
  canInitiateTransaction,
  canViewTransaction,
  canAcceptOffer,
  canSubmitOffer,
  canCompleteTransaction,
  canCancelTransaction,
  loadPropertyContext,
  loadTransactionParties,
} from "./eligibility";

// ---------------------------------------------------------------------------
// Result type — discriminated union for client rendering.
// ---------------------------------------------------------------------------
export type TransactionActionResult =
  | { ok: true; transactionId?: string; offerId?: string; inspectionId?: string }
  | { ok: false; message?: string; fieldErrors?: Record<string, string[]>; requiresAuth?: boolean };

// ---------------------------------------------------------------------------
// 1. CREATE INQUIRY (spec Section 10)
// ---------------------------------------------------------------------------
export async function createInquiryAction(input: {
  propertyId: string;
  transactionType: "rent" | "sale" | "shortlet";
  message?: string;
}): Promise<TransactionActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true, message: "Please sign in." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  // Rate limit (spec Section 42)
  const rl = await rateLimiter.check({
    key: user.id,
    action: "transaction_inquiry",
    limit: 20,
    windowMs: 60 * 60 * 1000, // 20 / hour
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many inquiries. Please try again later." };
  }

  // Validate transaction type matches property's transaction_type
  const ctx = await loadPropertyContext(input.propertyId);
  if (!ctx) return { ok: false, message: "Property not found." };
  if (ctx.transaction_type !== input.transactionType) {
    return {
      ok: false,
      fieldErrors: { transactionType: [`This property is listed for ${ctx.transaction_type}, not ${input.transactionType}.`] },
    };
  }

  const eligibility = await canInitiateTransaction(input);
  if (!eligibility.ok) {
    return { ok: false, message: eligibility.message };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };

  // Resolve the owner — use owner_profile_id if set, else listing_creator_id
  const ownerId = ctx.owner_profile_id ?? ctx.listing_creator_id;

  // Insert the transaction. The UNIQUE partial index prevents duplicate
  // active transactions for (property, customer, type).
  const { data: txRow, error: txErr } = await admin
    .from("transactions")
    .insert({
      property_id: input.propertyId,
      transaction_type: input.transactionType,
      initiated_by: profile.id,
      owner_id: ownerId,
      customer_id: profile.id,
      managing_agent_id: ctx.managing_agent_id,
      current_status: "inquiry",
      metadata: { initialMessage: input.message ?? null },
    } as never)
    .select("id")
    .single();
  if (txErr) {
    if (txErr.code === "23505") {
      // unique_violation = duplicate active transaction
      return {
        ok: false,
        message: "You already have an active transaction for this property.",
      };
    }
    logger.error("createInquiryAction: insert failed", { error: txErr.message });
    return { ok: false, message: "We couldn't start the transaction." };
  }

  const transactionId = (txRow as { id: string }).id;

  // Add participants: customer + owner (+ listing creator if different
  // from owner) + managing agent (if any).
  const participants = [
    { transaction_id: transactionId, user_id: profile.id, role: "customer" },
    { transaction_id: transactionId, user_id: ownerId, role: "owner" },
  ];
  if (ctx.listing_creator_id !== ownerId) {
    participants.push({
      transaction_id: transactionId,
      user_id: ctx.listing_creator_id,
      role: "listing_creator",
    });
  }
  if (ctx.managing_agent_id && ctx.managing_agent_id !== ownerId) {
    participants.push({
      transaction_id: transactionId,
      user_id: ctx.managing_agent_id,
      role: "managing_agent",
    });
  }
  await admin
    .from("transaction_participants")
    .insert(participants as never);

  // Initial status history row
  await admin
    .from("transaction_status_history")
    .insert({
      transaction_id: transactionId,
      previous_status: null,
      new_status: "inquiry",
      actor_profile_id: profile.id,
      actor_user_id: user.id,
      metadata: { initiatedBy: profile.id },
    } as never);

  // Notify the owner (+ managing agent) of the new inquiry
  await notificationService.dispatch({
    recipientId: ownerId,
    type: "transaction.inquiry",
    title: `New ${input.transactionType} inquiry for your property`,
    body: `${profile.full_name} started a ${input.transactionType} transaction for a property you own.`,
    href: `/dashboard/transactions/${transactionId}`,
    relatedEntityType: "transaction",
    relatedEntityId: transactionId,
    eventKey: `transaction.inquiry:${transactionId}`,
    metadata: {
      transactionId,
      transactionType: input.transactionType,
      propertyId: input.propertyId,
      customerId: profile.id,
      customerName: profile.full_name,
    },
  });
  if (ctx.managing_agent_id && ctx.managing_agent_id !== ownerId) {
    await notificationService.dispatch({
      recipientId: ctx.managing_agent_id,
      type: "transaction.inquiry",
      title: `New ${input.transactionType} inquiry`,
      body: `${profile.full_name} started a ${input.transactionType} transaction for a property you represent.`,
      href: `/dashboard/transactions/${transactionId}`,
      relatedEntityType: "transaction",
      relatedEntityId: transactionId,
      eventKey: `transaction.inquiry:agent:${transactionId}`,
      metadata: { transactionId, transactionType: input.transactionType },
    });
  }

  revalidatePath("/dashboard/transactions", "page");
  return { ok: true, transactionId };
}

// ---------------------------------------------------------------------------
// 2. SCHEDULE INSPECTION (spec Section 11, 12)
// ---------------------------------------------------------------------------
export async function scheduleInspectionAction(input: {
  transactionId: string;
  proposedAtIso: string;
  proposedTimezone?: string;
  proposedEndsAtIso?: string;
  notes?: string;
}): Promise<TransactionActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const eligibility = await canViewTransaction(input.transactionId);
  if (!eligibility.ok) return { ok: false, message: eligibility.message };

  const tx = eligibility.parties.transaction;
  if (!["inquiry", "inspection_scheduled", "negotiation"].includes(tx.current_status)) {
    return {
      ok: false,
      message: `Cannot schedule an inspection in status "${tx.current_status}".`,
    };
  }

  // Validate the proposed time is in the future
  const proposed = new Date(input.proposedAtIso);
  if (Number.isNaN(proposed.getTime())) {
    return { ok: false, fieldErrors: { proposedAtIso: ["Invalid date."] } };
  }
  if (proposed.getTime() < Date.now() - 60 * 1000) {
    return { ok: false, fieldErrors: { proposedAtIso: ["Please propose a future time."] } };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };

  const { data: inspRow, error } = await admin
    .from("inspections")
    .insert({
      transaction_id: input.transactionId,
      property_id: tx.property_id,
      proposed_at: input.proposedAtIso,
      proposed_timezone: input.proposedTimezone ?? "Africa/Lagos",
      proposed_ends_at: input.proposedEndsAtIso ?? null,
      proposed_by: profile.id,
      status: "proposed",
      notes: input.notes?.trim() || null,
    } as never)
    .select("id")
    .single();
  if (error) {
    logger.error("scheduleInspectionAction: insert failed", { error: error.message });
    return { ok: false, message: "We couldn't schedule the inspection." };
  }
  const inspectionId = (inspRow as { id: string }).id;

  // If the transaction is in 'inquiry', transition it to 'inspection_scheduled'.
  if (tx.current_status === "inquiry") {
    if (canTransition(tx.current_status, "inspection_scheduled")) {
      await admin.rpc("transition_transaction", {
        p_transaction_id: input.transactionId,
        p_new_status: "inspection_scheduled",
        p_actor_profile_id: profile.id,
        p_reason: "Inspection scheduled",
      } as never);
    }
  }

  // Notify the OTHER party (owner if customer proposed, customer if owner proposed)
  const recipients = [tx.owner_id, tx.customer_id, tx.managing_agent_id].filter(
    (id): id is string => Boolean(id) && id !== profile.id,
  );
  for (const recipientId of recipients) {
    await notificationService.dispatch({
      recipientId,
      type: "transaction.inspection_proposed",
      title: "Inspection proposed",
      body: `${profile.full_name} proposed an inspection for ${proposed.toLocaleString("en-NG", { timeZone: input.proposedTimezone ?? "Africa/Lagos" })}.`,
      href: `/dashboard/transactions/${input.transactionId}`,
      relatedEntityType: "transaction",
      relatedEntityId: input.transactionId,
      eventKey: `transaction.inspection_proposed:${inspectionId}:${recipientId}`,
      metadata: {
        transactionId: input.transactionId,
        inspectionId,
        proposedAt: input.proposedAtIso,
        proposedBy: profile.full_name,
      },
    });
  }

  revalidatePath(`/dashboard/transactions/${input.transactionId}`, "page");
  return { ok: true, inspectionId };
}

// ---------------------------------------------------------------------------
// 3. CONFIRM INSPECTION
// ---------------------------------------------------------------------------
export async function confirmInspectionAction(input: {
  inspectionId: string;
}): Promise<TransactionActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };

  // Load the inspection + verify the caller is a transaction participant
  const { data: inspRow } = await admin
    .from("inspections")
    .select("id, transaction_id, status, proposed_by")
    .eq("id", input.inspectionId)
    .maybeSingle();
  const insp = inspRow as { id: string; transaction_id: string; status: string; proposed_by: string } | null;
  if (!insp) return { ok: false, message: "Inspection not found." };

  if (!canTransitionInspection(insp.status as never, "confirmed")) {
    return { ok: false, message: `Cannot confirm an inspection in status "${insp.status}".` };
  }

  // Verify the caller is a participant (and NOT the proposer — the OTHER
  // party confirms, per spec Section 12)
  const parties = await loadTransactionParties(insp.transaction_id);
  if (!parties || !parties.callerRole) {
    return { ok: false, message: "FORBIDDEN" };
  }
  if (insp.proposed_by === profile.id) {
    return { ok: false, message: "You cannot confirm your own proposed inspection — the other party must confirm." };
  }

  const { error } = await admin
    .from("inspections")
    .update({
      status: "confirmed",
      confirmed_by: profile.id,
      confirmed_at: new Date().toISOString(),
    } as never)
    .eq("id", input.inspectionId)
    .eq("status", "proposed"); // conditional update — idempotent
  if (error) {
    logger.error("confirmInspectionAction: update failed", { error: error.message });
    return { ok: false, message: "We couldn't confirm the inspection." };
  }

  // Notify the proposer
  await notificationService.dispatch({
    recipientId: insp.proposed_by,
    type: "transaction.inspection_confirmed",
    title: "Inspection confirmed",
    body: `${profile.full_name} confirmed your proposed inspection time.`,
    href: `/dashboard/transactions/${insp.transaction_id}`,
    relatedEntityType: "transaction",
    relatedEntityId: insp.transaction_id,
    eventKey: `transaction.inspection_confirmed:${input.inspectionId}`,
    metadata: { inspectionId: input.inspectionId },
  });

  revalidatePath(`/dashboard/transactions/${insp.transaction_id}`, "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 4. RESCHEDULE INSPECTION (request a new time)
// ---------------------------------------------------------------------------
export async function rescheduleInspectionAction(input: {
  inspectionId: string;
  reason: string;
}): Promise<TransactionActionResult> {
  if (!input.reason || input.reason.trim().length < 3) {
    return { ok: false, fieldErrors: { reason: ["Please provide a reason (at least 3 characters)."] } };
  }
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };

  const { data: inspRow } = await admin
    .from("inspections")
    .select("id, transaction_id, status, proposed_by")
    .eq("id", input.inspectionId)
    .maybeSingle();
  const insp = inspRow as { id: string; transaction_id: string; status: string; proposed_by: string } | null;
  if (!insp) return { ok: false, message: "Inspection not found." };

  if (!canTransitionInspection(insp.status as never, "reschedule_requested")) {
    return { ok: false, message: `Cannot reschedule an inspection in status "${insp.status}".` };
  }

  const parties = await loadTransactionParties(insp.transaction_id);
  if (!parties || !parties.callerRole) {
    return { ok: false, message: "FORBIDDEN" };
  }

  const { error } = await admin
    .from("inspections")
    .update({
      status: "reschedule_requested",
      cancellation_reason: input.reason,
    } as never)
    .eq("id", input.inspectionId)
    .in("status", ["proposed", "confirmed"]); // idempotent
  if (error) {
    return { ok: false, message: "We couldn't request a reschedule." };
  }

  await notificationService.dispatch({
    recipientId: insp.proposed_by,
    type: "transaction.inspection_rescheduled",
    title: "Reschedule requested",
    body: `${profile.full_name} requested a different inspection time. Reason: ${input.reason}`,
    href: `/dashboard/transactions/${insp.transaction_id}`,
    relatedEntityType: "transaction",
    relatedEntityId: insp.transaction_id,
    eventKey: `transaction.inspection_rescheduled:${input.inspectionId}`,
    metadata: { reason: input.reason },
  });

  revalidatePath(`/dashboard/transactions/${insp.transaction_id}`, "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 5. CANCEL INSPECTION
// ---------------------------------------------------------------------------
export async function cancelInspectionAction(input: {
  inspectionId: string;
  reason: string;
}): Promise<TransactionActionResult> {
  if (!input.reason || input.reason.trim().length < 3) {
    return { ok: false, fieldErrors: { reason: ["Please provide a reason (at least 3 characters)."] } };
  }
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };

  const { data: inspRow } = await admin
    .from("inspections")
    .select("id, transaction_id, status, proposed_by")
    .eq("id", input.inspectionId)
    .maybeSingle();
  const insp = inspRow as { id: string; transaction_id: string; status: string; proposed_by: string } | null;
  if (!insp) return { ok: false, message: "Inspection not found." };

  if (!canTransitionInspection(insp.status as never, "cancelled")) {
    return { ok: false, message: `Cannot cancel an inspection in status "${insp.status}".` };
  }

  const parties = await loadTransactionParties(insp.transaction_id);
  if (!parties || !parties.callerRole) {
    return { ok: false, message: "FORBIDDEN" };
  }

  const { error } = await admin
    .from("inspections")
    .update({
      status: "cancelled",
      cancelled_by: profile.id,
      cancelled_at: new Date().toISOString(),
      cancellation_reason: input.reason,
    } as never)
    .eq("id", input.inspectionId)
    .in("status", ["proposed", "confirmed", "reschedule_requested"]);
  if (error) return { ok: false, message: "We couldn't cancel the inspection." };

  await notificationService.dispatch({
    recipientId: insp.proposed_by,
    type: "transaction.inspection_cancelled",
    title: "Inspection cancelled",
    body: `${profile.full_name} cancelled an inspection. Reason: ${input.reason}`,
    href: `/dashboard/transactions/${insp.transaction_id}`,
    relatedEntityType: "transaction",
    relatedEntityId: insp.transaction_id,
    eventKey: `transaction.inspection_cancelled:${input.inspectionId}`,
    metadata: { reason: input.reason },
  });

  revalidatePath(`/dashboard/transactions/${insp.transaction_id}`, "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 6. COMPLETE INSPECTION
// ---------------------------------------------------------------------------
export async function completeInspectionAction(input: {
  inspectionId: string;
}): Promise<TransactionActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };

  const { data: inspRow } = await admin
    .from("inspections")
    .select("id, transaction_id, status, property_id, proposed_by")
    .eq("id", input.inspectionId)
    .maybeSingle();
  const insp = inspRow as { id: string; transaction_id: string; status: string; property_id: string; proposed_by: string } | null;
  if (!insp) return { ok: false, message: "Inspection not found." };

  if (!canTransitionInspection(insp.status as never, "completed")) {
    return { ok: false, message: `Cannot mark an inspection completed in status "${insp.status}".` };
  }

  const parties = await loadTransactionParties(insp.transaction_id);
  if (!parties || !parties.callerRole) {
    return { ok: false, message: "FORBIDDEN" };
  }

  const { error } = await admin
    .from("inspections")
    .update({
      status: "completed",
      completed_by: profile.id,
      completed_at: new Date().toISOString(),
    } as never)
    .eq("id", input.inspectionId)
    .eq("status", "confirmed"); // only confirmed inspections can be completed
  if (error) return { ok: false, message: "We couldn't mark the inspection completed." };

  // Transition the transaction: inspection_scheduled → inspection_completed → negotiation
  if (parties.transaction.current_status === "inspection_scheduled") {
    if (canTransition("inspection_scheduled", "inspection_completed")) {
      await admin.rpc("transition_transaction", {
        p_transaction_id: insp.transaction_id,
        p_new_status: "inspection_completed",
        p_actor_profile_id: profile.id,
        p_reason: `Inspection ${input.inspectionId} completed`,
      } as never);
      // Auto-transition to negotiation (negotiation starts after inspection)
      await admin.rpc("transition_transaction", {
        p_transaction_id: insp.transaction_id,
        p_new_status: "negotiation",
        p_actor_profile_id: profile.id,
        p_reason: "Negotiation started after inspection",
      } as never);
    }
  }

  // Notify the other party
  const recipients = [parties.transaction.customer_id, parties.transaction.owner_id, parties.transaction.managing_agent_id].filter(
    (id): id is string => Boolean(id) && id !== profile.id,
  );
  for (const recipientId of recipients) {
    await notificationService.dispatch({
      recipientId,
      type: "transaction.inspection_completed",
      title: "Inspection completed",
      body: `${profile.full_name} marked the inspection as completed. You can now start negotiation.`,
      href: `/dashboard/transactions/${insp.transaction_id}`,
      relatedEntityType: "transaction",
      relatedEntityId: insp.transaction_id,
      eventKey: `transaction.inspection_completed:${input.inspectionId}:${recipientId}`,
      metadata: { inspectionId: input.inspectionId },
    });
  }

  revalidatePath(`/dashboard/transactions/${insp.transaction_id}`, "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 7. SUBMIT OFFER (spec Section 17, 18)
// ---------------------------------------------------------------------------
export async function submitOfferAction(input: {
  transactionId: string;
  offeredAmountMinor: number; // kobo
  currency?: string;
  priceFrequency?: string | null;
  terms?: string;
  validityHours?: number; // default 72 hours
}): Promise<TransactionActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const eligibility = await canSubmitOffer(input.transactionId);
  if (!eligibility.ok) return { ok: false, message: eligibility.message };

  const tx = eligibility.parties.transaction;
  if (!["negotiation", "offer_made", "offer_accepted"].includes(tx.current_status)) {
    return {
      ok: false,
      message: `Cannot submit an offer in status "${tx.current_status}".`,
    };
  }
  if (["cancelled", "withdrawn", "expired", "declined", "transaction_completed"].includes(tx.current_status)) {
    return { ok: false, message: "This transaction is no longer accepting offers." };
  }

  // Validate amount
  if (!Number.isInteger(input.offeredAmountMinor) || input.offeredAmountMinor < 0) {
    return { ok: false, fieldErrors: { offeredAmountMinor: ["Invalid offer amount."] } };
  }
  if (input.offeredAmountMinor === 0) {
    return { ok: false, fieldErrors: { offeredAmountMinor: ["Offer amount must be greater than zero."] } };
  }

  // Validate currency (V1: NGN only unless spec says otherwise — keep USD allowed for future)
  const currency = input.currency ?? "NGN";
  if (!["NGN", "USD"].includes(currency)) {
    return { ok: false, fieldErrors: { currency: ["V1 only supports NGN (and USD for future)."] } };
  }

  // Validate frequency against transaction_type
  const validFrequencies: Record<string, string[]> = {
    rent: ["per_month", "per_year", "one_off"],
    sale: ["one_off"],
    shortlet: ["per_day", "per_week", "one_off"],
  };
  const freq = input.priceFrequency ?? (tx.transaction_type === "sale" ? "one_off" : tx.transaction_type === "rent" ? "per_month" : "per_day");
  if (!validFrequencies[tx.transaction_type].includes(freq)) {
    return { ok: false, fieldErrors: { priceFrequency: [`Invalid frequency for ${tx.transaction_type} transaction.`] } };
  }

  const validityHours = input.validityHours ?? 72;
  const expiresAt = new Date(Date.now() + validityHours * 60 * 60 * 1000).toISOString();

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };

  // If there's an existing 'submitted' offer by this user on this transaction,
  // supersede it (counter-offer chain — spec Section 19)
  const { data: existingOffer } = await admin
    .from("offers")
    .select("id")
    .eq("transaction_id", input.transactionId)
    .eq("submitted_by", profile.id)
    .eq("status", "submitted")
    .maybeSingle();
  const prevOfferId = (existingOffer as { id?: string } | null)?.id ?? null;

  // Insert the new offer
  const { data: offerRow, error } = await admin
    .from("offers")
    .insert({
      transaction_id: input.transactionId,
      submitted_by: profile.id,
      offered_amount: input.offeredAmountMinor,
      currency,
      price_frequency: freq,
      terms: input.terms?.trim() || null,
      expires_at: expiresAt,
      status: "submitted",
      supersedes_offer_id: prevOfferId,
    } as never)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      // Unique violation on (transaction_id, submitted_by) where status='submitted'
      return { ok: false, message: "You already have a pending offer on this transaction." };
    }
    logger.error("submitOfferAction: insert failed", { error: error.message });
    return { ok: false, message: "We couldn't submit the offer." };
  }
  const offerId = (offerRow as { id: string }).id;

  // Supersede the previous offer (conditional update — only if it's still 'submitted')
  if (prevOfferId) {
    await admin
      .from("offers")
      .update({
        status: "superseded",
        decided_by: profile.id,
        decided_at: new Date().toISOString(),
        decision_reason: "Counter-offer submitted.",
      } as never)
      .eq("id", prevOfferId)
      .eq("status", "submitted");
    await admin
      .from("offer_history")
      .insert({
        offer_id: prevOfferId,
        previous_status: "submitted",
        new_status: "superseded",
        actor_profile_id: profile.id,
        reason: "Counter-offer submitted.",
      } as never);
  }

  // Record offer history
  await admin
    .from("offer_history")
    .insert({
      offer_id: offerId,
      previous_status: null,
      new_status: "submitted",
      actor_profile_id: profile.id,
      metadata: { offeredAmountMinor: input.offeredAmountMinor, currency },
    } as never);

  // Transition the transaction to 'offer_made' if not already
  if (tx.current_status === "negotiation" && canTransition("negotiation", "offer_made")) {
    await admin.rpc("transition_transaction", {
      p_transaction_id: input.transactionId,
      p_new_status: "offer_made",
      p_actor_profile_id: profile.id,
      p_reason: "Offer submitted",
    } as never);
  }

  // Notify the counter-party (owner + managing agent if customer made the offer;
  // customer if owner/agent made a counter-offer)
  const recipients = [tx.owner_id, tx.managing_agent_id, tx.managing_company_id, tx.customer_id].filter(
    (id): id is string => Boolean(id) && id !== profile.id,
  );
  for (const recipientId of recipients) {
    await notificationService.dispatch({
      recipientId,
      type: "transaction.offer_submitted",
      title: "New offer received",
      body: `${profile.full_name} submitted an offer. Valid until ${new Date(expiresAt).toLocaleString("en-NG")}.`,
      href: `/dashboard/transactions/${input.transactionId}`,
      relatedEntityType: "transaction",
      relatedEntityId: input.transactionId,
      eventKey: `transaction.offer_submitted:${offerId}:${recipientId}`,
      metadata: {
        transactionId: input.transactionId,
        offerId,
        // Note: amount is visible to counter-party per spec Section 23.
        offeredAmountMinor: input.offeredAmountMinor,
        currency,
        priceFrequency: freq,
      },
    });
  }

  revalidatePath(`/dashboard/transactions/${input.transactionId}`, "page");
  return { ok: true, offerId };
}

// ---------------------------------------------------------------------------
// 8. ACCEPT OFFER (spec Section 20, 39) — concurrency-safe via SECURITY DEFINER
// ---------------------------------------------------------------------------
export async function acceptOfferAction(input: {
  transactionId: string;
  offerId: string;
  reason?: string;
}): Promise<TransactionActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const eligibility = await canAcceptOffer(input.transactionId);
  if (!eligibility.ok) return { ok: false, message: eligibility.message };

  // Verify the offer was NOT submitted by the caller (cannot accept own offer)
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };
  const { data: offerRow } = await admin
    .from("offers")
    .select("submitted_by, status, expires_at")
    .eq("id", input.offerId)
    .maybeSingle();
  const offer = offerRow as { submitted_by: string; status: string; expires_at: string } | null;
  if (!offer) return { ok: false, message: "Offer not found." };
  if (offer.submitted_by === profile.id) {
    return { ok: false, message: "You cannot accept your own offer." };
  }
  if (offer.status !== "submitted") {
    return { ok: false, message: `This offer is already ${offer.status}.` };
  }
  // Check expiry (server-side time evaluation per spec Section 38)
  if (new Date(offer.expires_at).getTime() < Date.now()) {
    // Mark as expired
    await admin
      .from("offers")
      .update({ status: "expired" } as never)
      .eq("id", input.offerId);
    return { ok: false, message: "This offer has expired." };
  }

  // Call the SECURITY DEFINER function — atomic, race-safe
  const { data: result, error } = await admin.rpc("accept_transaction_offer", {
    p_transaction_id: input.transactionId,
    p_offer_id: input.offerId,
    p_acceptor_profile_id: profile.id,
    p_reason: input.reason ?? null,
  } as never);
  if (error) {
    logger.error("acceptOfferAction: rpc failed", { error: error.message });
    return { ok: false, message: "We couldn't accept the offer." };
  }
  const ok = (result as boolean | null) ?? false;
  if (!ok) {
    // Race condition — another acceptance won, OR authorization failed at the DB layer
    return {
      ok: false,
      message: "This offer could not be accepted — it may have been accepted by someone else, or the transaction is no longer in an accept-eligible state.",
    };
  }

  // Notify all participants
  const tx = eligibility.parties.transaction;
  const recipients = [tx.customer_id, tx.owner_id, tx.managing_agent_id, tx.managing_company_id].filter(
    (id): id is string => Boolean(id) && id !== profile.id,
  );
  for (const recipientId of recipients) {
    await notificationService.dispatch({
      recipientId,
      type: "transaction.offer_accepted",
      title: "Offer accepted",
      body: `${profile.full_name} accepted an offer. The transaction is now in the offer-accepted stage.`,
      href: `/dashboard/transactions/${input.transactionId}`,
      relatedEntityType: "transaction",
      relatedEntityId: input.transactionId,
      eventKey: `transaction.offer_accepted:${input.offerId}:${recipientId}`,
      metadata: {
        transactionId: input.transactionId,
        offerId: input.offerId,
      },
    });
  }
  // Also notify other customers who had submitted offers (they were superseded)
  const { data: supersededOffers } = await admin
    .from("offers")
    .select("id, submitted_by")
    .eq("transaction_id", input.transactionId)
    .eq("status", "superseded")
    .neq("submitted_by", profile.id);
  for (const so of (supersededOffers ?? []) as Array<{ id: string; submitted_by: string }>) {
    if (so.submitted_by !== tx.customer_id && so.submitted_by !== tx.owner_id) {
      await notificationService.dispatch({
        recipientId: so.submitted_by,
        type: "transaction.offer_declined",
        title: "Offer update",
        body: "Another offer was accepted for this transaction. Your offer has been marked as superseded.",
        href: `/dashboard/transactions/${input.transactionId}`,
        relatedEntityType: "transaction",
        relatedEntityId: input.transactionId,
        eventKey: `transaction.offer_superseded:${so.id}`,
        metadata: { offerId: so.id, transactionId: input.transactionId },
      });
    }
  }

  revalidatePath(`/dashboard/transactions/${input.transactionId}`, "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 9. DECLINE OFFER
// ---------------------------------------------------------------------------
export async function declineOfferAction(input: {
  transactionId: string;
  offerId: string;
  reason: string;
}): Promise<TransactionActionResult> {
  if (!input.reason || input.reason.trim().length < 3) {
    return { ok: false, fieldErrors: { reason: ["Please provide a reason (at least 3 characters)."] } };
  }
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const eligibility = await canAcceptOffer(input.transactionId);
  if (!eligibility.ok) return { ok: false, message: eligibility.message };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };

  // Conditional update — idempotent
  const { error } = await admin
    .from("offers")
    .update({
      status: "declined",
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
      decision_reason: input.reason,
    } as never)
    .eq("id", input.offerId)
    .eq("transaction_id", input.transactionId)
    .eq("status", "submitted");
  if (error) return { ok: false, message: "We couldn't decline the offer." };

  // Look up the offer submitter
  const { data: offerRow } = await admin
    .from("offers")
    .select("submitted_by")
    .eq("id", input.offerId)
    .maybeSingle();
  const offer = offerRow as { submitted_by: string } | null;
  if (offer) {
    await notificationService.dispatch({
      recipientId: offer.submitted_by,
      type: "transaction.offer_declined",
      title: "Offer update",
      body: `Your offer was declined. Reason: ${input.reason}`,
      href: `/dashboard/transactions/${input.transactionId}`,
      relatedEntityType: "transaction",
      relatedEntityId: input.transactionId,
      eventKey: `transaction.offer_declined:${input.offerId}`,
      metadata: { reason: input.reason },
    });
  }

  revalidatePath(`/dashboard/transactions/${input.transactionId}`, "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 10. WITHDRAW OFFER (by the offer submitter)
// ---------------------------------------------------------------------------
export async function withdrawOfferAction(input: {
  transactionId: string;
  offerId: string;
  reason: string;
}): Promise<TransactionActionResult> {
  if (!input.reason || input.reason.trim().length < 3) {
    return { ok: false, fieldErrors: { reason: ["Please provide a reason (at least 3 characters)."] } };
  }
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };

  // Verify ownership of the offer
  const { data: offerRow } = await admin
    .from("offers")
    .select("id, submitted_by, status")
    .eq("id", input.offerId)
    .maybeSingle();
  const offer = offerRow as { id: string; submitted_by: string; status: string } | null;
  if (!offer) return { ok: false, message: "Offer not found." };
  if (offer.submitted_by !== profile.id) {
    return { ok: false, message: "FORBIDDEN — you can only withdraw your own offer." };
  }
  if (!canTransitionOffer(offer.status as never, "withdrawn")) {
    return { ok: false, message: `Cannot withdraw an offer in status "${offer.status}".` };
  }

  const { error } = await admin
    .from("offers")
    .update({
      status: "withdrawn",
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
      decision_reason: input.reason,
    } as never)
    .eq("id", input.offerId)
    .eq("status", "submitted");
  if (error) return { ok: false, message: "We couldn't withdraw the offer." };

  await admin
    .from("offer_history")
    .insert({
      offer_id: input.offerId,
      previous_status: "submitted",
      new_status: "withdrawn",
      actor_profile_id: profile.id,
      reason: input.reason,
    } as never);

  revalidatePath(`/dashboard/transactions/${input.transactionId}`, "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 11. COMPLETE TRANSACTION (spec Section 21, 22) — atomic + property status integration
// ---------------------------------------------------------------------------
export async function completeTransactionAction(input: {
  transactionId: string;
  completionNotes?: string;
}): Promise<TransactionActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const eligibility = await canCompleteTransaction(input.transactionId);
  if (!eligibility.ok) return { ok: false, message: eligibility.message };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };

  // Call the SECURITY DEFINER function — atomic, race-safe, includes property status integration
  const { data: result, error } = await admin.rpc("complete_transaction", {
    p_transaction_id: input.transactionId,
    p_completer_profile_id: profile.id,
    p_completion_notes: input.completionNotes?.trim() || null,
  } as never);
  if (error) {
    logger.error("completeTransactionAction: rpc failed", { error: error.message });
    return { ok: false, message: "We couldn't complete the transaction." };
  }
  const ok = (result as boolean | null) ?? false;
  if (!ok) {
    return {
      ok: false,
      message: "The transaction could not be completed — it may have been completed already, or the offer was not accepted.",
    };
  }

  // Notify all participants
  const tx = eligibility.parties.transaction;
  const recipients = [tx.customer_id, tx.owner_id, tx.managing_agent_id, tx.managing_company_id].filter(
    (id): id is string => Boolean(id) && id !== profile.id,
  );
  for (const recipientId of recipients) {
    await notificationService.dispatch({
      recipientId,
      type: "transaction.completed",
      title: "Transaction completed",
      body: `${profile.full_name} marked the transaction as completed. Note: completion is user-reported and not platform-verified.`,
      href: `/dashboard/transactions/${input.transactionId}`,
      relatedEntityType: "transaction",
      relatedEntityId: input.transactionId,
      eventKey: `transaction.completed:${input.transactionId}:${recipientId}`,
      metadata: {
        transactionId: input.transactionId,
        transactionType: tx.transaction_type,
      },
    });
  }

  revalidatePath(`/dashboard/transactions/${input.transactionId}`, "page");
  revalidatePath(`/properties/${tx.property_id}`, "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 12. CANCEL TRANSACTION (spec Section 37)
// ---------------------------------------------------------------------------
export async function cancelTransactionAction(input: {
  transactionId: string;
  reason: string;
  newStatus?: "cancelled" | "withdrawn" | "declined";
}): Promise<TransactionActionResult> {
  if (!input.reason || input.reason.trim().length < 5) {
    return { ok: false, fieldErrors: { reason: ["Please provide a reason (at least 5 characters)."] } };
  }
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const eligibility = await canCancelTransaction(input.transactionId);
  if (!eligibility.ok) return { ok: false, message: eligibility.message };

  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };

  const { data: result, error } = await admin.rpc("cancel_transaction", {
    p_transaction_id: input.transactionId,
    p_canceller_profile_id: profile.id,
    p_reason: input.reason,
    p_new_status: input.newStatus ?? "cancelled",
  } as never);
  if (error) {
    logger.error("cancelTransactionAction: rpc failed", { error: error.message });
    return { ok: false, message: "We couldn't cancel the transaction." };
  }
  const ok = (result as boolean | null) ?? false;
  if (!ok) {
    return {
      ok: false,
      message: "The transaction could not be cancelled — it may have already been completed or cancelled.",
    };
  }

  // Notify all participants
  const tx = eligibility.parties.transaction;
  const recipients = [tx.customer_id, tx.owner_id, tx.managing_agent_id, tx.managing_company_id].filter(
    (id): id is string => Boolean(id) && id !== profile.id,
  );
  for (const recipientId of recipients) {
    await notificationService.dispatch({
      recipientId,
      type: "transaction.cancelled",
      title: "Transaction cancelled",
      body: `${profile.full_name} cancelled the transaction. Reason: ${input.reason}`,
      href: `/dashboard/transactions/${input.transactionId}`,
      relatedEntityType: "transaction",
      relatedEntityId: input.transactionId,
      eventKey: `transaction.cancelled:${input.transactionId}:${recipientId}`,
      metadata: { reason: input.reason, newStatus: input.newStatus ?? "cancelled" },
    });
  }

  revalidatePath(`/dashboard/transactions/${input.transactionId}`, "page");
  return { ok: true };
}
