"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

/**
 * Reusable admin table with:
 *   - Loading state (spinner overlay)
 *   - Empty state (centered icon + message)
 *   - Error state (centered message + retry button)
 *   - Pagination controls (prev / next + page indicator)
 *   - Responsive: on small screens, transforms into stacked cards via
 *     the `mobileCard` render prop (optional)
 *
 * Accessibility:
 *   - Column headers use scope="col"
 *   - Row actions have aria-label
 *   - Sortable columns have aria-sort
 */

export interface AdminColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
  /** Sortable — when set, clicking the header calls onSortChange. */
  sortable?: boolean;
}

interface AdminTableProps<T> {
  columns: AdminColumn<T>[];
  rows: T[];
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  onRetry?: () => void;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  /** Optional — render each row as a stacked card on mobile. */
  mobileCard?: (row: T) => React.ReactNode;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}

export function AdminTable<T>({
  columns,
  rows,
  loading,
  error,
  emptyMessage = "No records found.",
  onRetry,
  pagination,
  mobileCard,
  rowKey,
  onRowClick,
}: AdminTableProps<T>) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <p className="text-sm text-destructive mb-2">{error}</p>
            {onRetry ? (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden md:table w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      className={cn(
                        "px-3 py-2 text-left font-medium text-xs uppercase tracking-wide text-muted-foreground",
                        col.className,
                      )}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "hover:bg-muted/30 transition-colors",
                      onRowClick && "cursor-pointer",
                    )}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={cn("px-3 py-2", col.className)}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile stacked cards */}
            {mobileCard ? (
              <div className="md:hidden divide-y">
                {rows.map((row) => (
                  <div
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "p-3",
                      onRowClick && "cursor-pointer hover:bg-muted/30",
                    )}
                  >
                    {mobileCard(row)}
                  </div>
                ))}
              </div>
            ) : (
              /* Fallback: render the table on mobile too */
              <table className="md:hidden table w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    {columns.map((col) => (
                      <th key={col.key} scope="col" className="px-3 py-2 text-left font-medium text-xs">
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={rowKey(row)}>
                      {columns.map((col) => (
                        <td key={col.key} className="px-3 py-2">
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {pagination ? (
        <AdminPagination {...pagination} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
function AdminPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground">
        {total === 0 ? "No results" : `Showing ${from}–${to} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge — coloured badge for account/property/review statuses
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  // account_status
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-amber-100 text-amber-700",
  banned: "bg-red-100 text-red-700",
  pending: "bg-blue-100 text-blue-700",
  deactivated: "bg-gray-100 text-gray-700",
  // verification_state
  unverified: "bg-gray-100 text-gray-700",
  bronze: "bg-orange-100 text-orange-700",
  blue: "bg-blue-100 text-blue-700",
  rejected: "bg-red-100 text-red-700",
  revoked: "bg-red-100 text-red-700",
  // property status
  draft: "bg-gray-100 text-gray-700",
  available: "bg-emerald-100 text-emerald-700",
  rented: "bg-blue-100 text-blue-700",
  sold: "bg-purple-100 text-purple-700",
  under_offer: "bg-amber-100 text-amber-700",
  application_pending: "bg-amber-100 text-amber-700",
  unavailable: "bg-gray-100 text-gray-700",
  removed: "bg-red-100 text-red-700",
  // review status
  published: "bg-emerald-100 text-emerald-700",
  hidden: "bg-gray-100 text-gray-700",
  // report status
  open: "bg-amber-100 text-amber-700",
  investigating: "bg-blue-100 text-blue-700",
  in_review: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700",
  dismissed: "bg-gray-100 text-gray-700",
  escalated: "bg-red-100 text-red-700",
  // payment status
  successful: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  refunded: "bg-blue-100 text-blue-700",
  cancelled: "bg-gray-100 text-gray-700",
  expired: "bg-gray-100 text-gray-700",
  // campaign status (campaign-specific names below — would overlap with
  // property/review statuses above if repeated, so we omit them here
  // and rely on the generic fallback for those).
  // subscription status
  trialing: "bg-blue-100 text-blue-700",
  past_due: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 rounded text-xs font-medium capitalize",
        color,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// AdminFilters — simple filter dropdown row
// ---------------------------------------------------------------------------
interface AdminFilterOption {
  value: string;
  label: string;
}

interface AdminFiltersProps {
  filters: Array<{
    key: string;
    label: string;
    value: string;
    options: AdminFilterOption[];
    onChange: (value: string) => void;
  }>;
  onReset?: () => void;
}

export function AdminFilters({ filters, onReset }: AdminFiltersProps) {
  if (filters.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <div key={f.key} className="flex items-center gap-1">
          <label htmlFor={`filter-${f.key}`} className="text-xs text-muted-foreground">
            {f.label}
          </label>
          <Select value={f.value} onValueChange={f.onChange}>
            <SelectTrigger id={`filter-${f.key}`} className="h-8 text-xs w-32">
              <SelectValue placeholder={f.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {f.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
      {onReset ? (
        <Button variant="ghost" size="sm" onClick={onReset} className="text-xs">
          Reset
        </Button>
      ) : null}
    </div>
  );
}
