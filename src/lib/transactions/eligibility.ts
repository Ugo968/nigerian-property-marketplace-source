/**
 * Transaction eligibility + authorization (spec Section 4, 24, 25, 26, 27, 28, 29).
 *
 * Resolves WHO can:
 *   - initiate a transaction for a property
 *   - act on a transaction (transition status, schedule inspections,
 *     submit offers, accept offers, complete)
 *
 * All checks are server-side. The client NEVER supplies:
 *   - user IDs (resolved from session)
 *   - transaction status (resolved from DB)
 *   - owner ID (resolved from property + representation relationships)
 *
 * CRITICAL MONEY RULE: this module is about workflow authorization
 * ONLY. It never authorizes payment collection. V1 has no escrow /
 * rent collection / purchase-money handling (spec Section 2, 44, 55).
 */

import { createServerClient, createAdminClient } from "@/lib/db/supabase";
import { getCurrentProfile } from "@/lib/auth/server";
import { logger } from "@/lib/logging";
import type { ProfileRow, TransactionRow } from "@/types";

// ---------------------------------------------------------------------------
// Property context — the relationships that determine who can act.
// ---------------------------------------------------------------------------

export interface PropertyContext {
  id: string;
  owner_profile_id: string | null;
  listing_creator_id: string;
  managing_agent_id: string | null;
  // The property's current status (must be available / under_offer /
  // application_pending to start a transaction).
  status: string;
  deleted_at: string | null;
  published_at: string | null;
  transaction_type: string;
}

export async function loadPropertyContext(
  propertyId: string,
): Promise<PropertyContext | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("properties")
    .select("id, owner_profile_id, listing_creator_id, managing_agent_id, status, deleted_at, published_at, transaction_type")
    .eq("id", propertyId)
    .maybeSingle();
  if (!data) return null;
  const p = data as PropertyContext;
  if (p.deleted_at) return null;
  return p;
}

// ---------------------------------------------------------------------------
// Participant resolution — who is on this transaction.
// ---------------------------------------------------------------------------

export interface TransactionParties {
  transaction: TransactionRow;
  /** The caller's role in this transaction (null if not a participant). */
  callerRole: "customer" | "owner" | "managing_agent" | "managing_company" | "listing_creator" | null;
  /** True if the caller is the customer (prospective buyer/renter). */
  isCustomer: boolean;
  /** True if the caller is the property owner. */
  isOwner: boolean;
  /** True if the caller is the managing agent. */
  isManagingAgent: boolean;
}

export async function loadTransactionParties(
  transactionId: string,
): Promise<TransactionParties | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const admin = createAdminClient();
  if (!admin) return null;

  const { data: txRow } = await admin
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .maybeSingle();
  if (!txRow) return null;
  const transaction = txRow as TransactionRow;

  let callerRole: TransactionParties["callerRole"] = null;
  if (transaction.customer_id === profile.id) callerRole = "customer";
  else if (transaction.owner_id === profile.id) callerRole = "owner";
  else if (transaction.managing_agent_id === profile.id) callerRole = "managing_agent";
  else if (transaction.managing_company_id === profile.id) callerRole = "managing_company";
  else if (transaction.initiated_by === profile.id) callerRole = "listing_creator";

  // If still null, check the participants table (e.g. an extra agent
  // assistant added to the transaction).
  if (!callerRole) {
    const { data: participantRow } = await admin
      .from("transaction_participants")
      .select("role")
      .eq("transaction_id", transactionId)
      .eq("user_id", profile.id)
      .eq("is_active", true)
      .maybeSingle();
    if (participantRow) {
      callerRole = (participantRow as { role: TransactionParties["callerRole"] }).role;
    }
  }

  return {
    transaction,
    callerRole,
    isCustomer: callerRole === "customer",
    isOwner: callerRole === "owner" || transaction.owner_id === profile.id,
    isManagingAgent: callerRole === "managing_agent" || transaction.managing_agent_id === profile.id,
  };
}

// ---------------------------------------------------------------------------
// Eligibility checks
// ---------------------------------------------------------------------------

export type EligibilityResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Returns true if the caller can initiate a transaction for this property.
 *
 * Per spec Section 4: "Server-side eligibility is mandatory."
 * The caller must:
 *   1. Be authenticated + active
 *   2. NOT be the property owner / listing creator / managing agent
 *      (you don't transact on your own property)
 *   3. Have a "legitimate property interaction" — V1 treats ANY
 *      authenticated user with active account as eligible to inquire
 *      about a publicly-available property. The "legitimate interaction"
 *      is the inquiry itself; the conversation system is the channel.
 *   4. The property must be in an inquiry-eligible status
 *      (available / application_pending / under_offer).
 *   5. There must not be an existing active transaction for the same
 *      (property, customer, type) — handled by the UNIQUE partial index
 *      at the DB layer, but we check here for a better error message.
 */
export async function canInitiateTransaction(input: {
  propertyId: string;
  transactionType: "rent" | "sale" | "shortlet";
}): Promise<EligibilityResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, message: "Please sign in." };
  if (profile.account_status !== "active") {
    return { ok: false, message: `Your account is ${profile.account_status}.` };
  }
  if (!profile.onboarding_completed) {
    return { ok: false, message: "Please complete onboarding first." };
  }

  const ctx = await loadPropertyContext(input.propertyId);
  if (!ctx) return { ok: false, message: "Property not found." };

  if (!ctx.published_at) {
    return { ok: false, message: "This property is not publicly available." };
  }

  if (!["available", "application_pending", "under_offer"].includes(ctx.status)) {
    return {
      ok: false,
      message: `This property is currently ${ctx.status.replace(/_/g, " ")} and not accepting inquiries.`,
    };
  }

  // Don't transact on your own property
  if (
    ctx.owner_profile_id === profile.id ||
    ctx.listing_creator_id === profile.id ||
    ctx.managing_agent_id === profile.id
  ) {
    return { ok: false, message: "You cannot transact on your own property." };
  }

  // Check for an existing active transaction
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };
  const { data: existing } = await admin
    .from("transactions")
    .select("id, current_status")
    .eq("property_id", input.propertyId)
    .eq("customer_id", profile.id)
    .eq("transaction_type", input.transactionType)
    .not("current_status", "in", "(\"cancelled\",\"withdrawn\",\"expired\",\"declined\",\"transaction_completed\")")
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      message: "You already have an active transaction for this property.",
    };
  }

  return { ok: true };
}

/**
 * Returns true if the caller is a legitimate participant in this
 * transaction (i.e. should be able to view it).
 */
export async function canViewTransaction(
  transactionId: string,
): Promise<{ ok: true; parties: TransactionParties } | { ok: false; message: string }> {
  const parties = await loadTransactionParties(transactionId);
  if (!parties) return { ok: false, message: "Transaction not found." };
  if (!parties.callerRole) {
    return { ok: false, message: "FORBIDDEN" };
  }
  return { ok: true, parties };
}

/**
 * Returns true if the caller can transition the transaction's status
 * forward (e.g. schedule inspection, complete inspection, etc.).
 *
 * Per spec Section 8: state-machine transitions are constrained.
 * Per spec Section 29: customers CAN transition (they schedule inspections
 * too). But the customer CANNOT mark an inspection completed unless
 * they're the proposer (that's handled at the inspection-action level).
 *
 * For broad status transitions, any active participant can trigger.
 */
export async function canTransitionTransaction(
  transactionId: string,
): Promise<{ ok: true; parties: TransactionParties } | { ok: false; message: string }> {
  return canViewTransaction(transactionId);
}

/**
 * Returns true if the caller can submit an offer on this transaction.
 *
 * Per spec Section 18: "only legitimate transaction participants can
 * submit offers." The customer (prospective buyer/renter) is the
 * typical offer submitter. Owners/agents can submit counter-offers.
 */
export async function canSubmitOffer(
  transactionId: string,
): Promise<{ ok: true; parties: TransactionParties } | { ok: false; message: string }> {
  const result = await canViewTransaction(transactionId);
  if (!result.ok) return result;
  // Active participant = OK. (The customer offers, the owner counter-offers.)
  return result;
}

/**
 * Returns true if the caller can accept an offer.
 *
 * Per spec Section 20: only the property owner / managing agent /
 * managing company can accept. The customer CANNOT accept their own
 * offer.
 */
export async function canAcceptOffer(
  transactionId: string,
): Promise<{ ok: true; parties: TransactionParties } | { ok: false; message: string }> {
  const parties = await loadTransactionParties(transactionId);
  if (!parties) return { ok: false, message: "Transaction not found." };
  if (!parties.callerRole) {
    return { ok: false, message: "FORBIDDEN" };
  }
  if (!parties.isOwner && !parties.isManagingAgent && parties.callerRole !== "managing_company") {
    return {
      ok: false,
      message: "Only the property owner or authorized managing agent / company can accept offers.",
    };
  }
  return { ok: true, parties };
}

/**
 * Returns true if the caller can complete the transaction.
 *
 * Per spec Section 21, 29: owner / managing agent / managing company /
 * customer can report completion (it's user-reported, not platform-verified).
 */
export async function canCompleteTransaction(
  transactionId: string,
): Promise<{ ok: true; parties: TransactionParties } | { ok: false; message: string }> {
  return canViewTransaction(transactionId);
}

/**
 * Returns true if the caller can cancel the transaction.
 *
 * Per spec Section 37: customer withdrawal, owner withdrawal, property
 * no longer available, failed negotiation. Any active participant can
 * cancel.
 */
export async function canCancelTransaction(
  transactionId: string,
): Promise<{ ok: true; parties: TransactionParties } | { ok: false; message: string }> {
  return canViewTransaction(transactionId);
}
