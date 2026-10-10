import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentProfile } from "@/lib/auth/server";
import { getOwnProfileContext } from "@/lib/profiles/public-profile";
import { ProfileEditForm } from "@/components/profiles/profile-edit-form";

export default async function DashboardProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/dashboard/profile");
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

  const ctx = await getOwnProfileContext();
  if (!ctx) {
    redirect("/login?next=/dashboard/profile");
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Update your profile information. Verification status, role, and
            subscription tier are managed separately.
          </p>
        </div>

        <ProfileEditForm
          profile={ctx.profile}
          landlord={ctx.landlord}
          agent={ctx.agent}
          company={ctx.company}
        />
      </div>
    </DashboardLayout>
  );
}
