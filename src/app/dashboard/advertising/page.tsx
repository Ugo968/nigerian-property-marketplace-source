import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCurrentProfile } from "@/lib/auth/server";
import { getMyBusinesses, getMyCampaigns } from "@/lib/advertising/fetchers";
import { AdvertisingDashboard } from "@/components/advertising/advertising-dashboard";
import { createServerClient } from "@/lib/db/supabase";

export default async function DashboardAdvertisingPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/dashboard/advertising");
  }
  if (profile.account_status === "banned") {
    redirect("/account-suspended?reason=banned");
  }
  if (!profile.onboarding_completed) {
    redirect(`/onboarding/${profile.role}`);
  }

  const [businesses, campaigns] = await Promise.all([
    getMyBusinesses(),
    getMyCampaigns(),
  ]);

  // Fetch categories + placements for the form dropdowns
  const supabase = await createServerClient();
  let categories: Array<{ id: string; slug: string; label: string }> = [];
  let placements: Array<{ id: string; slug: string; label: string }> = [];

  if (supabase) {
    const [{ data: catRows }, { data: placeRows }] = await Promise.all([
      supabase.from("advertiser_categories").select("id, slug, label").eq("is_active", true).order("sort_order"),
      supabase.from("advertising_placements").select("id, slug, label").eq("is_active", true).order("sort_order"),
    ]);
    categories = (catRows as Array<{ id: string; slug: string; label: string }>) ?? [];
    placements = (placeRows as Array<{ id: string; slug: string; label: string }>) ?? [];
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Advertising</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Promote your housing-related business to property seekers across Nigeria.
          </p>
        </div>

        <div className="rounded-md border border-info/30 bg-info/5 p-3 text-xs text-info-foreground">
          <p>
            Advertising is separate from your marketplace role. Payment does not
            automatically activate campaigns — all campaigns are reviewed before
            going live. Minimum campaign budget: ₦5,000.
          </p>
        </div>

        <AdvertisingDashboard
          businesses={businesses}
          campaigns={campaigns}
          categories={categories}
          placements={placements}
        />
      </div>
    </DashboardLayout>
  );
}
