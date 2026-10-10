"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProfileRow } from "@/types";
import { AdminSearch } from "./admin-search";
import { AdminFilters, AdminTable, StatusBadge, type AdminColumn } from "./admin-table";

interface Props {
  users: ProfileRow[];
  page: number;
  pageSize: number;
  total: number;
  currentFilters: {
    q?: string;
    role?: string;
    accountStatus?: string;
    verificationState?: string;
    subscriptionTier?: string;
  };
}

export function AdminUsersClient({ users, page, pageSize, total, currentFilters }: Props) {
  const router = useRouter();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/admin/users?${params.toString()}`);
  }

  function onPageChange(newPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`/admin/users?${params.toString()}`);
  }

  const columns: AdminColumn<ProfileRow>[] = [
    {
      key: "name",
      header: "Name",
      render: (u) => (
        <Link
          href={`/admin/users/${u.id}`}
          className="font-medium hover:underline"
        >
          {u.full_name}
        </Link>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (u) => <span className="capitalize text-xs">{u.role}</span>,
    },
    {
      key: "account_status",
      header: "Status",
      render: (u) => <StatusBadge status={u.account_status} />,
    },
    {
      key: "verification",
      header: "Verification",
      render: (u) => <StatusBadge status={u.verification_state} />,
    },
    {
      key: "tier",
      header: "Plan",
      render: (u) => <span className="capitalize text-xs">{u.subscription_tier}</span>,
    },
    {
      key: "phone",
      header: "Phone",
      render: (u) => <span className="text-xs">{u.phone ?? "—"}</span>,
    },
    {
      key: "created",
      header: "Joined",
      render: (u) => (
        <span className="text-xs">
          {new Date(u.created_at).toLocaleDateString("en-NG")}
        </span>
      ),
    },
  ];

  const mobileCard = (u: ProfileRow) => (
    <div className="space-y-1.5">
      <div className="flex justify-between items-start">
        <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">
          {u.full_name}
        </Link>
        <StatusBadge status={u.account_status} />
      </div>
      <p className="text-xs text-muted-foreground">
        {u.role} · {u.subscription_tier}
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search, filter, and moderate marketplace accounts.
        </p>
      </header>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <AdminSearch
          value={currentFilters.q ?? ""}
          onChange={(v) => updateParam("q", v)}
          placeholder="Search name or phone…"
          ariaLabel="Search users by name or phone"
          className="sm:max-w-xs"
        />
        <AdminFilters
          filters={[
            {
              key: "role",
              label: "Role",
              value: currentFilters.role ?? "all",
              options: [
                { value: "landlord", label: "Landlord" },
                { value: "agent", label: "Agent" },
                { value: "company", label: "Company" },
              ],
              onChange: (v) => updateParam("role", v),
            },
            {
              key: "status",
              label: "Status",
              value: currentFilters.accountStatus ?? "all",
              options: [
                { value: "active", label: "Active" },
                { value: "suspended", label: "Suspended" },
                { value: "banned", label: "Banned" },
                { value: "pending", label: "Pending" },
                { value: "deactivated", label: "Deactivated" },
              ],
              onChange: (v) => updateParam("status", v),
            },
            {
              key: "verification",
              label: "Verification",
              value: currentFilters.verificationState ?? "all",
              options: [
                { value: "unverified", label: "Unverified" },
                { value: "pending", label: "Pending" },
                { value: "bronze", label: "Bronze" },
                { value: "blue", label: "Blue" },
                { value: "rejected", label: "Rejected" },
                { value: "revoked", label: "Revoked" },
              ],
              onChange: (v) => updateParam("verification", v),
            },
            {
              key: "tier",
              label: "Plan",
              value: currentFilters.subscriptionTier ?? "all",
              options: [
                { value: "free", label: "Free" },
                { value: "pro", label: "Pro" },
                { value: "premium", label: "Premium" },
              ],
              onChange: (v) => updateParam("tier", v),
            },
          ]}
          onReset={() => router.push("/admin/users")}
        />
      </div>

      <AdminTable
        columns={columns}
        rows={users}
        rowKey={(u) => u.id}
        onRowClick={(u) => router.push(`/admin/users/${u.id}`)}
        mobileCard={mobileCard}
        pagination={{
          page,
          pageSize,
          total,
          onPageChange,
        }}
        emptyMessage="No users match these filters."
      />
    </div>
  );
}
