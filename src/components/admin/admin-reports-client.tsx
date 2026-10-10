"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReportRow } from "@/types";
import { AdminFilters, AdminTable, StatusBadge, type AdminColumn } from "./admin-table";

interface Props {
  reports: ReportRow[];
  page: number;
  pageSize: number;
  total: number;
  currentFilters: { status?: string; entityType?: string; reason?: string };
}

export function AdminReportsClient({ reports, page, pageSize, total, currentFilters }: Props) {
  const router = useRouter();
  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/admin/reports?${params.toString()}`);
  }
  function onPageChange(newPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`/admin/reports?${params.toString()}`);
  }

  const columns: AdminColumn<ReportRow>[] = [
    {
      key: "reason",
      header: "Reason",
      render: (r) => (
        <Link href={`/admin/reports/${r.id}`} className="font-medium hover:underline capitalize">
          {r.reason.replace(/_/g, " ")}
        </Link>
      ),
    },
    {
      key: "entity",
      header: "Target",
      render: (r) => (
        <span className="text-xs capitalize">{r.entity_type.replace(/_/g, " ")}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "description",
      header: "Description",
      render: (r) => (
        <span className="text-xs text-muted-foreground line-clamp-1">
          {r.description.slice(0, 80)}{r.description.length > 80 ? "…" : ""}
        </span>
      ),
    },
    {
      key: "created",
      header: "Filed",
      render: (r) => (
        <span className="text-xs">{new Date(r.created_at).toLocaleString("en-NG")}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Reports queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          User-submitted reports. Sort by severity / age / category / status.
          The reporter's identity is NOT visible to the reported user.
        </p>
      </header>

      <AdminFilters
        filters={[
          {
            key: "status",
            label: "Status",
            value: currentFilters.status ?? "all",
            options: [
              { value: "open", label: "Open" },
              { value: "investigating", label: "Investigating" },
              { value: "resolved", label: "Resolved" },
              { value: "dismissed", label: "Dismissed" },
              { value: "escalated", label: "Escalated" },
            ],
            onChange: (v) => updateParam("status", v),
          },
          {
            key: "entity",
            label: "Target",
            value: currentFilters.entityType ?? "all",
            options: [
              { value: "property", label: "Property" },
              { value: "profile", label: "User" },
              { value: "review", label: "Review" },
              { value: "message", label: "Message" },
              { value: "advertising_business", label: "Advertiser" },
              { value: "advertising_campaign", label: "Campaign" },
              { value: "other", label: "Other" },
            ],
            onChange: (v) => updateParam("entity", v),
          },
          {
            key: "reason",
            label: "Category",
            value: currentFilters.reason ?? "all",
            options: [
              { value: "fake_listing", label: "Fake listing" },
              { value: "scam_attempt", label: "Scam attempt" },
              { value: "wrong_property_info", label: "Wrong info" },
              { value: "already_sold_rented", label: "Already sold/rented" },
              { value: "fraudulent_agent", label: "Fraudulent agent" },
              { value: "fraudulent_owner", label: "Fraudulent owner" },
              { value: "harassment", label: "Harassment" },
              { value: "inappropriate_content", label: "Inappropriate" },
              { value: "suspicious_payment_request", label: "Suspicious payment" },
              { value: "other", label: "Other" },
            ],
            onChange: (v) => updateParam("reason", v),
          },
        ]}
        onReset={() => router.push("/admin/reports")}
      />

      <AdminTable
        columns={columns}
        rows={reports}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/admin/reports/${r.id}`)}
        mobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="flex justify-between items-start">
              <Link href={`/admin/reports/${r.id}`} className="font-medium hover:underline capitalize">
                {r.reason.replace(/_/g, " ")}
              </Link>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-xs text-muted-foreground capitalize">
              {r.entity_type.replace(/_/g, " ")} · {new Date(r.created_at).toLocaleDateString("en-NG")}
            </p>
          </div>
        )}
        pagination={{ page, pageSize, total, onPageChange }}
        emptyMessage="No reports match these filters."
      />
    </div>
  );
}
