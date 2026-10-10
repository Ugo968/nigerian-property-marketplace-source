import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCurrentProfile } from "@/lib/auth/server";
import { getUserPromotions, getUserCredits } from "@/lib/featured/fetchers";
import { PromotionsDashboard } from "@/components/featured/promotions-dashboard";

export default async function DashboardPromotionsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/dashboard/promotions");
  }
  if (profile.account_status === "banned") {
    redirect("/account-suspended?reason=banned");
  }
  if (!profile.onboarding_completed) {
    redirect(`/onboarding/${profile.role}`);
  }

  const [promotions, credits] = await Promise.all([
    getUserPromotions(),
    getUserCredits(),
  ]);

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Promotions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Boost your property visibility with featured promotions.
          </p>
        </div>

        <PromotionsDashboard
          promotions={promotions}
          credits={credits}
          userRole={profile.role}
        />
      </div>
    </DashboardLayout>
  );
}
