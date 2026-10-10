"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminFilters, AdminTable, StatusBadge, type AdminColumn } from "./admin-table";

interface VerificationRow {
  id: string;
  applicant_id: string;
  tier: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  applications: VerificationRow[];
  page: number;
  pageSize: number;
  total: number;
  currentFilters: { status?: string; tier?: string };
}

export function AdminVerificationsClient({ applications, page, pageSize, total, currentFilters }: Props) {
  const router = useRouter();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/admin/verifications?${params.toString()}`);
  }
  function onPageChange(newPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`/admin/verifications?${params.toString()}`);
  }

  const columns: AdminColumn<VerificationRow>[] = [
    {
      key: "id",
      header: "Application",
      render: (a) => (
        <Link href={`/admin/verifications/${a.id}`} className="font-medium hover:underline">
          {a.id.slice(0, 8)}…
        </Link>
      ),
    },
    { key: "applicant", header: "Applicant", render: (a) => (
      <Link href={`/admin/users/${a.applicant_id}`} className="text-xs hover:underline">View profile</Link>
    )},
    { key: "tier", header: "Tier", render: (a) => <span className="capitalize text-xs">{a.tier}</span> },
    { key: "status", header: "Status", render: (a) => <StatusBadge status={a.status} /> },
    { key: "created", header: "Submitted", render: (a) => (
      <span className="text-xs">{new Date(a.created_at).toLocaleDateString("en-NG")}</span>
    )},
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Verification applications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and approve / reject / revoke verification applications.
          Bronze and Blue remain distinct tiers.
        </p>
      </header>

      <AdminFilters
        filters={[
          {
            key: "status",
            label: "Status",
            value: currentFilters.status ?? "all",
            options: [
              { value: "draft", label: "Draft" },
              { value: "submitted", label: "Submitted" },
              { value: "in_review", label: "In review" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
              { value: "withdrawn", label: "Withdrawn" },
            ],
            onChange: (v) => updateParam("status", v),
          },
          {
            key: "tier",
            label: "Tier",
            value: currentFilters.tier ?? "all",
            options: [
              { value: "bronze", label: "Bronze" },
              { value: "blue", label: "Blue" },
            ],
            onChange: (v) => updateParam("tier", v),
          },
        ]}
        onReset={() => router.push("/admin/verifications")}
      />

      <AdminTable
        columns={columns}
        rows={applications}
        rowKey={(a) => a.id}
        onRowClick={(a) => router.push(`/admin/verifications/${a.id}`)}
        mobileCard={(a) => (
          <div className="space-y-1.5">
            <div className="flex justify-between items-start">
              <Link href={`/admin/verifications/${a.id}`} className="font-medium hover:underline">
                {a.id.slice(0, 8)}…
              </Link>
              <StatusBadge status={a.status} />
            </div>
            <p className="text-xs text-muted-foreground capitalize">{a.tier} tier</p>
          </div>
        )}
        pagination={{ page, pageSize, total, onPageChange }}
        emptyMessage="No verification applications match these filters."
      />
    </div>
  );
}
