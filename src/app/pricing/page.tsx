import { Check, Star } from "lucide-react";
import Link from "next/link";
import { PublicLayout } from "@/components/layout/public-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { plansForRole, formatNaira, isVariablePricePlan } from "@/lib/subscriptions/plans";
import type { UserRole } from "@/types";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Choose the right plan for your property marketplace needs on Shelty.",
};

const ROLE_LABELS: Record<UserRole, string> = {
  landlord: "Landlord / Property Owner",
  agent: "Real Estate Agent",
  company: "Real Estate Company",
};

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  landlord: "List and manage your properties with professional tools.",
  agent: "Discover properties, apply to represent, and build your reputation.",
  company: "Manage multiple properties, agents, and staff with enterprise tools.",
};

export default function PricingPage() {
  const roles: UserRole[] = ["landlord", "agent", "company"];

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-4xl font-bold tracking-tight">Simple, transparent pricing</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everyone starts Free. Upgrade for more capacity, better tools, and
            better visibility. Verification is separate from subscription —
            paying doesn&apos;t automatically grant a verification badge.
          </p>
          <div className="inline-flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-1.5 text-sm">
            <span className="font-medium">All prices in Naira (₦)</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">Monthly billing</span>
          </div>
        </div>

        {/* Plans by role */}
        {roles.map((role) => (
          <div key={role} className="mb-12">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">{ROLE_LABELS[role]}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {ROLE_DESCRIPTIONS[role]}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {plansForRole(role).map((plan) => {
                const isVariable = isVariablePricePlan(plan.role, plan.tier);
                const isPremium = plan.tier === "premium";
                const isFree = plan.tier === "free";

                return (
                  <Card
                    key={plan.tier}
                    className={
                      isPremium
                        ? "border-primary ring-2 ring-primary/30 relative"
                        : "relative"
                    }
                  >
                    {isPremium ? (
                      <Badge
                        className="absolute -top-3 left-1/2 -translate-x-1/2"
                      >
                        <Star className="h-3 w-3 mr-1" aria-hidden="true" />
                        Most Popular
                      </Badge>
                    ) : null}
                    <CardHeader>
                      <CardTitle className="text-xl capitalize">{plan.tier}</CardTitle>
                      <p className="text-sm text-muted-foreground">{plan.tagline}</p>
                      <p className="text-3xl font-bold mt-2">
                        {formatNaira(plan.priceNaira, isVariable)}
                        {!isFree ? (
                          <span className="text-sm font-normal text-muted-foreground">/month</span>
                        ) : null}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 text-sm">
                        {plan.highlights.map((highlight, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <Check
                              className="mt-0.5 h-4 w-4 shrink-0 text-success"
                              aria-hidden="true"
                            />
                            <span>{highlight}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        asChild
                        className="w-full mt-6"
                        variant={isPremium ? "default" : "outline"}
                      >
                        <Link href={isFree ? "/signup" : "/dashboard/subscription"}>
                          {isFree ? "Get started" : `Upgrade to ${plan.tier}`}
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

        {/* Verification note */}
        <div className="rounded-lg border border-info/30 bg-info/5 p-4 text-sm text-info-foreground">
          <p className="font-medium">Verification ≠ Subscription</p>
          <p className="mt-1">
            Paying for a Pro or Premium plan grants <strong>eligibility</strong> to
            apply for verification (Bronze / Blue badges). The actual badge is granted
            only after admin review of your application and supporting documents.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
