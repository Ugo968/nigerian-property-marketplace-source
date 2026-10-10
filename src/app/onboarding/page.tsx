import { routeToOnboardingOrDashboard } from "@/lib/auth/onboarding-actions";
import { privateRouteMetadata } from "@/lib/seo/private-metadata";


export const metadata = privateRouteMetadata;

/**
 * /onboarding — entry point that:
 *   * Redirects to /login if not authenticated
 *   * Redirects to /onboarding/{role} if onboarding incomplete
 *   * Redirects to /dashboard if onboarding already complete
 *
 * This is a Server Component — the redirect happens server-side.
 */
export default async function OnboardingIndexPage() {
  await routeToOnboardingOrDashboard();
  return null;
}
