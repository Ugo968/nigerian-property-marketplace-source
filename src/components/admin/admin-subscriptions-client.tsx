"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AdminFilters, AdminTable, StatusBadge, type AdminColumn } from "./admin-table";

interface SubscriptionRow {
  id: string;
  user_id: string;
  role: string;
  tier: string;
  status: string;
  provider: string | null;
  billing_cycle: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

interface Props {
  subscriptions: SubscriptionRow[];
  page: number;
  pageSize: number;
  total: number;
  currentFilters: { status?: string; tier?: string };
}

export function AdminSubscriptionsClient({ subscriptions, page, pageSize, total, currentFilters }: Props) {
  const router = useRouter();
  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/admin/subscriptions?${params.toString()}`);
  }
  function onPageChange(newPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`/admin/subscriptions?${params.toString()}`);
  }

  const columns: AdminColumn<SubscriptionRow>[] = [
    { key: "id", header: "ID", render: (s) => <code className="text-xs">{s.id.slice(0, 8)}…</code> },
    { key: "role", header: "Role", render: (s) => <span className="capitalize text-xs">{s.role}</span> },
    { key: "tier", header: "Tier", render: (s) => <span className="capitalize text-xs">{s.tier}</span> },
    { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
    { key: "provider", header: "Provider", render: (s) => <span className="text-xs capitalize">{s.provider ?? "—"}</span> },
    { key: "period", header: "Period end", render: (s) => (
      <span className="text-xs">
        {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString("en-NG") : "—"}
      </span>
    )},
    { key: "created", header: "Started", render: (s) => (
      <span className="text-xs">{new Date(s.created_at).toLocaleDateString("en-NG")}</span>
    )},
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View subscription lifecycle. Pause / cancel / restore use the existing subscription service.
          Direct DB mutations are not exposed.
        </p>
      </header>

      <AdminFilters
        filters={[
          {
            key: "status",
            label: "Status",
            value: currentFilters.status ?? "all",
            options: [
              { value: "active", label: "Active" },
              { value: "trialing", label: "Trialing" },
              { value: "past_due", label: "Past due" },
              { value: "cancelled", label: "Cancelled" },
              { value: "expired", label: "Expired" },
              { value: "incomplete", label: "Incomplete" },
            ],
            onChange: (v) => updateParam("status", v),
          },
          {
            key: "tier",
            label: "Tier",
            value: currentFilters.tier ?? "all",
            options: [
              { value: "free", label: "Free" },
              { value: "pro", label: "Pro" },
              { value: "premium", label: "Premium" },
            ],
            onChange: (v) => updateParam("tier", v),
          },
        ]}
        onReset={() => router.push("/admin/subscriptions")}
      />

      <AdminTable
        columns={columns}
        rows={subscriptions}
        rowKey={(s) => s.id}
        mobileCard={(s) => (
          <div className="space-y-1.5">
            <div className="flex justify-between items-start">
              <span className="capitalize text-sm font-medium">{s.tier} · {s.role}</span>
              <StatusBadge status={s.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {s.current_period_end ? `Ends ${new Date(s.current_period_end).toLocaleDateString("en-NG")}` : "—"}
            </p>
          </div>
        )}
        pagination={{ page, pageSize, total, onPageChange }}
        emptyMessage="No subscriptions match these filters."
      />
    </div>
  );
}
