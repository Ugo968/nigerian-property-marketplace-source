import { createServerClient } from "@/lib/db/supabase";
import { getCurrentProfile } from "@/lib/auth/server";
import type {
  ProfileRow,
  LandlordProfileRow,
  AgentProfileRow,
  CompanyProfileRow,
} from "@/types";
import type { UserRole } from "@/types";

/**
 * Onboarding helpers — used by Server Components to fetch the caller's
 * full onboarding context (profile + role-specific row) before rendering
 * the role-specific onboarding form.
 */

export interface OnboardingContext {
  profile: ProfileRow;
  roleSpecific:
    | LandlordProfileRow
    | AgentProfileRow
    | CompanyProfileRow
    | null;
}

/**
 * Returns the caller's onboarding context (profile + role-specific row).
 *
 * If the caller is not authenticated OR the profile row doesn't exist
 * yet (e.g. email verification pending), returns null.
 *
 * If the caller's profile.role doesn't match `expectedRole`, returns
 * null. This is the server-side guard against an agent trying to
 * submit to /onboarding/company by manipulating the URL.
 */
export async function getOnboardingContext(
  expectedRole: UserRole,
): Promise<OnboardingContext | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  if (profile.role !== expectedRole) return null;
  if (profile.account_status === "banned") return null;
  if (profile.deleted_at) return null;

  const supabase = await createServerClient();
  if (!supabase) return null;

  const tableName =
    expectedRole === "landlord"
      ? "landlord_profiles"
      : expectedRole === "agent"
        ? "agent_profiles"
        : expectedRole === "tenant"
          ? "tenant_profiles"
          : "company_profiles";

  const { data } = await supabase
    .from(tableName)
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();

  return {
    profile,
    roleSpecific: (data as never) ?? null,
  };
}

/**
 * Returns a "Welcome back" resume state for users who closed the browser
 * mid-onboarding. Renders in the onboarding index page so users know
 * they can continue.
 */
export function getResumeMessage(
  profile: ProfileRow,
): { title: string; description: string } {
  if (profile.onboarding_completed) {
    return {
      title: "Onboarding complete",
      description: "Redirecting you to your dashboard...",
    };
  }
  return {
    title: "Welcome back",
    description: "Complete your profile to continue to the marketplace.",
  };
}
