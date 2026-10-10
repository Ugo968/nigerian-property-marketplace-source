import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCurrentProfile } from "@/lib/auth/server";
import { NotificationsPageClient } from "@/components/notifications/notifications-page-client";

export const metadata = {
  title: "Notifications",
  description: "Your activity feed and notification preferences.",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/dashboard/notifications");
  }
  if (profile.account_status === "banned") {
    redirect("/account-suspended?reason=banned");
  }
  if (profile.account_status === "suspended") {
    redirect("/account-suspended?reason=suspended");
  }
  if (profile.deleted_at) {
    redirect("/account-suspended?reason=deactivated");
  }
  if (!profile.onboarding_completed) {
    redirect(`/onboarding/${profile.role}`);
  }

  const { tab } = await searchParams;
  const initialTab = tab === "preferences" ? "preferences" : "all";

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <NotificationsPageClient initialTab={initialTab} />
      </div>
    </DashboardLayout>
  );
}
