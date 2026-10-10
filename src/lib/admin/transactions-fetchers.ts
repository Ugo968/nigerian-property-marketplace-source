/**
 * Admin fetchers for transactions (spec Section 47).
 *
 * Per spec Section 47: "admins must not silently modify transaction
 * history." These fetchers are READ-ONLY. Admin mutations go through
 * the regular transaction actions (with admin authorization via
 * requireAdminPermission) — not through a separate admin mutation path.
 *
 * The admin's role is visibility: see transactions, inspect history,
 * inspect reported transaction activity. Admins can also cancel a
 * transaction with a reason (audit-logged).
 */

import { createAdminClient } from "@/lib/db/supabase";
import { requireAdmin, requireAdminPermission } from "./permissions";
import type { TransactionRow, TransactionStatusHistoryRow, InspectionRow, OfferRow } from "@/types";

// ---------------------------------------------------------------------------
// List all transactions (admin read-only)
// ---------------------------------------------------------------------------
export async function adminListTransactions(filters: {
  status?: string;
  transactionType?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  transactions: TransactionRow[];
  total: number;
  page: number;
  pageSize: number;
} | null> {
  await requireAdminPermission("applications.view");
  const admin = createAdminClient();
  if (!admin) return null;

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 25, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from("transactions").select("*", { count: "exact" });
  if (filters.status) query = query.eq("current_status", filters.status);
  if (filters.transactionType) query = query.eq("transaction_type", filters.transactionType);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count } = await query;
  return {
    transactions: (data ?? []) as TransactionRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Get transaction detail (admin view)
// ---------------------------------------------------------------------------
export async function adminGetTransaction(
  transactionId: string,
): Promise<{
  transaction: TransactionRow;
  statusHistory: TransactionStatusHistoryRow[];
  inspections: InspectionRow[];
  offers: OfferRow[];
} | null> {
  await requireAdmin();
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: txRow } = await admin
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .maybeSingle();
  const transaction = txRow as TransactionRow | null;
  if (!transaction) return null;

  const [historyResp, inspectionsResp, offersResp] = await Promise.all([
    admin
      .from("transaction_status_history")
      .select("*")
      .eq("transaction_id", transactionId)
      .order("created_at", { ascending: true }),
    admin
      .from("inspections")
      .select("*")
      .eq("transaction_id", transactionId)
      .order("proposed_at", { ascending: false }),
    admin
      .from("offers")
      .select("*")
      .eq("transaction_id", transactionId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    transaction,
    statusHistory: (historyResp.data ?? []) as TransactionStatusHistoryRow[],
    inspections: (inspectionsResp.data ?? []) as InspectionRow[],
    offers: (offersResp.data ?? []) as OfferRow[],
  };
}

// ---------------------------------------------------------------------------
// Transaction analytics (spec Section 48) — basic operational metrics
// ---------------------------------------------------------------------------
export interface TransactionMetrics {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  withdrawn: number;
  inquiriesToday: number;
  inquiries7d: number;
  acceptedOffers: number;
  completedRentals: number;
  completedSales: number;
  completedShortlets: number;
}

export async function getTransactionMetrics(): Promise<TransactionMetrics | null> {
  await requireAdmin();
  const admin = createAdminClient();
  if (!admin) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { count: total } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true });

  const { count: active } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .not("current_status", "in", "(\"transaction_completed\",\"cancelled\",\"withdrawn\",\"expired\",\"declined\")");

  const { count: completed } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("current_status", "transaction_completed");

  const { count: cancelled } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("current_status", "cancelled");

  const { count: withdrawn } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("current_status", "withdrawn");

  const { count: inquiriesToday } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", todayStart);

  const { count: inquiries7d } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .gte("created_at", last7d);

  const { count: acceptedOffers } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .in("current_status", ["offer_accepted", "transaction_completed"]);

  const { count: completedRentals } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("current_status", "transaction_completed")
    .eq("transaction_type", "rent");

  const { count: completedSales } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("current_status", "transaction_completed")
    .eq("transaction_type", "sale");

  const { count: completedShortlets } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("current_status", "transaction_completed")
    .eq("transaction_type", "shortlet");

  return {
    total: total ?? 0,
    active: active ?? 0,
    completed: completed ?? 0,
    cancelled: cancelled ?? 0,
    withdrawn: withdrawn ?? 0,
    inquiriesToday: inquiriesToday ?? 0,
    inquiries7d: inquiries7d ?? 0,
    acceptedOffers: acceptedOffers ?? 0,
    completedRentals: completedRentals ?? 0,
    completedSales: completedSales ?? 0,
    completedShortlets: completedShortlets ?? 0,
  };
}
