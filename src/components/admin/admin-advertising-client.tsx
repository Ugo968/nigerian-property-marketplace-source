"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminFilters, AdminTable, StatusBadge, type AdminColumn } from "./admin-table";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import {
  approveCampaignAction,
  rejectCampaignAction,
  pauseCampaignAction,
} from "@/lib/admin/actions";
import { useToast } from "@/hooks/use-toast";

interface CampaignRow {
  id: string;
  business_id: string;
  name: string;
  status: string;
  budget_naira: number;
  spent_naira: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

interface Props {
  campaigns: CampaignRow[];
  page: number;
  pageSize: number;
  total: number;
  currentFilters: { status?: string };
}

export function AdminAdvertisingClient({ campaigns, page, pageSize, total, currentFilters }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [actionTarget, setActionTarget] = React.useState<{
    id: string;
    name: string;
    action: "approve" | "reject" | "pause";
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/admin/advertising?${params.toString()}`);
  }
  function onPageChange(newPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    router.push(`/admin/advertising?${params.toString()}`);
  }

  async function handleConfirm(reason: string) {
    setError(null);
    if (!actionTarget) return;
    let result;
    if (actionTarget.action === "approve") {
      result = await approveCampaignAction({ campaignId: actionTarget.id });
    } else if (actionTarget.action === "reject") {
      result = await rejectCampaignAction({ campaignId: actionTarget.id, reason });
    } else {
      result = await pauseCampaignAction({ campaignId: actionTarget.id, reason });
    }
    if (!result.ok) {
      setError(result.message ?? "Action failed.");
      throw new Error(result.message ?? "Action failed.");
    }
    toast({ title: `Campaign ${actionTarget.action}d` });
    setActionTarget(null);
    router.refresh();
  }

  const columns: AdminColumn<CampaignRow>[] = [
    {
      key: "name",
      header: "Campaign",
      render: (c) => (
        <Link href={`/admin/advertising/${c.id}`} className="font-medium hover:underline">
          {c.name}
        </Link>
      ),
    },
    {
      key: "budget",
      header: "Budget",
      render: (c) => <span className="text-xs">₦{(c.budget_naira / 100).toLocaleString("en-NG")}</span>,
    },
    {
      key: "spent",
      header: "Spent",
      render: (c) => <span className="text-xs">₦{(c.spent_naira / 100).toLocaleString("en-NG")}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: "created",
      header: "Created",
      render: (c) => <span className="text-xs">{new Date(c.created_at).toLocaleDateString("en-NG")}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      render: (c) => (
        <div className="flex gap-1">
          {c.status === "pending_review" && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setActionTarget({ id: c.id, name: c.name, action: "approve" });
              }}
            >
              Approve
            </Button>
          )}
          {(c.status === "pending_review" || c.status === "active") && (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setActionTarget({ id: c.id, name: c.name, action: c.status === "active" ? "pause" : "reject" });
              }}
            >
              {c.status === "active" ? "Pause" : "Reject"}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Advertising campaigns</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Approve / reject / pause advertising campaigns. Paid advertising does NOT
          automatically mean approved.
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
              { value: "pending_payment", label: "Pending payment" },
              { value: "pending_review", label: "Pending review" },
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
              { value: "completed", label: "Completed" },
              { value: "rejected", label: "Rejected" },
              { value: "cancelled", label: "Cancelled" },
            ],
            onChange: (v) => updateParam("status", v),
          },
        ]}
        onReset={() => router.push("/admin/advertising")}
      />

      <AdminTable
        columns={columns}
        rows={campaigns}
        rowKey={(c) => c.id}
        onRowClick={(c) => router.push(`/admin/advertising/${c.id}`)}
        mobileCard={(c) => (
          <div className="space-y-1.5">
            <div className="flex justify-between items-start">
              <Link href={`/admin/advertising/${c.id}`} className="font-medium hover:underline">
                {c.name}
              </Link>
              <StatusBadge status={c.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              ₦{(c.budget_naira / 100).toLocaleString("en-NG")} budget
            </p>
          </div>
        )}
        pagination={{ page, pageSize, total, onPageChange }}
        emptyMessage="No campaigns match these filters."
      />

      <ConfirmDialog
        open={actionTarget !== null}
        onOpenChange={(o) => { if (!o) setActionTarget(null); }}
        title={
          actionTarget?.action === "approve" ? "Approve campaign" :
          actionTarget?.action === "reject" ? "Reject campaign" :
          "Pause campaign"
        }
        description={
          actionTarget?.action === "approve"
            ? `Approve campaign "${actionTarget?.name}"? It will start serving impressions immediately.`
            : actionTarget?.action === "reject"
            ? `Reject campaign "${actionTarget?.name}"? The advertiser will be notified with the reason.`
            : `Pause campaign "${actionTarget?.name}"? Impressions will stop until the campaign is resumed.`
        }
        actionLabel={
          actionTarget?.action === "approve" ? "Approve campaign" :
          actionTarget?.action === "reject" ? "Reject campaign" :
          "Pause campaign"
        }
        destructive={actionTarget?.action !== "approve"}
        requireReason={actionTarget?.action !== "approve"}
        reasonMinLength={3}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
