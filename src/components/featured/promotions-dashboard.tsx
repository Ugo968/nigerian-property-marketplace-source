"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, Plus, Loader2, AlertCircle, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner, EmptyState } from "@/components/ui/feedback";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cancelPromotionAction, purchaseCreditsAction } from "@/lib/featured/actions";
import { CREDIT_PURCHASE_PRICE_NAIRA } from "@/lib/featured/config";
import { formatNaira } from "@/lib/subscriptions/plans";
import type { UserPromotion, UserCredits } from "@/lib/featured/fetchers";
import type { UserRole } from "@/types";

const STATUS_ICON: Record<string, React.ElementType> = {
  active: CheckCircle2,
  scheduled: Clock,
  paused: Clock,
  completed: CheckCircle2,
  cancelled: XCircle,
  pending_payment: AlertCircle,
  pending_review: Clock,
  rejected: XCircle,
  expired: XCircle,
  draft: Clock,
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-success/10 text-success",
  scheduled: "bg-info/10 text-info",
  paused: "bg-warning/10 text-warning",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  pending_payment: "bg-warning/10 text-warning",
  pending_review: "bg-info/10 text-info",
  rejected: "bg-destructive/10 text-destructive",
  expired: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
};

const PLACEMENT_LABELS: Record<string, string> = {
  homepage: "Homepage Featured",
  search: "Search Boost",
  category: "Category Featured",
  location: "Location Featured",
};

export function PromotionsDashboard({
  promotions,
  credits,
  userRole,
}: {
  promotions: UserPromotion[];
  credits: UserCredits;
  userRole: UserRole;
}) {
  const router = useRouter();
  const [cancelTarget, setCancelTarget] = React.useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = React.useState(false);
  const [creditPurchaseOpen, setCreditPurchaseOpen] = React.useState(false);
  const [creditAmount, setCreditAmount] = React.useState(5);
  const [pendingPurchase, setPendingPurchase] = React.useState(false);
  const [purchaseError, setPurchaseError] = React.useState<string | null>(null);

  // Only landlords and companies can promote (agents can't list properties)
  const canPromote = userRole === "landlord" || userRole === "company";

  async function handleCancel() {
    if (!cancelTarget) return;
    setPendingCancel(true);
    const result = await cancelPromotionAction(cancelTarget);
    setPendingCancel(false);
    setCancelTarget(null);
    if (!result.ok) {
      alert(result.message ?? "Failed to cancel promotion.");
      return;
    }
    router.refresh();
  }

  async function handlePurchaseCredits() {
    setPendingPurchase(true);
    setPurchaseError(null);
    const result = await purchaseCreditsAction({
      amount: creditAmount,
      provider: "paystack",
    });
    setPendingPurchase(false);
    if (!result.ok) {
      setPurchaseError(result.message ?? "Failed to initiate purchase.");
      return;
    }
    if (result.redirectTo) {
      window.location.href = result.redirectTo;
    }
  }

  return (
    <div className="space-y-6">
      {/* Credit balance */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Featured Credits</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Balance: <span className="font-bold text-foreground">{credits.balance}</span> credits
              </p>
            </div>
            <Button size="sm" onClick={() => setCreditPurchaseOpen(true)}>
              <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
              Buy credits
            </Button>
          </div>
        </CardHeader>
        {credits.transactions.length > 0 ? (
          <CardContent>
            <p className="text-xs font-medium text-muted-foreground mb-2">Recent transactions</p>
            <ul className="space-y-1">
              {credits.transactions.slice(0, 5).map((txn) => (
                <li key={txn.id} className="flex items-center justify-between text-xs">
                  <span className="capitalize">{txn.transaction_type} · {txn.source}</span>
                  <span className={txn.amount > 0 ? "text-success font-medium" : "text-muted-foreground"}>
                    {txn.amount > 0 ? "+" : ""}{txn.amount}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        ) : null}
      </Card>

      {/* Promotions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Your promotions</h3>
          {canPromote ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/properties">Browse properties to promote</Link>
            </Button>
          ) : null}
        </div>

        {promotions.length === 0 ? (
          <EmptyState
            title="No promotions yet"
            description="Promote your properties to increase their visibility in search results and on the homepage."
          />
        ) : (
          <div className="grid gap-4">
            {promotions.map((promo) => {
              const Icon = STATUS_ICON[promo.status] ?? Clock;
              return (
                <Card key={promo.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0">
                        <Link
                          href={`/properties/${promo.property_id}`}
                          className="font-medium text-sm hover:underline truncate block"
                        >
                          {promo.property_title}
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {PLACEMENT_LABELS[promo.placement] ?? promo.placement}
                          </span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(promo.starts_at).toLocaleDateString("en-NG")} → {new Date(promo.ends_at).toLocaleDateString("en-NG")}
                          </span>
                        </div>
                        {promo.status === "active" ? (
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{promo.impressions} impressions</span>
                            <span>{promo.clicks} clicks</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[promo.status] ?? STATUS_TONE.draft}`}>
                        {promo.status.replace(/_/g, " ")}
                      </span>
                      {["scheduled", "active"].includes(promo.status) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setCancelTarget(promo.id)}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancel confirmation dialog */}
      <Dialog open={Boolean(cancelTarget)} onOpenChange={() => setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel promotion?</DialogTitle>
            <DialogDescription>
              {cancelTarget && promotions.find((p) => p.id === cancelTarget)?.status === "scheduled"
                ? "Credits used for this promotion will be refunded to your balance."
                : "The promotion will end immediately. Credits will not be refunded for active promotions."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Keep promotion
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={pendingCancel}>
              {pendingCancel ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
                  Cancelling...
                </>
              ) : (
                "Cancel promotion"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit purchase dialog */}
      <Dialog open={creditPurchaseOpen} onOpenChange={setCreditPurchaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Purchase featured credits</DialogTitle>
            <DialogDescription>
              {formatNaira(CREDIT_PURCHASE_PRICE_NAIRA)} per credit. Credits don&apos;t expire.
              You&apos;ll be redirected to Paystack to complete payment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label htmlFor="credit-amount" className="text-sm font-medium">Amount:</label>
              <input
                id="credit-amount"
                type="number"
                min={1}
                max={50}
                value={creditAmount}
                onChange={(e) => setCreditAmount(Number(e.target.value))}
                className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
              <span className="text-sm text-muted-foreground">
                = {formatNaira(creditAmount * CREDIT_PURCHASE_PRICE_NAIRA)}
              </span>
            </div>
            {purchaseError ? (
              <p className="text-sm text-destructive" role="alert">{purchaseError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditPurchaseOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePurchaseCredits} disabled={pendingPurchase || creditAmount < 1}>
              {pendingPurchase ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
                  Processing...
                </>
              ) : (
                `Buy ${creditAmount} credits`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
