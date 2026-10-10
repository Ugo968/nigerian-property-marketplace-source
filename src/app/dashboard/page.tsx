import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentProfile } from "@/lib/auth/server";
import { privateRouteMetadata } from "@/lib/seo/private-metadata";

export const metadata = privateRouteMetadata;

/**
 * Dashboard. Only authenticated users with completed onboarding AND
 * active account_status can land here. The middleware already redirects
 * unauthenticated users; this Server Component enforces the additional
 * profile-state checks.
 */
export default async function DashboardHomePage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    // Not signed in (or Supabase not configured) — middleware handles
    // the unauthenticated case. If we're here without a profile row,
    // send them to login so the auth flow can create one.
    redirect("/login?next=/dashboard");
  }

  if (profile.account_status === "banned") {
    redirect("/account-suspended?reason=banned");
  }

  if (profile.account_status === "suspended") {
    redirect("/account-suspended?reason=suspended");
  }

  if (profile.account_status === "deactivated" || profile.deleted_at) {
    redirect("/account-suspended?reason=deactivated");
  }

  if (!profile.onboarding_completed) {
    redirect(`/onboarding/${profile.role}`);
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <PageShell
          title={`Welcome, ${profile.full_name.split(" ")[0]}`}
          description="The dashboard overview (analytics, recent activity, quick actions) will be implemented as features come online."
          backHref="/"
          backLabel="Back to site"
        />
      </div>
    </DashboardLayout>
  );
}
