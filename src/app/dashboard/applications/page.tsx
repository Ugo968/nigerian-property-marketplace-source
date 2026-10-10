import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCurrentProfile } from "@/lib/auth/server";
import { capabilitiesFor } from "@/lib/capabilities";
import { createServerClient } from "@/lib/db/supabase";
import {
  getAgentApplications,
  getOwnerApplications,
} from "@/lib/applications/fetchers";
import { ApplicationsDashboard } from "@/components/applications/applications-dashboard";

/**
 * /dashboard/applications — role-aware application management.
 *
 * Per spec Sections 12, 15, 16:
 *   * Agents: see applications they SUBMITTED
 *   * Landlords/Companies: see applications they RECEIVED
 *   * Role determined from server-side profile (never client)
 */
export default async function DashboardApplicationsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/dashboard/applications");
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

  // Fetch applications based on role
  const applications =
    profile.role === "agent"
      ? await getAgentApplications()
      : await getOwnerApplications();

  // For agents, compute monthly application count for the limit display
  let monthlyLimit: number | null = null;
  let monthlyCount = 0;

  if (profile.role === "agent") {
    const caps = capabilitiesFor(profile.role, profile.subscription_tier);
    monthlyLimit = caps.maxApplicationsPerMonth;

    const supabase = await createServerClient();
    if (supabase && monthlyLimit !== null) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("property_applications")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", profile.id)
        .gte("created_at", monthStart.toISOString());
      monthlyCount = count ?? 0;
    }
  }

  const title =
    profile.role === "agent"
      ? "My Applications"
      : "Applications Received";

  const description =
    profile.role === "agent"
      ? "Track the status of properties you've applied to represent."
      : "Review and manage agents who have applied to represent your properties.";

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>

        <ApplicationsDashboard
          applications={applications}
          role={profile.role}
          monthlyLimit={monthlyLimit}
          monthlyCount={monthlyCount}
        />
      </div>
    </DashboardLayout>
  );
}
