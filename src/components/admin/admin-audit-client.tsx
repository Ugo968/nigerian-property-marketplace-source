"use client";

import { useRouter } from "next/navigation";
import { AdminSearch } from "./admin-search";
import { AdminFilters, AdminTable, type AdminColumn } from "./admin-table";
import type { AuditLogRow } from "@/types";

interface Props {
  logs: AuditLogRow[];
  page: number;
  pageSize: number;
  total: number;
  currentFilters: { actorId?: string; action?: string; targetType?: string };
}

export function AdminAuditClient({ logs, page, pageSize, total, currentFilters }: Props) {
  const router = useRouter();
  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/admin/audit?${params.toString()}`);
  }
  function onPageChange(newPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`/admin/audit?${params.toString()}`);
  }

  const columns: AdminColumn<AuditLogRow>[] = [
    {
      key: "created",
      header: "Timestamp",
      render: (l) => (
        <span className="text-xs">{new Date(l.created_at).toLocaleString("en-NG")}</span>
      ),
    },
    { key: "action", header: "Action", render: (l) => <code className="text-xs">{l.action}</code> },
    {
      key: "actor",
      header: "Actor",
      render: (l) => <code className="text-xs">{l.actor_id ? l.actor_id.slice(0, 8) + "…" : "—"}</code>,
    },
    {
      key: "target",
      header: "Target",
      render: (l) => (
        <span className="text-xs">
          {l.target_type ? `${l.target_type}:` : "—"}
          {l.target_id ? " " + l.target_id.slice(0, 8) + "…" : ""}
        </span>
      ),
    },
    {
      key: "metadata",
      header: "Metadata",
      render: (l) => (
        <code className="text-xs text-muted-foreground line-clamp-1">
          {JSON.stringify(l.metadata).slice(0, 80)}
        </code>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Append-only audit trail of privileged actions. Records cannot be edited or deleted
          through the application.
        </p>
      </header>

      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
        <p>
          Audit records are <strong>append-only</strong>. No UPDATE or DELETE policies exist
          in the application. Modification through the UI is impossible.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <AdminSearch
          value={currentFilters.action ?? ""}
          onChange={(v) => updateParam("action", v)}
          placeholder="Search action (e.g. user.suspend)…"
          ariaLabel="Search audit by action"
          className="sm:max-w-xs"
        />
        <AdminFilters
          filters={[
            {
              key: "target",
              label: "Target type",
              value: currentFilters.targetType ?? "all",
              options: [
                { value: "user", label: "User" },
                { value: "property", label: "Property" },
                { value: "verification_application", label: "Verification" },
                { value: "review", label: "Review" },
                { value: "report", label: "Report" },
                { value: "advertising_campaign", label: "Campaign" },
                { value: "advertising_business", label: "Advertiser" },
                { value: "featured_listing", label: "Promotion" },
                { value: "payment", label: "Payment" },
              ],
              onChange: (v) => updateParam("target", v),
            },
          ]}
          onReset={() => router.push("/admin/audit")}
        />
      </div>

      <AdminTable
        columns={columns}
        rows={logs}
        rowKey={(l) => l.id}
        mobileCard={(l) => (
          <div className="space-y-1.5">
            <div className="flex justify-between items-start">
              <code className="text-xs">{l.action}</code>
              <span className="text-xs text-muted-foreground">
                {new Date(l.created_at).toLocaleString("en-NG")}
              </span>
            </div>
            {l.target_type ? (
              <p className="text-xs text-muted-foreground">
                {l.target_type}: {l.target_id?.slice(0, 8)}…
              </p>
            ) : null}
          </div>
        )}
        pagination={{ page, pageSize, total, onPageChange }}
        emptyMessage="No audit records match these filters."
      />
    </div>
  );
}
