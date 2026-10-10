import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCurrentProfile } from "@/lib/auth/server";
import { getEffectivePlan, getUsage } from "@/lib/subscriptions/entitlements";
import { SubscriptionDashboard } from "@/components/subscriptions/subscription-dashboard";

/**
 * /dashboard/subscription — shows current plan, usage, and upgrade options.
 *
 * Per spec Sections 33, 34, 35:
 *   * Current plan + status + billing period
 *   * Current limits + usage + remaining
 *   * Upgrade/downgrade/cancel options
 *   * Limit-reached UX with clear explanation
 */
export default async function DashboardSubscriptionPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/dashboard/subscription");
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

  const [effectivePlan, usage] = await Promise.all([
    getEffectivePlan(),
    getUsage(),
  ]);

  if (!effectivePlan) {
    redirect("/login?next=/dashboard/subscription");
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subscription</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your plan, view usage, and upgrade for more capabilities.
          </p>
        </div>

        <SubscriptionDashboard
          effectivePlan={effectivePlan}
          usage={usage}
        />

        {/* Verification reminder (spec Section 22) */}
        <div className="rounded-md border border-info/30 bg-info/5 p-3 text-sm text-info-foreground">
          <p>
            <strong>Verification ≠ Subscription.</strong> Upgrading your plan
            grants eligibility to apply for verification (Bronze / Blue badges).
            The actual badge is granted only after admin review. Paying does
            not automatically verify your account.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
