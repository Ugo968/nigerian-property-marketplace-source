import { redirect } from "next/navigation";
import { getOnboardingContext } from "@/lib/profiles/onboarding-context";
import { CompanyOnboardingForm } from "@/components/onboarding/company-onboarding-form";

export default async function CompanyOnboardingPage() {
  const ctx = await getOnboardingContext("company");
  if (!ctx) {
    redirect("/onboarding");
  }
  if (ctx.profile.onboarding_completed) {
    redirect("/dashboard");
  }
  return (
    <CompanyOnboardingForm
      profile={ctx.profile}
      company={ctx.roleSpecific as never}
    />
  );
}
