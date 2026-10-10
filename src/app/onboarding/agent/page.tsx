import { redirect } from "next/navigation";
import { getOnboardingContext } from "@/lib/profiles/onboarding-context";
import { AgentOnboardingForm } from "@/components/onboarding/agent-onboarding-form";

export default async function AgentOnboardingPage() {
  const ctx = await getOnboardingContext("agent");
  if (!ctx) {
    redirect("/onboarding");
  }
  if (ctx.profile.onboarding_completed) {
    redirect("/dashboard");
  }
  return (
    <AgentOnboardingForm
      profile={ctx.profile}
      agent={ctx.roleSpecific as never}
    />
  );
}
