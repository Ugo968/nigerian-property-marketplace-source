"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { StatusBadge } from "./admin-table";
import {
  approveCampaignAction,
  rejectCampaignAction,
  pauseCampaignAction,
  suspendAdvertiserAction,
} from "@/lib/admin";
import { useToast } from "@/hooks/use-toast";
import type { AdminActionRecordRow } from "@/types";

interface Props {
  campaign: {
    id: string;
    business_id: string;
    name: string;
    status: string;
    budget_naira: number;
    spent_naira: number;
    starts_at: string | null;
    ends_at: string | null;
    created_at: string;
  };
  business: {
    id: string;
    business_name: string;
    owner_user_id: string;
  } | null;
  creative: {
    id: string;
    creative_type: string;
    headline: string | null;
    body_text: string | null;
    cta_text: string | null;
    target_url: string;
  } | null;
  moderationHistory: AdminActionRecordRow[];
}

export function AdminCampaignDetailClient({
  campaign,
  business,
  creative,
  moderationHistory,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [action, setAction] = React.useState<"approve" | "reject" | "pause" | "suspend_advertiser" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleConfirm(reason: string) {
    setError(null);
    if (!action) return;
    let result;
    if (action === "approve") result = await approveCampaignAction({ campaignId: campaign.id });
    else if (action === "reject") result = await rejectCampaignAction({ campaignId: campaign.id, reason });
    else if (action === "pause") result = await pauseCampaignAction({ campaignId: campaign.id, reason });
    else if (action === "suspend_advertiser" && business) {
      result = await suspendAdvertiserAction({ businessId: business.id, reason });
    }
    if (result && !result.ok) {
      setError(result.message ?? "Action failed.");
      throw new Error(result.message ?? "Action failed.");
    }
    toast({ title: "Action completed" });
    setAction(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/advertising">← Back to advertising</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight mt-2">{campaign.name}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <StatusBadge status={campaign.status} />
          <span className="text-xs text-muted-foreground">
            ₦{(campaign.budget_naira / 100).toLocaleString("en-NG")} budget ·
            ₦{(campaign.spent_naira / 100).toLocaleString("en-NG")} spent
          </span>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Business</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {business ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Business name</span>
                <span>{business.business_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Owner</span>
                <Link href={`/admin/users/${business.owner_user_id}`} className="hover:underline">View owner</Link>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Business not found.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Creative</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {creative ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="capitalize">{creative.creative_type}</span>
              </div>
              {creative.headline ? (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Headline</p>
                  <p>{creative.headline}</p>
                </div>
              ) : null}
              {creative.body_text ? (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Body text</p>
                  <p>{creative.body_text}</p>
                </div>
              ) : null}
              {creative.cta_text ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CTA</span>
                  <span>{creative.cta_text}</span>
                </div>
              ) : null}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Target URL</p>
                <code className="text-xs break-all">{creative.target_url}</code>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No creative attached.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge status={campaign.status} />
          </div>
          {campaign.starts_at ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Starts</span>
              <span>{new Date(campaign.starts_at).toLocaleString("en-NG")}</span>
            </div>
          ) : null}
          {campaign.ends_at ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ends</span>
              <span>{new Date(campaign.ends_at).toLocaleString("en-NG")}</span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created</span>
            <span>{new Date(campaign.created_at).toLocaleString("en-NG")}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Moderation actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {campaign.status === "pending_review" && (
              <Button onClick={() => setAction("approve")}>Approve campaign</Button>
            )}
            {(campaign.status === "pending_review" || campaign.status === "active") && (
              <Button
                variant={campaign.status === "active" ? "outline" : "destructive"}
                onClick={() => setAction(campaign.status === "active" ? "pause" : "reject")}
              >
                {campaign.status === "active" ? "Pause campaign" : "Reject campaign"}
              </Button>
            )}
            {business && (
              <Button
                variant="destructive"
                onClick={() => setAction("suspend_advertiser")}
              >
                Suspend advertiser
              </Button>
            )}
          </div>
          {error ? <p className="text-sm text-destructive mt-2">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Moderation history</CardTitle>
        </CardHeader>
        <CardContent>
          {moderationHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No moderation actions recorded.</p>
          ) : (
            <ul className="space-y-2">
              {moderationHistory.map((r) => (
                <li key={r.id} className="border-l-2 border-muted pl-3 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{r.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("en-NG")}
                    </span>
                  </div>
                  {r.reason ? <p className="text-xs text-muted-foreground mt-0.5">Reason: {r.reason}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={action !== null}
        onOpenChange={(o) => { if (!o) setAction(null); }}
        title={
          action === "approve" ? "Approve campaign" :
          action === "reject" ? "Reject campaign" :
          action === "pause" ? "Pause campaign" :
          action === "suspend_advertiser" ? "Suspend advertiser" : "Confirm"
        }
        description={
          action === "approve" ? `Approve campaign "${campaign.name}"? It will start serving impressions immediately.` :
          action === "reject" ? `Reject campaign "${campaign.name}"? The advertiser will be notified with the reason.` :
          action === "pause" ? `Pause campaign "${campaign.name}"? Impressions will stop until the campaign is resumed.` :
          action === "suspend_advertiser" && business
          ? `Suspend advertiser "${business.business_name}"? All active campaigns will be paused. This is a high-impact action.`
          : "Confirm this moderation action."
        }
        actionLabel={
          action === "approve" ? "Approve campaign" :
          action === "reject" ? "Reject campaign" :
          action === "pause" ? "Pause campaign" :
          action === "suspend_advertiser" ? "Suspend advertiser" : "Confirm"
        }
        destructive={action === "reject" || action === "pause" || action === "suspend_advertiser"}
        requireReason={action !== "approve"}
        reasonMinLength={action === "suspend_advertiser" ? 5 : 3}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
