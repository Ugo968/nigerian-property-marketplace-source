"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PaymentRow } from "@/types";
import { AdminSearch } from "./admin-search";
import { AdminFilters, AdminTable, StatusBadge, type AdminColumn } from "./admin-table";

interface Props {
  payments: PaymentRow[];
  page: number;
  pageSize: number;
  total: number;
  currentFilters: { provider?: string; paymentType?: string; status?: string; q?: string };
}

export function AdminPaymentsClient({ payments, page, pageSize, total, currentFilters }: Props) {
  const router = useRouter();
  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/admin/payments?${params.toString()}`);
  }
  function onPageChange(newPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`/admin/payments?${params.toString()}`);
  }

  const columns: AdminColumn<PaymentRow>[] = [
    {
      key: "amount",
      header: "Amount",
      render: (p) => (
        <span className="text-sm font-medium">₦{(p.amount / 100).toLocaleString("en-NG")}</span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (p) => <span className="text-xs capitalize">{p.payment_type.replace(/_/g, " ")}</span>,
    },
    {
      key: "provider",
      header: "Provider",
      render: (p) => <span className="text-xs capitalize">{p.provider}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: "ref",
      header: "Reference",
      render: (p) => (
        <code className="text-xs">{p.provider_reference ?? "—"}</code>
      ),
    },
    {
      key: "initiated",
      header: "Initiated",
      render: (p) => (
        <span className="text-xs">{new Date(p.initiated_at).toLocaleDateString("en-NG")}</span>
      ),
    },
    {
      key: "verified",
      header: "Verified",
      render: (p) => (
        <span className="text-xs">
          {p.verified_at ? new Date(p.verified_at).toLocaleString("en-NG") : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Platform payment ledger (subscriptions, featured promotions, advertising).
          <strong> Does NOT include property rent/sale money</strong> — V1 does not hold those funds.
        </p>
      </header>

      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
        <p>
          Payments are <strong>read-only</strong> to admins. Payment truth remains tied to
          verified provider state. Card numbers, CVVs, and provider secrets are NEVER stored
          or displayed.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <AdminSearch
          value={currentFilters.q ?? ""}
          onChange={(v) => updateParam("q", v)}
          placeholder="Search provider reference…"
          ariaLabel="Search payments by reference"
          className="sm:max-w-xs"
        />
        <AdminFilters
          filters={[
            {
              key: "provider",
              label: "Provider",
              value: currentFilters.provider ?? "all",
              options: [
                { value: "paystack", label: "Paystack" },
                { value: "flutterwave", label: "Flutterwave" },
              ],
              onChange: (v) => updateParam("provider", v),
            },
            {
              key: "type",
              label: "Type",
              value: currentFilters.paymentType ?? "all",
              options: [
                { value: "subscription", label: "Subscription" },
                { value: "featured_listing", label: "Featured listing" },
                { value: "advertising", label: "Advertising" },
                { value: "verification_fee", label: "Verification fee" },
                { value: "topup", label: "Top-up" },
              ],
              onChange: (v) => updateParam("type", v),
            },
            {
              key: "status",
              label: "Status",
              value: currentFilters.status ?? "all",
              options: [
                { value: "pending", label: "Pending" },
                { value: "successful", label: "Successful" },
                { value: "failed", label: "Failed" },
                { value: "cancelled", label: "Cancelled" },
                { value: "refunded", label: "Refunded" },
                { value: "expired", label: "Expired" },
              ],
              onChange: (v) => updateParam("status", v),
            },
          ]}
          onReset={() => router.push("/admin/payments")}
        />
      </div>

      <AdminTable
        columns={columns}
        rows={payments}
        rowKey={(p) => p.id}
        mobileCard={(p) => (
          <div className="space-y-1.5">
            <div className="flex justify-between items-start">
              <span className="text-sm font-medium">₦{(p.amount / 100).toLocaleString("en-NG")}</span>
              <StatusBadge status={p.status} />
            </div>
            <p className="text-xs text-muted-foreground capitalize">
              {p.payment_type.replace(/_/g, " ")} · {p.provider}
            </p>
          </div>
        )}
        pagination={{ page, pageSize, total, onPageChange }}
        emptyMessage="No payments match these filters."
      />
    </div>
  );
}
