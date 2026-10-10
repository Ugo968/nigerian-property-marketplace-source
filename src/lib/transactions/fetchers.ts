/**
 * Transaction fetchers — read queries for the dashboard + admin.
 *
 * All fetchers:
 *   1. Resolve the caller's profile from the session.
 *   2. Use the RLS-bound server client (NOT the service-role admin client)
 *      so RLS enforces participant-only access per spec Section 46.
 *   3. Return typed rows.
 *
 * Per spec Section 49 (SEO / public privacy): transactions are NEVER
 * exposed through public APIs or public property pages.
 */

import { createServerClient } from "@/lib/db/supabase";
import { getCurrentProfile } from "@/lib/auth/server";
import type {
  TransactionRow,
  TransactionParticipantRow,
  TransactionStatusHistoryRow,
  InspectionRow,
  NegotiationRecordRow,
  OfferRow,
  OfferHistoryRow,
} from "@/types";

// ---------------------------------------------------------------------------
// List "my" transactions (caller is a participant)
// ---------------------------------------------------------------------------
export interface TransactionListFilters {
  status?: string;
  transactionType?: string;
  page?: number;
  pageSize?: number;
}

export async function listMyTransactions(
  filters: TransactionListFilters = {},
): Promise<{
  transactions: TransactionRow[];
  total: number;
  page: number;
  pageSize: number;
} | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createServerClient();
  if (!supabase) return null;

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 25, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // RLS narrows to transactions where caller is owner/customer/agent/participant.
  let query = supabase
    .from("transactions")
    .select("*", { count: "exact" });
  if (filters.status) query = query.eq("current_status", filters.status);
  if (filters.transactionType) query = query.eq("transaction_type", filters.transactionType);
  query = query.order("updated_at", { ascending: false }).range(from, to);

  const { data, count } = await query;
  return {
    transactions: (data ?? []) as TransactionRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Get a single transaction detail (RLS enforces participant-only access)
// ---------------------------------------------------------------------------
export async function getTransaction(
  transactionId: string,
): Promise<TransactionRow | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const supabase = await createServerClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .maybeSingle();
  return (data as TransactionRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// Get transaction participants (RLS: only co-participants can read)
// ---------------------------------------------------------------------------
export async function getTransactionParticipants(
  transactionId: string,
): Promise<TransactionParticipantRow[]> {
  const supabase = await createServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("transaction_participants")
    .select("*")
    .eq("transaction_id", transactionId)
    .eq("is_active", true);
  return (data ?? []) as TransactionParticipantRow[];
}

// ---------------------------------------------------------------------------
// Get status history (append-only timeline)
// ---------------------------------------------------------------------------
export async function getTransactionStatusHistory(
  transactionId: string,
): Promise<TransactionStatusHistoryRow[]> {
  const supabase = await createServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("transaction_status_history")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: true });
  return (data ?? []) as TransactionStatusHistoryRow[];
}

// ---------------------------------------------------------------------------
// Get inspections for a transaction
// ---------------------------------------------------------------------------
export async function getTransactionInspections(
  transactionId: string,
): Promise<InspectionRow[]> {
  const supabase = await createServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("inspections")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("proposed_at", { ascending: false });
  return (data ?? []) as InspectionRow[];
}

// ---------------------------------------------------------------------------
// Get negotiation records for a transaction
// ---------------------------------------------------------------------------
export async function getTransactionNegotiations(
  transactionId: string,
): Promise<NegotiationRecordRow[]> {
  const supabase = await createServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("negotiation_records")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: false });
  return (data ?? []) as NegotiationRecordRow[];
}

// ---------------------------------------------------------------------------
// Get offers for a transaction (RLS enforces offer-amount privacy —
// only the submitter + the counter-party can see amounts)
// ---------------------------------------------------------------------------
export async function getTransactionOffers(
  transactionId: string,
): Promise<OfferRow[]> {
  const supabase = await createServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("offers")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: false });
  return (data ?? []) as OfferRow[];
}

// ---------------------------------------------------------------------------
// Get offer history (counter-offer chain)
// ---------------------------------------------------------------------------
export async function getOfferHistory(
  offerId: string,
): Promise<OfferHistoryRow[]> {
  const supabase = await createServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("offer_history")
    .select("*")
    .eq("offer_id", offerId)
    .order("created_at", { ascending: true });
  return (data ?? []) as OfferHistoryRow[];
}

// ---------------------------------------------------------------------------
// Get a single inspection (for inspection detail / authorization checks)
// ---------------------------------------------------------------------------
export async function getInspection(
  inspectionId: string,
): Promise<InspectionRow | null> {
  const supabase = await createServerClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("inspections")
    .select("*")
    .eq("id", inspectionId)
    .maybeSingle();
  return (data as InspectionRow | null) ?? null;
}
