import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/server";
import { getOwnProfileContext } from "@/lib/profiles/public-profile";
import { createServerClient } from "@/lib/db/supabase";
import { capabilitiesFor } from "@/lib/capabilities";
import { canApplyForVerification } from "@/lib/verification/eligibility";
import { VerificationStatusCard } from "@/components/profiles/verification-status-card";
import { VerificationEligibilityCard } from "@/components/profiles/verification-eligibility-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VerificationTier } from "@/types";
import type { VerificationApplicationRow } from "@/types";

/**
 * /dashboard/verification — user-facing verification hub.
 *
 * Shows:
 *   - Current verification status + badge
 *   - Eligibility checklist for available tiers
 *   - History of past applications
 *
 * Per spec Section 7 (CRITICAL BUSINESS RULE): payment does NOT equal
 * verification. The page explicitly states "applying does not guarantee
 * approval, and paying for a subscription does not automatically grant
 * verification".
 */
export default async function DashboardVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/dashboard/verification");
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
    redirect("/login?next=/dashboard/verification");
  }

  // Fetch existing applications
  const supabase = await createServerClient();
  let existingApplications: VerificationApplicationRow[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("verification_applications")
      .select("*")
      .eq("applicant_id", profile.id)
      .order("created_at", { ascending: false });
    existingApplications = (data as VerificationApplicationRow[]) ?? [];
  }

  // Compute eligibility for both tiers
  const eligibilityBronze = canApplyForVerification({
    role: profile.role,
    tier: "bronze",
    verificationState: profile.verification_state,
    subscriptionTier: profile.subscription_tier,
    emailVerified: profile.email_verified,
    phoneVerified: profile.phone_verified,
    accountCreatedAt: profile.created_at,
    profile: ctx.profile,
    roleSpecific: ctx.landlord ?? ctx.agent ?? ctx.company,
    existingApplications,
  });

  const eligibilityBlue = canApplyForVerification({
    role: profile.role,
    tier: "blue",
    verificationState: profile.verification_state,
    subscriptionTier: profile.subscription_tier,
    emailVerified: profile.email_verified,
    phoneVerified: profile.phone_verified,
    accountCreatedAt: profile.created_at,
    profile: ctx.profile,
    roleSpecific: ctx.landlord ?? ctx.agent ?? ctx.company,
    existingApplications,
  });

  // Find any pending application
  const pendingApp = existingApplications.find(
    (a) => a.status === "submitted" || a.status === "in_review",
  );
  const pendingTier = pendingApp?.tier as VerificationTier | undefined;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Verification</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build trust with potential clients by verifying your account.
          </p>
        </div>

        {(await searchParams).submitted === "1" ? (
          <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
            Your application has been submitted. We&apos;ll review it and
            notify you when we&apos;ve made a decision.
          </div>
        ) : null}

        <VerificationStatusCard
          verificationState={profile.verification_state}
          role={profile.role}
          subscriptionTier={profile.subscription_tier}
          pendingApplicationTier={pendingTier ?? null}
          eligibility={eligibilityBronze.canApply || eligibilityBlue.canApply ? eligibilityBronze : eligibilityBronze}
        />

        {/* Bronze eligibility */}
        {profile.verification_state !== "bronze" &&
        profile.verification_state !== "blue" ? (
          <VerificationEligibilityCard tier="bronze" eligibility={eligibilityBronze} />
        ) : null}

        {/* Blue eligibility — only show if eligible for blue */}
        {capabilitiesFor(profile.role, profile.subscription_tier).eligibleForBlue &&
        profile.verification_state !== "blue" ? (
          <VerificationEligibilityCard tier="blue" eligibility={eligibilityBlue} />
        ) : null}

        {/* Application history */}
        {existingApplications.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Application history</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {existingApplications.map((app) => (
                  <li
                    key={app.id}
                    className="rounded-md border bg-muted/30 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium capitalize">
                        {app.tier} verification
                      </p>
                      <span className="text-xs text-muted-foreground capitalize">
                        {app.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Submitted{" "}
                      {app.submitted_at
                        ? new Date(app.submitted_at).toLocaleDateString("en-NG")
                        : "—"}
                      {app.reviewed_at
                        ? ` · reviewed ${new Date(app.reviewed_at).toLocaleDateString("en-NG")}`
                        : ""}
                    </p>
                    {app.rejection_reason ? (
                      <p className="text-xs text-destructive mt-1">
                        Reason: {app.rejection_reason}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {/* Critical reminder */}
        <div className="rounded-md border border-info/30 bg-info/5 p-3 text-xs text-info-foreground">
          <p>
            <strong>Important:</strong> Paying for a subscription does NOT
            automatically grant verification. Verification requires admin
            review of your application and supporting documents.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
