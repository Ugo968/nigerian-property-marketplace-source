"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminFilters, AdminTable, StatusBadge, type AdminColumn } from "./admin-table";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import {
  approvePromotionAction,
  rejectPromotionAction,
} from "@/lib/admin";
import { useToast } from "@/hooks/use-toast";

interface PromotionRow {
  id: string;
  property_id: string;
  purchaser_id: string;
  placement: string;
  status: string;
  starts_at: string;
  ends_at: string;
  impressions: number;
  clicks: number;
  created_at: string;
}

interface Props {
  promotions: PromotionRow[];
  page: number;
  pageSize: number;
  total: number;
  currentFilters: { status?: string };
}

export function AdminPromotionsClient({ promotions, page, pageSize, total, currentFilters }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [actionTarget, setActionTarget] = React.useState<{ id: string; action: "approve" | "reject" } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/admin/promotions?${params.toString()}`);
  }
  function onPageChange(newPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`/admin/promotions?${params.toString()}`);
  }

  async function handleConfirm(reason: string) {
    setError(null);
    if (!actionTarget) return;
    const result = actionTarget.action === "approve"
      ? await approvePromotionAction({ promotionId: actionTarget.id })
      : await rejectPromotionAction({ promotionId: actionTarget.id, reason });
    if (!result.ok) {
      setError(result.message ?? "Action failed.");
      throw new Error(result.message ?? "Action failed.");
    }
    toast({
      title: actionTarget.action === "approve" ? "Promotion approved" : "Promotion rejected",
    });
    setActionTarget(null);
    router.refresh();
  }

  const columns: AdminColumn<PromotionRow>[] = [
    {
      key: "property",
      header: "Property",
      render: (p) => (
        <Link href={`/admin/properties/${p.property_id}`} className="text-xs hover:underline">
          View property
        </Link>
      ),
    },
    {
      key: "purchaser",
      header: "Purchaser",
      render: (p) => (
        <Link href={`/admin/users/${p.purchaser_id}`} className="text-xs hover:underline">
          View user
        </Link>
      ),
    },
    {
      key: "placement",
      header: "Placement",
      render: (p) => <span className="text-xs capitalize">{p.placement}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: "starts",
      header: "Starts",
      render: (p) => <span className="text-xs">{new Date(p.starts_at).toLocaleDateString("en-NG")}</span>,
    },
    {
      key: "ends",
      header: "Ends",
      render: (p) => <span className="text-xs">{new Date(p.ends_at).toLocaleDateString("en-NG")}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      render: (p) => (
        <div className="flex gap-1">
          {(p.status === "scheduled" || p.status === "paused") && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setActionTarget({ id: p.id, action: "approve" });
              }}
            >
              Approve
            </Button>
          )}
          {p.status !== "cancelled" && (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setActionTarget({ id: p.id, action: "reject" });
              }}
            >
              Reject
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Featured promotions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Approve / reject featured-listing promotions. Paid promotion does NOT override
          hard search filters — it only boosts ranking.
        </p>
      </header>

      <AdminFilters
        filters={[
          {
            key: "status",
            label: "Status",
            value: currentFilters.status ?? "all",
            options: [
              { value: "scheduled", label: "Scheduled" },
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
              { value: "ended", label: "Ended" },
              { value: "cancelled", label: "Cancelled" },
            ],
            onChange: (v) => updateParam("status", v),
          },
        ]}
        onReset={() => router.push("/admin/promotions")}
      />

      <AdminTable
        columns={columns}
        rows={promotions}
        rowKey={(p) => p.id}
        mobileCard={(p) => (
          <div className="space-y-1.5">
            <div className="flex justify-between items-start">
              <Link href={`/admin/properties/${p.property_id}`} className="text-xs hover:underline">View property</Link>
              <StatusBadge status={p.status} />
            </div>
            <p className="text-xs text-muted-foreground capitalize">{p.placement}</p>
          </div>
        )}
        pagination={{ page, pageSize, total, onPageChange }}
        emptyMessage="No promotions match these filters."
      />

      <ConfirmDialog
        open={actionTarget !== null}
        onOpenChange={(o) => { if (!o) setActionTarget(null); }}
        title={actionTarget?.action === "approve" ? "Approve promotion" : "Reject promotion"}
        description={
          actionTarget?.action === "approve"
            ? "Approve this featured-listing promotion? It will go live immediately."
            : "Reject this featured-listing promotion? It will be cancelled. The purchaser will be notified."
        }
        actionLabel={actionTarget?.action === "approve" ? "Approve promotion" : "Reject promotion"}
        destructive={actionTarget?.action === "reject"}
        requireReason={actionTarget?.action === "reject"}
        reasonMinLength={3}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
