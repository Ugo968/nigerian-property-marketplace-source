"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Crown, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { changePlanAction, cancelPlanAction } from "@/lib/subscriptions/actions";
import { formatNaira, plansForRole, isVariablePricePlan } from "@/lib/subscriptions/plans";
import type { UserRole, SubscriptionTier } from "@/types";
import type { EffectivePlan, UsageInfo } from "@/lib/subscriptions/entitlements";

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free",
  pro: "Pro",
  premium: "Premium",
};

const USAGE_LABELS: Record<string, string> = {
  monthly_listings: "Property listings this month",
  monthly_applications: "Property applications this month",
  monthly_new_conversations: "New conversations this month",
  saved_properties: "Saved properties",
  saved_searches: "Saved searches",
};

export function SubscriptionDashboard({
  effectivePlan,
  usage,
}: {
  effectivePlan: EffectivePlan;
  usage: UsageInfo[];
}) {
  const router = useRouter();
  const [pendingTier, setPendingTier] = React.useState<SubscriptionTier | null>(null);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleUpgrade(tier: SubscriptionTier) {
    setPendingTier(tier);
    setError(null);
    const result = await changePlanAction({ newTier: tier });
    setPendingTier(null);
    if (!result.ok) {
      setError(result.message ?? "Failed to change plan.");
      return;
    }
    router.refresh();
  }

  async function handleCancel() {
    setPendingTier("free");
    setError(null);
    const result = await cancelPlanAction();
    setPendingTier(null);
    setCancelOpen(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to cancel.");
      return;
    }
    router.refresh();
  }

  const plans = plansForRole(effectivePlan.role);
  const currentTier = effectivePlan.tier;

  return (
    <div className="space-y-6">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Current plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">
                {TIER_LABELS[currentTier]} Plan
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {effectivePlan.role === "landlord"
                  ? "Landlord / Property Owner"
                  : effectivePlan.role === "agent"
                    ? "Real Estate Agent"
                    : "Real Estate Company"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">
                {formatNaira(effectivePlan.priceNaira, effectivePlan.isVariablePrice)}
              </p>
              {effectivePlan.priceNaira > 0 ? (
                <p className="text-xs text-muted-foreground">/month</p>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{effectivePlan.tagline}</p>
          {currentTier !== "free" ? (
            <div className="mt-4 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelOpen(true)}
                disabled={pendingTier !== null}
              >
                Cancel plan
              </Button>
              <p className="text-xs text-muted-foreground">
                Cancelling downgrades you to Free. Your existing content is preserved.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Usage */}
      {usage.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Current usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {usage.map((item) => (
              <UsageBar key={item.metric} item={item} />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Available plans */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Available plans</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.tier === currentTier;
            const isVariable = isVariablePricePlan(plan.role, plan.tier);
            const isUpgrade =
              plan.tier === "pro" && currentTier === "free" ||
              plan.tier === "premium" && currentTier !== "premium";

            return (
              <Card
                key={plan.tier}
                className={
                  isCurrent
                    ? "border-primary ring-2 ring-primary/30"
                    : plan.tier === "premium"
                      ? "border-primary/50"
                      : ""
                }
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg capitalize">{plan.tier}</CardTitle>
                    {isCurrent ? (
                      <Badge>Current</Badge>
                    ) : null}
                  </div>
                  <p className="text-2xl font-bold">
                    {formatNaira(plan.priceNaira, isVariable)}
                    {plan.priceNaira > 0 ? (
                      <span className="text-sm font-normal text-muted-foreground">/mo</span>
                    ) : null}
                  </p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 text-xs">
                    {plan.highlights.slice(0, 5).map((h, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden="true" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <Button variant="outline" size="sm" className="w-full mt-4" disabled>
                      Current plan
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full mt-4"
                      variant={plan.tier === "premium" ? "default" : "outline"}
                      onClick={() => handleUpgrade(plan.tier)}
                      disabled={pendingTier !== null}
                    >
                      {pendingTier === plan.tier ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
                          Processing...
                        </>
                      ) : isUpgrade ? (
                        `Upgrade to ${plan.tier}`
                      ) : (
                        `Switch to ${plan.tier}`
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Cancel confirmation dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {TIER_LABELS[currentTier]} plan?</DialogTitle>
            <DialogDescription>
              You&apos;ll be downgraded to the Free plan. Your existing properties,
              saved items, and conversations are preserved — but new actions beyond
              Free limits will be blocked. You can upgrade again anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep {TIER_LABELS[currentTier]}
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={pendingTier !== null}>
              {pendingTier ? "Cancelling..." : "Cancel plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UsageBar({ item }: { item: UsageInfo }) {
  const label = USAGE_LABELS[item.metric] ?? item.metric;
  const isUnlimited = item.limit === null;
  const pct = isUnlimited ? 0 : item.limit > 0 ? Math.min(100, (item.used / item.limit) * 100) : 0;
  const isAtLimit = !isUnlimited && item.remaining === 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-medium", isAtLimit && "text-warning")}>
          {item.used}
          {isUnlimited ? " / unlimited" : ` / ${item.limit}`}
        </span>
      </div>
      {!isUnlimited ? (
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isAtLimit ? "bg-warning" : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      {isAtLimit ? (
        <p className="text-xs text-warning">
          Limit reached. Upgrade for more.
        </p>
      ) : null}
    </div>
  );
}

// cn helper (avoid importing from lib/utils for client component simplicity)
function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
