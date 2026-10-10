import { createServerClient } from "@/lib/db/supabase";
import type {
  ProfileRow,
  LandlordProfileRow,
  AgentProfileRow,
  CompanyProfileRow,
} from "@/types";
import type { UserRole } from "@/types";
import { capabilitiesFor } from "@/lib/capabilities";

/**
 * Public profile fetcher.
 *
 * Per spec Section 4 (public vs private) + Section 26 (public profile
 * safety):
 *   * Public profiles may include: display name, photo, role, bio,
 *     areas served, years of experience, company info, website, SELECTED
 *     social links, verification badge, joined date, active listing count.
 *   * Public profiles must NOT include: verification documents, internal
 *     admin notes, private contact info, verification reviewer info,
 *     account security information.
 *
 * This helper does an explicit column-select (never SELECT *) so the
 * surface area stays controlled.
 */

export interface PublicProfile {
  id: string;
  role: UserRole;
  fullName: string;
  bio: string | null;
  avatarUrl: string | null;
  areasServed: string[] | null;
  socialHandles: Record<string, string> | null;
  verificationState: ProfileRow["verification_state"];
  accountStatus: ProfileRow["account_status"];
  createdAt: string;
  /** Computed: can this profile show social handles publicly? */
  canShowSocialHandles: boolean;
  /** Role-specific public row (may be null if onboarding incomplete). */
  landlord?: Omit<LandlordProfileRow, "verification_payload" | "preferred_contact_value"> | null;
  agent?: Omit<AgentProfileRow, "verification_payload"> | null;
  company?: Omit<CompanyProfileRow, "verification_payload"> | null;
}

/**
 * Fetches a public profile by its `profiles.id`.
 *
 * Returns null when:
 *   - The profile doesn't exist
 *   - The profile is soft-deleted
 *   - The account is banned or deactivated
 *   - Supabase is not configured (dev foundation fallback)
 *
 * Per spec Section 26: only public-safe fields are returned. Private
 * fields like `verification_payload`, internal contact info, etc. are
 * never returned by this function.
 */
export async function getPublicProfile(
  profileId: string,
): Promise<PublicProfile | null> {
  const supabase = await createServerClient();
  if (!supabase) return null;

  // 1. Fetch the main profile row with explicit column select.
  const { data: profileRow, error } = await supabase
    .from("profiles")
    .select(
      "id, role, full_name, bio, avatar_url, areas_served, social_handles, verification_state, account_status, deleted_at, subscription_tier, created_at, onboarding_completed",
    )
    .eq("id", profileId)
    .maybeSingle();

  if (error || !profileRow) return null;

  const profile = profileRow as {
    id: string;
    role: UserRole;
    full_name: string;
    bio: string | null;
    avatar_url: string | null;
    areas_served: string[] | null;
    social_handles: Record<string, string>;
    verification_state: ProfileRow["verification_state"];
    account_status: ProfileRow["account_status"];
    deleted_at: string | null;
    subscription_tier: ProfileRow["subscription_tier"];
    created_at: string;
    onboarding_completed: boolean;
  };

  // Hide banned / deactivated / soft-deleted profiles.
  if (
    profile.deleted_at ||
    profile.account_status === "banned" ||
    profile.account_status === "deactivated"
  ) {
    return null;
  }

  // Hide profiles that haven't completed onboarding yet — they shouldn't
  // be discoverable publicly.
  if (!profile.onboarding_completed) {
    return null;
  }

  // 2. Fetch the role-specific row (only public fields).
  const roleTable =
    profile.role === "landlord"
      ? "landlord_profiles"
      : profile.role === "agent"
        ? "agent_profiles"
        : "company_profiles";

  const roleSelect =
    profile.role === "landlord"
      ? "profile_id, ownership_summary, profile_completeness"
      : profile.role === "agent"
        ? "profile_id, professional_name, agency_name, years_of_experience, license_issuing_body, professional_description, portfolio_url, profile_completeness"
        : "profile_id, company_name, company_logo_url, company_description, office_state, office_lga, website, profile_completeness";

  const { data: roleRow } = await supabase
    .from(roleTable)
    .select(roleSelect)
    .eq("profile_id", profileId)
    .maybeSingle();

  // 3. Compute capability for showing social handles
  const caps = capabilitiesFor(profile.role, profile.subscription_tier);

  // 4. Strip private fields (defensive — column-select already filtered,
  // but explicitly drop the fields that should never be public)
  return {
    id: profile.id,
    role: profile.role,
    fullName: profile.full_name,
    bio: profile.bio,
    avatarUrl: profile.avatar_url,
    areasServed: profile.areas_served,
    // Respect capability gating — even if the row has social_handles,
    // don't expose them publicly if the plan doesn't allow it.
    socialHandles: caps.canShowSocialMediaHandles ? profile.social_handles : null,
    verificationState: profile.verification_state,
    accountStatus: profile.account_status,
    createdAt: profile.created_at,
    canShowSocialHandles: caps.canShowSocialMediaHandles,
    landlord: roleRow as never,
    agent: roleRow as never,
    company: roleRow as never,
  };
}

/**
 * Fetches the caller's own profile + role-specific row (for /dashboard/profile).
 *
 * Returns ALL fields including private ones (the caller is the owner).
 */
export async function getOwnProfileContext(): Promise<{
  profile: ProfileRow;
  landlord: LandlordProfileRow | null;
  agent: AgentProfileRow | null;
  company: CompanyProfileRow | null;
} | null> {
  const supabase = await createServerClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profileRow) return null;
  const profile = profileRow as ProfileRow;

  // Role-specific row
  const roleTable =
    profile.role === "landlord"
      ? "landlord_profiles"
      : profile.role === "agent"
        ? "agent_profiles"
        : "company_profiles";

  const { data: roleRow } = await supabase
    .from(roleTable)
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();

  return {
    profile,
    landlord: profile.role === "landlord" ? (roleRow as LandlordProfileRow) : null,
    agent: profile.role === "agent" ? (roleRow as AgentProfileRow) : null,
    company: profile.role === "company" ? (roleRow as CompanyProfileRow) : null,
  };
}
