"use client";

import * as React from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EligibilityResult } from "@/lib/verification/eligibility";

/**
 * Verification eligibility checklist — shows the requirements for a
 * given tier and whether the user currently meets each one.
 *
 * Per spec Section 9: "The user must understand what is required
 * before submitting."
 */
export interface VerificationEligibilityCardProps {
  tier: "bronze" | "blue";
  eligibility: EligibilityResult;
}

export function VerificationEligibilityCard({
  tier,
  eligibility,
}: VerificationEligibilityCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Requirements for {tier === "bronze" ? "Bronze" : "Blue"} verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {eligibility.blockingReasons.length > 0 ? (
          <ul className="space-y-2">
            {eligibility.checklist.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                {item.complete ? (
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-success"
                    aria-hidden="true"
                  />
                ) : (
                  <X
                    className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <p
                    className={cn(
                      "font-medium",
                      item.complete ? "text-foreground" : "text-foreground",
                    )}
                  >
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-success">
            <Check className="inline h-4 w-4 mr-1" aria-hidden="true" />
            You meet all the requirements for {tier} verification.
          </p>
        )}

        {eligibility.canApply ? (
          <Button asChild>
            <Link href={`/dashboard/verification/apply/${tier}`}>
              Start {tier} application
            </Link>
          </Button>
        ) : null}

        {eligibility.alreadyHasTier ? (
          <p className="text-sm text-muted-foreground">
            You already hold {tier} verification (or higher).
          </p>
        ) : null}

        {eligibility.hasPendingApplication ? (
          <p className="text-sm text-muted-foreground">
            You already have a pending {tier} application — we&apos;ll
            review it before you can submit a new one.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
