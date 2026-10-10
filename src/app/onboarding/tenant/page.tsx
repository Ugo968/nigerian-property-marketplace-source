import { redirect } from "next/navigation";
import { getOnboardingContext } from "@/lib/profiles/onboarding-context";
import { TenantOnboardingForm } from "@/components/onboarding/tenant-onboarding-form";

/**
 * /onboarding/tenant — only accessible to authenticated users whose
 * profile.role === 'tenant'. Anyone else is redirected.
 */
export default async function TenantOnboardingPage() {
  const ctx = await getOnboardingContext("tenant");

  if (!ctx) {
    redirect("/onboarding");
  }

  if (ctx.profile.onboarding_completed) {
    redirect("/dashboard");
  }

  return <TenantOnboardingForm profile={ctx.profile} />;
}
