import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCurrentProfile } from "@/lib/auth/server";
import { capabilitiesFor } from "@/lib/capabilities";
import { getSavedSearches } from "@/lib/search/actions";
import { SavedSearchesClient } from "@/components/search/saved-searches-client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

/**
 * /dashboard/alerts — saved searches management.
 *
 * Per spec Section 24: view / rename / edit / delete / run saved searches.
 * Email/push notification delivery is a future phase (P13).
 */
export default async function SavedSearchesPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/dashboard/alerts");
  }
  if (profile.account_status === "banned") {
    redirect("/account-suspended?reason=banned");
  }
  if (profile.account_status === "suspended") {
    redirect("/account-suspended?reason=suspended");
  }
  if (!profile.onboarding_completed) {
    redirect(`/onboarding/${profile.role}`);
  }

  const caps = capabilitiesFor(profile.role, profile.subscription_tier);
  const canSave = caps.maxSavedSearches !== 0;

  const savedSearches = await getSavedSearches();

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Saved searches</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {savedSearches.length === 0
                ? "No saved searches yet."
                : `${savedSearches.length} saved ${savedSearches.length === 1 ? "search" : "searches"}`}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/properties">Browse properties</Link>
          </Button>
        </div>

        <div className="rounded-md border border-info/30 bg-info/5 p-3 text-xs text-info-foreground">
          <p>
            <strong>Heads up:</strong> Email + push alerts are coming in a later
            phase. For now, saved searches are stored so you can quickly
            re-run them.
          </p>
        </div>

        {!canSave ? (
          <EmptyState
            title="Saved searches unavailable"
            description={`Your ${profile.subscription_tier} plan doesn't include saved searches.`}
          />
        ) : savedSearches.length === 0 ? (
          <EmptyState
            title="No saved searches"
            description="Save a search from the properties page to re-run it later."
            action={
              <Button asChild>
                <Link href="/properties">Browse properties</Link>
              </Button>
            }
          />
        ) : (
          <SavedSearchesClient searches={savedSearches} />
        )}
      </div>
    </DashboardLayout>
  );
}
