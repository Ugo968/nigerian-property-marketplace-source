"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReviewRow } from "@/types";
import { AdminSearch } from "./admin-search";
import { AdminFilters, AdminTable, StatusBadge, type AdminColumn } from "./admin-table";

interface Props {
  reviews: ReviewRow[];
  page: number;
  pageSize: number;
  total: number;
  currentFilters: { status?: string; q?: string };
}

export function AdminReviewsClient({ reviews, page, pageSize, total, currentFilters }: Props) {
  const router = useRouter();
  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/admin/reviews?${params.toString()}`);
  }
  function onPageChange(newPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`/admin/reviews?${params.toString()}`);
  }

  const columns: AdminColumn<ReviewRow>[] = [
    {
      key: "rating",
      header: "Rating",
      render: (r) => <span className="text-sm font-medium">{r.rating}★</span>,
    },
    {
      key: "title",
      header: "Title",
      render: (r) => (
        <Link href={`/admin/reviews/${r.id}`} className="font-medium hover:underline">
          {r.title ?? (r.body ?? "").slice(0, 40) + "…"}
        </Link>
      ),
    },
    {
      key: "reviewer",
      header: "Reviewer",
      render: (r) => (
        <Link href={`/admin/users/${r.reviewer_id}`} className="text-xs hover:underline">View</Link>
      ),
    },
    {
      key: "reviewed",
      header: "Reviewed",
      render: (r) => (
        <Link href={`/admin/users/${r.reviewed_id}`} className="text-xs hover:underline">View</Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "created",
      header: "Created",
      render: (r) => (
        <span className="text-xs">{new Date(r.created_at).toLocaleDateString("en-NG")}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Reviews</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hide / remove / restore reviews. You cannot alter ratings or rewrite bodies —
          moderation only.
        </p>
      </header>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <AdminSearch
          value={currentFilters.q ?? ""}
          onChange={(v) => updateParam("q", v)}
          placeholder="Search review body…"
          ariaLabel="Search reviews by body"
          className="sm:max-w-xs"
        />
        <AdminFilters
          filters={[
            {
              key: "status",
              label: "Status",
              value: currentFilters.status ?? "all",
              options: [
                { value: "pending", label: "Pending" },
                { value: "published", label: "Published" },
                { value: "hidden", label: "Hidden" },
                { value: "removed", label: "Removed" },
              ],
              onChange: (v) => updateParam("status", v),
            },
          ]}
          onReset={() => router.push("/admin/reviews")}
        />
      </div>

      <AdminTable
        columns={columns}
        rows={reviews}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/admin/reviews/${r.id}`)}
        mobileCard={(r) => (
          <div className="space-y-1.5">
            <div className="flex justify-between items-start">
              <Link href={`/admin/reviews/${r.id}`} className="font-medium hover:underline">
                {r.title ?? (r.body ?? "").slice(0, 40) + "…"}
              </Link>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-xs text-muted-foreground">{r.rating}★ rating</p>
          </div>
        )}
        pagination={{ page, pageSize, total, onPageChange }}
        emptyMessage="No reviews match these filters."
      />
    </div>
  );
}
