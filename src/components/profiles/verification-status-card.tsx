"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VerificationBadge } from "@/components/verification-badge";
import type { VerificationState, UserRole, VerificationTier, SubscriptionTier } from "@/types";
import type { EligibilityResult } from "@/lib/verification/eligibility";

/**
 * Verification status card.
 *
 * Shows the user's current verification_state with appropriate
 * messaging. When pending or unverified, offers a CTA to start an
 * application if eligible.
 *
 * Per spec Section 7: payment does NOT equal verification. The card
 * explicitly states "applying does not guarantee approval".
 */
export interface VerificationStatusCardProps {
  verificationState: VerificationState;
  role: UserRole;
  subscriptionTier: SubscriptionTier;
  pendingApplicationTier?: VerificationTier | null;
  eligibility: EligibilityResult;
}

export function VerificationStatusCard({
  verificationState,
  role,
  subscriptionTier,
  pendingApplicationTier,
  eligibility,
}: VerificationStatusCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          Verification status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <VerificationBadge state={verificationState} />
          {pendingApplicationTier ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              Application under review
            </span>
          ) : null}
        </div>

        {verificationState === "unverified" ? (
          <p className="text-sm text-muted-foreground">
            You are not yet verified. Verifying your account helps build trust
            with potential clients and partners.
          </p>
        ) : null}

        {verificationState === "pending" ? (
          <p className="text-sm text-muted-foreground">
            Your application is being reviewed. You&apos;ll receive a
            notification when we&apos;ve made a decision.
          </p>
        ) : null}

        {verificationState === "bronze" || verificationState === "blue" ? (
          <p className="text-sm text-muted-foreground">
            Your verification badge is visible on your public profile.
          </p>
        ) : null}

        {verificationState === "rejected" ? (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
            <p className="font-medium text-warning flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Verification was not approved
            </p>
            <p className="text-muted-foreground mt-1">
              You can re-apply after addressing the feedback from our team.
            </p>
          </div>
        ) : null}

        {verificationState === "suspended" || verificationState === "revoked" ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Your verification is {verificationState}. Contact support if you
            believe this is a mistake.
          </div>
        ) : null}

        {/* Eligibility call-to-action */}
        {shouldShowApplyCta(verificationState, eligibility) ? (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <p className="text-sm font-medium text-foreground">
              Available verification levels
            </p>
            <EligibilityActions
              role={role}
              subscriptionTier={subscriptionTier}
              eligibility={eligibility}
            />
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Verification is reviewed by our team. Applying does not guarantee
          approval, and paying for a subscription does not automatically
          grant verification.
        </p>
      </CardContent>
    </Card>
  );
}

function shouldShowApplyCta(
  state: VerificationState,
  eligibility: EligibilityResult,
): boolean {
  if (state === "suspended" || state === "revoked") return false;
  if (state === "blue") return false; // already at the highest tier
  if (eligibility.hasPendingApplication) return false;
  return true;
}

function EligibilityActions({
  role,
  subscriptionTier,
  eligibility,
}: {
  role: UserRole;
  subscriptionTier: SubscriptionTier;
  eligibility: EligibilityResult;
}) {
  const caps = requireCapabilities(role, subscriptionTier);
  const availableTiers: VerificationTier[] = [];
  if (caps.eligibleForBronze && !eligibility.alreadyHasTier) {
    availableTiers.push("bronze");
  }
  if (caps.eligibleForBlue && !eligibility.alreadyHasTier) {
    availableTiers.push("blue");
  }

  if (availableTiers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Upgrade your subscription to apply for verification.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {availableTiers.map((tier) => (
        <Button key={tier} asChild size="sm" variant="outline">
          <Link href={`/dashboard/verification/apply/${tier}`}>
            Apply for {tier === "bronze" ? "Bronze" : "Blue"}
            <ArrowRight className="ml-2 h-3 w-3" aria-hidden="true" />
          </Link>
        </Button>
      ))}
    </div>
  );
}

// Local import to avoid circular dependency at module load
import { capabilitiesFor } from "@/lib/capabilities";
function requireCapabilities(role: UserRole, tier: SubscriptionTier) {
  return capabilitiesFor(role, tier);
}
