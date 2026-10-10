import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/server";
import { getOwnProfileContext } from "@/lib/profiles/public-profile";
import { createServerClient } from "@/lib/db/supabase";
import { canApplyForVerification } from "@/lib/verification/eligibility";
import { VerificationApplyForm } from "@/components/verification/verification-apply-form";
import type { VerificationTier, VerificationApplicationRow } from "@/types";

export default async function VerificationApplyPage({
  params,
}: {
  params: Promise<{ tier: string }>;
}) {
  const { tier: tierParam } = await params;
  const tier = (tierParam === "blue" ? "blue" : "bronze") as VerificationTier;

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
      .eq("applicant_id", profile.id);
    existingApplications = (data as VerificationApplicationRow[]) ?? [];
  }

  const eligibility = canApplyForVerification({
    role: profile.role,
    tier,
    verificationState: profile.verification_state,
    subscriptionTier: profile.subscription_tier,
    emailVerified: profile.email_verified,
    phoneVerified: profile.phone_verified,
    accountCreatedAt: profile.created_at,
    profile: ctx.profile,
    roleSpecific: ctx.landlord ?? ctx.agent ?? ctx.company,
    existingApplications,
  });

  return <VerificationApplyForm tier={tier} eligibility={eligibility} />;
}
