"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, Loader2, AlertCircle, Building2, Megaphone,
  CheckCircle2, Clock, XCircle, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  createBusinessAction, createCampaignAction,
  submitCampaignAction, pauseCampaignAction, resumeCampaignAction,
  cancelCampaignAction,
} from "@/lib/advertising/actions";
import {
  MIN_CAMPAIGN_BUDGET_NAIRA,
  CAMPAIGN_STATUS_LABELS,
} from "@/lib/advertising/config";
import { formatNaira } from "@/lib/subscriptions/plans";
import type { AdvertiserBusiness, AdvertiserCampaign } from "@/lib/advertising/fetchers";
import type { PaymentProvider } from "@/types";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_payment: "bg-warning/10 text-warning",
  pending_review: "bg-info/10 text-info",
  active: "bg-success/10 text-success",
  paused: "bg-warning/10 text-warning",
  completed: "bg-muted text-muted-foreground",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-destructive/10 text-destructive",
};

const BIZ_STATUS_TONE: Record<string, string> = {
  active: "bg-success/10 text-success",
  pending_review: "bg-info/10 text-info",
  suspended: "bg-destructive/10 text-destructive",
  rejected: "bg-destructive/10 text-destructive",
  archived: "bg-muted text-muted-foreground",
};

export function AdvertisingDashboard({
  businesses,
  campaigns,
  categories,
  placements,
}: {
  businesses: AdvertiserBusiness[];
  campaigns: AdvertiserCampaign[];
  categories: Array<{ id: string; slug: string; label: string }>;
  placements: Array<{ id: string; slug: string; label: string }>;
}) {
  const router = useRouter();
  const [bizDialogOpen, setBizDialogOpen] = React.useState(false);
  const [campDialogOpen, setCampDialogOpen] = React.useState(false);
  const [selectedBizId, setSelectedBizId] = React.useState<string>("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Business form state
  const [bizName, setBizName] = React.useState("");
  const [bizCategory, setBizCategory] = React.useState("");
  const [bizEmail, setBizEmail] = React.useState("");
  const [bizPhone, setBizPhone] = React.useState("");
  const [bizWebsite, setBizWebsite] = React.useState("");
  const [bizDescription, setBizDescription] = React.useState("");
  const [bizState, setBizState] = React.useState("");
  const [bizCity, setBizCity] = React.useState("");

  // Campaign form state
  const [campName, setCampName] = React.useState("");
  const [campPlacement, setCampPlacement] = React.useState("");
  const [campBudget, setCampBudget] = React.useState(MIN_CAMPAIGN_BUDGET_NAIRA);

  async function handleCreateBusiness() {
    setPending(true);
    setError(null);
    const result = await createBusinessAction({
      businessName: bizName,
      categoryId: bizCategory,
      contactEmail: bizEmail,
      contactPhone: bizPhone,
      website: bizWebsite,
      description: bizDescription,
      state: bizState,
      city: bizCity,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to create business.");
      return;
    }
    setBizDialogOpen(false);
    // Reset form
    setBizName(""); setBizCategory(""); setBizEmail(""); setBizPhone("");
    setBizWebsite(""); setBizDescription(""); setBizState(""); setBizCity("");
    router.refresh();
  }

  async function handleCreateCampaign() {
    setPending(true);
    setError(null);
    const result = await createCampaignAction({
      businessId: selectedBizId,
      name: campName,
      placementId: campPlacement,
      budgetNaira: campBudget,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to create campaign.");
      return;
    }
    setCampDialogOpen(false);
    setCampName(""); setCampPlacement(""); setCampBudget(MIN_CAMPAIGN_BUDGET_NAIRA);
    router.refresh();
  }

  async function handleSubmitCampaign(campaignId: string, provider: PaymentProvider) {
    setPending(true);
    setError(null);
    const result = await submitCampaignAction({ campaignId, provider });
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to submit campaign.");
      return;
    }
    if (result.redirectTo) {
      // eslint-disable-next-line react-hooks/immutability
      window.location.href = result.redirectTo;
    }
  }

  async function handlePauseCampaign(campaignId: string) {
    setPending(true);
    const result = await pauseCampaignAction(campaignId);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to pause.");
      return;
    }
    router.refresh();
  }

  async function handleResumeCampaign(campaignId: string) {
    setPending(true);
    const result = await resumeCampaignAction(campaignId);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to resume.");
      return;
    }
    router.refresh();
  }

  async function handleCancelCampaign(campaignId: string) {
    if (!confirm("Cancel this campaign? This cannot be undone.")) return;
    setPending(true);
    const result = await cancelCampaignAction(campaignId);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to cancel.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Businesses section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Businesses</h3>
          <Button size="sm" onClick={() => setBizDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
            New business
          </Button>
        </div>

        {businesses.length === 0 ? (
          <EmptyState
            title="No businesses yet"
            description="Create a business profile to start advertising your services."
          />
        ) : (
          <div className="grid gap-4">
            {businesses.map((biz) => (
              <Card key={biz.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {biz.logo_url ? (
                      <img src={biz.logo_url} alt={biz.business_name} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <Link href={`/businesses/${biz.id}`} className="font-medium text-sm hover:underline truncate block">
                        {biz.business_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{biz.category_label}</p>
                      {biz.state ? <p className="text-xs text-muted-foreground">{biz.city}, {biz.state}</p> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BIZ_STATUS_TONE[biz.status] ?? BIZ_STATUS_TONE.pending_review}`}>
                      {biz.status.replace(/_/g, " ")}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => { setSelectedBizId(biz.id); setCampDialogOpen(true); }}>
                      <Megaphone className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                      Campaign
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Campaigns section */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Campaigns</h3>
        {campaigns.length === 0 ? (
          <EmptyState title="No campaigns" description="Create a campaign to promote your business." />
        ) : (
          <div className="grid gap-4">
            {campaigns.map((camp) => (
              <Card key={camp.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{camp.name}</p>
                      <p className="text-xs text-muted-foreground">{camp.business_name} · {camp.placement_label}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[camp.status] ?? STATUS_TONE.draft}`}>
                      {CAMPAIGN_STATUS_LABELS[camp.status as keyof typeof CAMPAIGN_STATUS_LABELS] ?? camp.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Budget: {formatNaira(camp.budget_naira)}</span>
                    <span>Spent: {formatNaira(camp.spent_naira)}</span>
                    {camp.status === "active" ? (
                      <>
                        <span>{camp.impressions} impressions</span>
                        <span>{camp.clicks} clicks</span>
                      </>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {camp.status === "draft" ? (
                      <>
                        <Button size="sm" onClick={() => handleSubmitCampaign(camp.id, "paystack")} disabled={pending}>
                          Submit & Pay
                        </Button>
                      </>
                    ) : null}
                    {camp.status === "active" ? (
                      <Button size="sm" variant="outline" onClick={() => handlePauseCampaign(camp.id)} disabled={pending}>
                        Pause
                      </Button>
                    ) : null}
                    {camp.status === "paused" ? (
                      <Button size="sm" variant="outline" onClick={() => handleResumeCampaign(camp.id)} disabled={pending}>
                        Resume
                      </Button>
                    ) : null}
                    {["draft", "active", "paused", "pending_review"].includes(camp.status) ? (
                      <Button size="sm" variant="ghost" onClick={() => handleCancelCampaign(camp.id)} disabled={pending}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create business dialog */}
      <Dialog open={bizDialogOpen} onOpenChange={setBizDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create business profile</DialogTitle>
            <DialogDescription>
              Register your housing-related business to advertise on Shelty.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="biz-name">Business name *</Label>
              <Input id="biz-name" value={bizName} onChange={(e) => setBizName(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-cat">Category *</Label>
              <Select value={bizCategory || undefined} onValueChange={setBizCategory}>
                <SelectTrigger id="biz-cat"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-email">Contact email *</Label>
              <Input id="biz-email" type="email" value={bizEmail} onChange={(e) => setBizEmail(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="biz-phone">Phone</Label>
                <Input id="biz-phone" value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-website">Website</Label>
                <Input id="biz-website" value={bizWebsite} onChange={(e) => setBizWebsite(e.target.value)} placeholder="https://..." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-desc">Description</Label>
              <Textarea id="biz-desc" value={bizDescription} onChange={(e) => setBizDescription(e.target.value)} rows={3} maxLength={1000} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="biz-state">State</Label>
                <Input id="biz-state" value={bizState} onChange={(e) => setBizState(e.target.value)} placeholder="e.g. Lagos" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-city">City</Label>
                <Input id="biz-city" value={bizCity} onChange={(e) => setBizCity(e.target.value)} placeholder="e.g. Lekki" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBizDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateBusiness} disabled={pending || !bizName || !bizCategory || !bizEmail}>
              {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create campaign dialog */}
      <Dialog open={campDialogOpen} onOpenChange={setCampDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create campaign</DialogTitle>
            <DialogDescription>
              Set up a new advertising campaign. Minimum budget: {formatNaira(MIN_CAMPAIGN_BUDGET_NAIRA)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="camp-name">Campaign name *</Label>
              <Input id="camp-name" value={campName} onChange={(e) => setCampName(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-placement">Placement *</Label>
              <Select value={campPlacement || undefined} onValueChange={setCampPlacement}>
                <SelectTrigger id="camp-placement"><SelectValue placeholder="Select placement" /></SelectTrigger>
                <SelectContent>
                  {placements.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-budget">Budget (₦) *</Label>
              <Input id="camp-budget" type="number" min={MIN_CAMPAIGN_BUDGET_NAIRA} value={campBudget} onChange={(e) => setCampBudget(Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Minimum: {formatNaira(MIN_CAMPAIGN_BUDGET_NAIRA)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCampaign} disabled={pending || !campName || !campPlacement || campBudget < MIN_CAMPAIGN_BUDGET_NAIRA}>
              {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" /> : null}
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
