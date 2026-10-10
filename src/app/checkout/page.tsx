import { redirect } from "next/navigation";
import { PublicLayout } from "@/components/layout/public-layout";
import { CheckoutPage } from "@/components/payments/checkout-page";
import { getCurrentProfile } from "@/lib/auth/server";
import { getPlan, plansForRole, isVariablePricePlan } from "@/lib/subscriptions/plans";
import { getAvailableProviders } from "@/lib/payments/payment-service";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { privateRouteMetadata } from "@/lib/seo/private-metadata";


export const metadata = privateRouteMetadata;

export default async function CheckoutRoute({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string }>;
}) {
  const { tier } = await searchParams;
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login?next=/checkout");
  }

  const requestedTier = (tier === "pro" || tier === "premium") ? tier : null;

  if (!requestedTier) {
    return (
      <PublicLayout>
        <EmptyState
          title="Invalid plan"
          description="Please select a valid plan from the pricing page."
          action={
            <Button asChild>
              <Link href="/pricing">View pricing</Link>
            </Button>
          }
        />
      </PublicLayout>
    );
  }

  const plan = getPlan(profile.role, requestedTier);
  if (!plan || !plan.sellable) {
    return (
      <PublicLayout>
        <EmptyState title="Invalid plan" description="This plan is not available for your role." />
      </PublicLayout>
    );
  }

  const availableProviders = getAvailableProviders();

  return (
    <PublicLayout>
      <CheckoutPage
        role={profile.role}
        currentTier={profile.subscription_tier}
        requestedTier={requestedTier}
        planPrice={plan.priceNaira}
        isVariablePrice={isVariablePricePlan(profile.role, requestedTier)}
        planTagline={plan.tagline}
        planHighlights={plan.highlights}
        availableProviders={availableProviders}
      />
    </PublicLayout>
  );
}
