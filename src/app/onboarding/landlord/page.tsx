import { redirect } from "next/navigation";
import { getOnboardingContext } from "@/lib/profiles/onboarding-context";
import { LandlordOnboardingForm } from "@/components/onboarding/landlord-onboarding-form";

/**
 * /onboarding/landlord — only accessible to authenticated users whose
 * profile.role === 'landlord'. Anyone else is redirected.
 */
export default async function LandlordOnboardingPage() {
  const ctx = await getOnboardingContext("landlord");

  if (!ctx) {
    // Not authenticated, wrong role, or banned. The middleware has
    // already redirected unauthenticated users; if we end up here it's
    // a role mismatch — send them to the right onboarding or dashboard.
    redirect("/onboarding");
  }

  if (ctx.profile.onboarding_completed) {
    redirect("/dashboard");
  }

  return (
    <LandlordOnboardingForm
      profile={ctx.profile}
      landlord={
        ctx.roleSpecific as never /* landlord row or null */
      }
    />
  );
}
