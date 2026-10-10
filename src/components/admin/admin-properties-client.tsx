"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PropertyRow } from "@/types";
import { AdminSearch } from "./admin-search";
import { AdminFilters, AdminTable, StatusBadge, type AdminColumn } from "./admin-table";

interface Props {
  properties: PropertyRow[];
  page: number;
  pageSize: number;
  total: number;
  currentFilters: { q?: string; status?: string; transactionType?: string };
}

export function AdminPropertiesClient({ properties, page, pageSize, total, currentFilters }: Props) {
  const router = useRouter();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/admin/properties?${params.toString()}`);
  }

  function onPageChange(newPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`/admin/properties?${params.toString()}`);
  }

  const columns: AdminColumn<PropertyRow>[] = [
    {
      key: "title",
      header: "Title",
      render: (p) => (
        <Link href={`/admin/properties/${p.id}`} className="font-medium hover:underline">
          {p.title}
        </Link>
      ),
    },
    {
      key: "transaction",
      header: "Type",
      render: (p) => <span className="capitalize text-xs">{p.transaction_type}</span>,
    },
    {
      key: "price",
      header: "Price",
      render: (p) => (
        <span className="text-xs">₦{(p.price / 100).toLocaleString("en-NG")}</span>
      ),
    },
    {
      key: "bedrooms",
      header: "Beds",
      render: (p) => <span className="text-xs">{p.bedrooms}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: "created",
      header: "Created",
      render: (p) => (
        <span className="text-xs">
          {new Date(p.created_at).toLocaleDateString("en-NG")}
        </span>
      ),
    },
  ];

  const mobileCard = (p: PropertyRow) => (
    <div className="space-y-1.5">
      <div className="flex justify-between items-start">
        <Link href={`/admin/properties/${p.id}`} className="font-medium hover:underline">
          {p.title}
        </Link>
        <StatusBadge status={p.status} />
      </div>
      <p className="text-xs text-muted-foreground">
        ₦{(p.price / 100).toLocaleString("en-NG")} · {p.bedrooms} beds
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Inspect listings, suspend or remove fraudulent ones, restore eligible ones.
        </p>
      </header>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <AdminSearch
          value={currentFilters.q ?? ""}
          onChange={(v) => updateParam("q", v)}
          placeholder="Search title…"
          ariaLabel="Search properties by title"
          className="sm:max-w-xs"
        />
        <AdminFilters
          filters={[
            {
              key: "status",
              label: "Status",
              value: currentFilters.status ?? "all",
              options: [
                { value: "draft", label: "Draft" },
                { value: "available", label: "Available" },
                { value: "rented", label: "Rented" },
                { value: "sold", label: "Sold" },
                { value: "suspended", label: "Suspended" },
                { value: "removed", label: "Removed" },
              ],
              onChange: (v) => updateParam("status", v),
            },
            {
              key: "transaction",
              label: "Transaction",
              value: currentFilters.transactionType ?? "all",
              options: [
                { value: "rent", label: "Rent" },
                { value: "sale", label: "Sale" },
                { value: "shortlet", label: "Short-let" },
              ],
              onChange: (v) => updateParam("transaction", v),
            },
          ]}
          onReset={() => router.push("/admin/properties")}
        />
      </div>

      <AdminTable
        columns={columns}
        rows={properties}
        rowKey={(p) => p.id}
        onRowClick={(p) => router.push(`/admin/properties/${p.id}`)}
        mobileCard={mobileCard}
        pagination={{ page, pageSize, total, onPageChange }}
        emptyMessage="No properties match these filters."
      />
    </div>
  );
}
