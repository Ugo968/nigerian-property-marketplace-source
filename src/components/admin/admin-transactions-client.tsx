"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminFilters, AdminTable, StatusBadge, type AdminColumn } from "./admin-table";
import type { TransactionRow } from "@/types";

interface Props {
  transactions: TransactionRow[];
  page: number;
  pageSize: number;
  total: number;
  currentFilters: { status?: string; transactionType?: string };
}

export function AdminTransactionsClient({
  transactions,
  page,
  pageSize,
  total,
  currentFilters,
}: Props) {
  const router = useRouter();
  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/admin/transactions?${params.toString()}`);
  }
  function onPageChange(newPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`/admin/transactions?${params.toString()}`);
  }

  const columns: AdminColumn<TransactionRow>[] = [
    {
      key: "id",
      header: "ID",
      render: (t) => (
        <Link href={`/admin/transactions/${t.id}`} className="text-xs hover:underline">
          {t.id.slice(0, 8)}…
        </Link>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (t) => <span className="text-xs capitalize">{t.transaction_type}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (t) => <StatusBadge status={t.current_status} />,
    },
    {
      key: "property",
      header: "Property",
      render: (t) => (
        <Link href={`/admin/properties/${t.property_id}`} className="text-xs hover:underline">
          View property
        </Link>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (t) => (
        <Link href={`/admin/users/${t.customer_id}`} className="text-xs hover:underline">
          View customer
        </Link>
      ),
    },
    {
      key: "created",
      header: "Started",
      render: (t) => (
        <span className="text-xs">{new Date(t.created_at).toLocaleDateString("en-NG")}</span>
      ),
    },
    {
      key: "completed",
      header: "Completed",
      render: (t) => (
        <span className="text-xs">
          {t.completed_at ? new Date(t.completed_at).toLocaleDateString("en-NG") : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Read-only transaction visibility. Admins cannot silently modify
          transaction history — high-impact admin intervention is audit-logged.
        </p>
      </header>

      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
        <p>
          <strong>Note:</strong> Transaction completion is user-reported in V1.
          The platform does NOT verify that money changed hands. Property sale/rent
          money is NOT processed by the platform.
        </p>
      </div>

      <AdminFilters
        filters={[
          {
            key: "status",
            label: "Status",
            value: currentFilters.status ?? "all",
            options: [
              { value: "inquiry", label: "Inquiry" },
              { value: "inspection_scheduled", label: "Inspection Scheduled" },
              { value: "inspection_completed", label: "Inspection Completed" },
              { value: "negotiation", label: "Negotiation" },
              { value: "offer_made", label: "Offer Made" },
              { value: "offer_accepted", label: "Offer Accepted" },
              { value: "transaction_completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
              { value: "withdrawn", label: "Withdrawn" },
            ],
            onChange: (v) => updateParam("status", v),
          },
          {
            key: "type",
            label: "Type",
            value: currentFilters.transactionType ?? "all",
            options: [
              { value: "rent", label: "Rent" },
              { value: "sale", label: "Sale" },
              { value: "shortlet", label: "Short-let" },
            ],
            onChange: (v) => updateParam("type", v),
          },
        ]}
        onReset={() => router.push("/admin/transactions")}
      />

      <AdminTable
        columns={columns}
        rows={transactions}
        rowKey={(t) => t.id}
        onRowClick={(t) => router.push(`/admin/transactions/${t.id}`)}
        mobileCard={(t) => (
          <div className="space-y-1.5">
            <div className="flex justify-between items-start">
              <Link href={`/admin/transactions/${t.id}`} className="text-xs hover:underline">
                {t.id.slice(0, 8)}…
              </Link>
              <StatusBadge status={t.current_status} />
            </div>
            <p className="text-xs text-muted-foreground capitalize">{t.transaction_type}</p>
          </div>
        )}
        pagination={{ page, pageSize, total, onPageChange }}
        emptyMessage="No transactions match these filters."
      />
    </div>
  );
}
