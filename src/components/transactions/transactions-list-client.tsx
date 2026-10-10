"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import {
  TRANSACTION_STATUS_LABELS,
  isActiveStatus,
} from "@/lib/transactions/state-machine";
import type { TransactionRow } from "@/types";
import { StatusBadge } from "@/components/admin/admin-table";

interface Props {
  transactions: TransactionRow[];
  page: number;
  pageSize: number;
  total: number;
  currentFilters: { status?: string; transactionType?: string };
}

export function TransactionsListClient({
  transactions,
  page,
  pageSize,
  total,
  currentFilters,
}: Props) {
  const router = useRouter();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/dashboard/transactions?${params.toString()}`);
  }
  function onPageChange(newPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`/dashboard/transactions?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track property inquiries, inspections, offers, and completed deals.
        </p>
      </header>

      {/* Safety warning (spec Section 13, 43) */}
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
        <p>
          <strong>Stay safe:</strong> Always inspect the property in person and
          independently verify the owner/agent, ownership documents, property
          details, and payment information before making any payment or commitment.
          The platform does NOT hold transaction money in V1.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground">Status:</label>
        <select
          className="text-xs border rounded px-2 py-1 bg-background"
          value={currentFilters.status ?? "all"}
          onChange={(e) => updateFilter("status", e.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All</option>
          <option value="inquiry">Inquiry</option>
          <option value="inspection_scheduled">Inspection Scheduled</option>
          <option value="inspection_completed">Inspection Completed</option>
          <option value="negotiation">Negotiation</option>
          <option value="offer_made">Offer Made</option>
          <option value="offer_accepted">Offer Accepted</option>
          <option value="transaction_completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="withdrawn">Withdrawn</option>
        </select>

        <label className="text-xs text-muted-foreground ml-2">Type:</label>
        <select
          className="text-xs border rounded px-2 py-1 bg-background"
          value={currentFilters.transactionType ?? "all"}
          onChange={(e) => updateFilter("type", e.target.value)}
          aria-label="Filter by transaction type"
        >
          <option value="all">All</option>
          <option value="rent">Rent</option>
          <option value="sale">Sale</option>
          <option value="shortlet">Short-let</option>
        </select>
      </div>

      {transactions.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title="No transactions yet"
          description="When you start an inquiry on a property, your transactions will appear here."
          action={
            <Button asChild>
              <Link href="/properties">Browse properties</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {transactions.map((t) => (
            <li key={t.id}>
              <Link href={`/dashboard/transactions/${t.id}`} className="block">
                <Card className="hover:border-primary/40 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs uppercase tracking-wide text-muted-foreground capitalize">
                            {t.transaction_type}
                          </span>
                          <StatusBadge status={t.current_status} />
                          {isActiveStatus(t.current_status) && (
                            <span className="text-xs text-emerald-600 font-medium">
                              ● Active
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium">
                          Transaction {t.id.slice(0, 8)}…
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Started {new Date(t.created_at).toLocaleDateString("en-NG")}
                          {t.completed_at ? ` · Completed ${new Date(t.completed_at).toLocaleDateString("en-NG")}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {TRANSACTION_STATUS_LABELS[t.current_status]}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Page {page} of {Math.ceil(total / pageSize)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= Math.ceil(total / pageSize)}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
