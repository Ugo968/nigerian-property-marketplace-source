"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminFilters, AdminTable, StatusBadge, type AdminColumn } from "./admin-table";

interface ApplicationRow {
  id: string;
  property_id: string;
  agent_id: string;
  decision_maker_id: string;
  status: string;
  application_message: string;
  created_at: string;
}

interface Props {
  applications: ApplicationRow[];
  page: number;
  pageSize: number;
  total: number;
  currentStatus: string;
}

export function AdminApplicationsClient({ applications, page, pageSize, total, currentStatus }: Props) {
  const router = useRouter();
  function onPageChange(newPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`/admin/applications?${params.toString()}`);
  }
  function updateStatus(value: string) {
    if (value && value !== "all") {
      router.push(`/admin/applications?status=${value}`);
    } else {
      router.push("/admin/applications");
    }
  }

  const columns: AdminColumn<ApplicationRow>[] = [
    {
      key: "id",
      header: "ID",
      render: (a) => <code className="text-xs">{a.id.slice(0, 8)}…</code>,
    },
    {
      key: "property",
      header: "Property",
      render: (a) => (
        <Link href={`/admin/properties/${a.property_id}`} className="text-xs hover:underline">View</Link>
      ),
    },
    {
      key: "agent",
      header: "Agent",
      render: (a) => (
        <Link href={`/admin/users/${a.agent_id}`} className="text-xs hover:underline">View agent</Link>
      ),
    },
    {
      key: "decision_maker",
      header: "Decision maker",
      render: (a) => (
        <Link href={`/admin/users/${a.decision_maker_id}`} className="text-xs hover:underline">View</Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (a) => <StatusBadge status={a.status} />,
    },
    {
      key: "created",
      header: "Submitted",
      render: (a) => (
        <span className="text-xs">{new Date(a.created_at).toLocaleDateString("en-NG")}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Property applications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Agent applications to represent properties. Read-only view for moderation visibility.
        </p>
      </header>

      <AdminFilters
        filters={[
          {
            key: "status",
            label: "Status",
            value: currentStatus,
            options: [
              { value: "pending", label: "Pending" },
              { value: "accepted", label: "Accepted" },
              { value: "declined", label: "Declined" },
              { value: "withdrawn", label: "Withdrawn" },
              { value: "expired", label: "Expired" },
            ],
            onChange: updateStatus,
          },
        ]}
        onReset={() => router.push("/admin/applications")}
      />

      <AdminTable
        columns={columns}
        rows={applications}
        rowKey={(a) => a.id}
        mobileCard={(a) => (
          <div className="space-y-1.5">
            <div className="flex justify-between items-start">
              <code className="text-xs">{a.id.slice(0, 8)}…</code>
              <StatusBadge status={a.status} />
            </div>
          </div>
        )}
        pagination={{ page, pageSize, total, onPageChange }}
        emptyMessage="No applications match these filters."
      />
    </div>
  );
}
