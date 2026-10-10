"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/db/supabase";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/server";
import {
  landlordOnboardingSchema,
  agentOnboardingSchema,
  companyOnboardingSchema,
  type LandlordOnboardingInput,
  type AgentOnboardingInput,
  type CompanyOnboardingInput,
} from "@/lib/validation";
import { computeProfileCompleteness } from "@/lib/profiles/completeness";
import { rateLimiter, RATE_LIMITS } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging";
import type { UserRole } from "@/types";

/**
 * Onboarding server actions.
 *
 * The user must be authenticated (auth.users row exists) AND have a
 * profile row with role + account_status='pending' (set during signup).
 *
 * Onboarding works like this:
 *   1. User visits /onboarding → server checks profile.role → redirects
 *      to /onboarding/{role}
 *   2. User submits each step's data → server validates per-step schema
 *   3. On final step, the full role-specific schema is parsed → server
 *      upserts the role-specific row + updates profile
 *   4. computeProfileCompleteness() determines whether onboarding is
 *      "complete enough" for marketplace access (meetsMinimum === true)
 *   5. profile.onboarding_completed = true → account_status = 'active'
 *      → redirect to /dashboard
 *
 * Role immutability: the role was assigned at signup and is enforced
 * immutable by the RLS UPDATE policy. Onboarding does NOT change role.
 */

export type OnboardingResult =
  | { ok: true; redirectTo: string }
  | { ok: false; fieldErrors?: Record<string, string[]>; message?: string };

/**
 * Internal: ensures the caller is authenticated, has a profile, and
 * the profile's role matches the onboarding route they're submitting to.
 * This prevents an agent from submitting to /onboarding/company by
 * manipulating the URL.
 */
async function requireOnboardingContext(expectedRole: UserRole) {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false as const,
      redirectTo: `/login?next=${encodeURIComponent(`/onboarding/${expectedRole}`)}`,
    };
  }
  const profile = await getCurrentProfile();
  if (!profile) {
    return {
      ok: false as const,
      redirectTo: `/login?next=${encodeURIComponent(`/onboarding/${expectedRole}`)}`,
    };
  }
  // Role mismatch — the user is trying to submit to the wrong role's
  // onboarding. Redirect them to their own role's onboarding.
  if (profile.role !== expectedRole) {
    return {
      ok: false as const,
      redirectTo: `/onboarding/${profile.role}`,
    };
  }
  // Already-completed onboarding: redirect to dashboard. The user can
  // still edit profile fields from /dashboard/profile, so this isn't a
  // hard lock — just a default redirect.
  if (profile.onboarding_completed) {
    return {
      ok: false as const,
      redirectTo: "/dashboard",
    };
  }
  return { ok: true as const, user, profile };
}

type ContextOk = Awaited<ReturnType<typeof requireOnboardingContext>>;
type OkContext = Extract<ContextOk, { ok: true }>;

// ---------------------------------------------------------------------------
// LANDLORD
// ---------------------------------------------------------------------------
export async function submitLandlordOnboarding(
  input: LandlordOnboardingInput,
): Promise<OnboardingResult> {
  const ctx = await requireOnboardingContext("landlord");
  if (!ctx.ok) return ctx;
  return persistLandlordOnboarding(ctx, input);
}

async function persistLandlordOnboarding(
  ctx: OkContext,
  input: LandlordOnboardingInput,
): Promise<OnboardingResult> {
  // Rate-limit submissions to prevent automation abuse.
  const rl = await rateLimiter.check({
    key: ctx.user.id,
    action: "onboarding",
    ...RATE_LIMITS.application,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many submissions. Try again later." };
  }

  const parsed = landlordOnboardingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // 1. Upsert landlord_profiles row.
  const { error: landlordError } = await supabase
    .from("landlord_profiles")
    .upsert({
      profile_id: ctx.profile.id,
      preferred_contact_method: parsed.data.preferredContactMethod || null,
      preferred_contact_value: parsed.data.preferredContactValue || null,
      ownership_summary: parsed.data.ownershipSummary || null,
    });

  if (landlordError) {
    logger.error("Landlord onboarding upsert failed", {
      userId: ctx.user.id,
      message: landlordError.message,
    });
    return { ok: false, message: "We couldn't save your profile. Please try again." };
  }

  // 2. Update main profile row with photo, bio, location.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      avatar_url: parsed.data.avatarUrl || null,
      bio: parsed.data.bio || null,
      preferred_location: parsed.data.preferredLocation,
    })
    .eq("id", ctx.profile.id);

  if (profileError) {
    logger.error("Profile update failed during landlord onboarding", {
      userId: ctx.user.id,
      message: profileError.message,
    });
    return { ok: false, message: "We couldn't save your profile. Please try again." };
  }

  return finalizeOnboarding(ctx, "landlord");
}

// ---------------------------------------------------------------------------
// AGENT
// ---------------------------------------------------------------------------
export async function submitAgentOnboarding(
  input: AgentOnboardingInput,
): Promise<OnboardingResult> {
  const ctx = await requireOnboardingContext("agent");
  if (!ctx.ok) return ctx;
  return persistAgentOnboarding(ctx, input);
}

async function persistAgentOnboarding(
  ctx: OkContext,
  input: AgentOnboardingInput,
): Promise<OnboardingResult> {
  const rl = await rateLimiter.check({
    key: ctx.user.id,
    action: "onboarding",
    ...RATE_LIMITS.application,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many submissions. Try again later." };
  }

  const parsed = agentOnboardingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  const { error: agentError } = await supabase
    .from("agent_profiles")
    .upsert({
      profile_id: ctx.profile.id,
      professional_name: parsed.data.professionalName,
      agency_name: parsed.data.agencyName || null,
      years_of_experience: parsed.data.yearsOfExperience,
      license_number: parsed.data.licenseNumber || null,
      license_issuing_body: parsed.data.licenseIssuingBody || null,
      professional_description: parsed.data.bio,
      portfolio_url: parsed.data.portfolioUrl || null,
    });

  if (agentError) {
    logger.error("Agent onboarding upsert failed", {
      userId: ctx.user.id,
      message: agentError.message,
    });
    return { ok: false, message: "We couldn't save your profile. Please try again." };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      avatar_url: parsed.data.avatarUrl || null,
      bio: parsed.data.bio,
      areas_served: parsed.data.areasServed,
      social_handles: parsed.data.socialHandles ?? {},
    })
    .eq("id", ctx.profile.id);

  if (profileError) {
    logger.error("Profile update failed during agent onboarding", {
      userId: ctx.user.id,
      message: profileError.message,
    });
    return { ok: false, message: "We couldn't save your profile. Please try again." };
  }

  return finalizeOnboarding(ctx, "agent");
}

// ---------------------------------------------------------------------------
// COMPANY
// ---------------------------------------------------------------------------
export async function submitCompanyOnboarding(
  input: CompanyOnboardingInput,
): Promise<OnboardingResult> {
  const ctx = await requireOnboardingContext("company");
  if (!ctx.ok) return ctx;
  return persistCompanyOnboarding(ctx, input);
}

async function persistCompanyOnboarding(
  ctx: OkContext,
  input: CompanyOnboardingInput,
): Promise<OnboardingResult> {
  const rl = await rateLimiter.check({
    key: ctx.user.id,
    action: "onboarding",
    ...RATE_LIMITS.application,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many submissions. Try again later." };
  }

  const parsed = companyOnboardingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  const { error: companyError } = await supabase
    .from("company_profiles")
    .upsert({
      profile_id: ctx.profile.id,
      company_name: parsed.data.companyName,
      company_logo_url: parsed.data.companyLogoUrl || null,
      company_description: parsed.data.companyDescription,
      cac_registered: parsed.data.cacRegistered,
      cac_registration_number: parsed.data.cacRegistrationNumber || null,
      office_address: parsed.data.officeAddress,
      office_state: parsed.data.officeState,
      office_lga: parsed.data.officeLga || null,
      website: parsed.data.website || null,
      social_handles: parsed.data.socialHandles ?? {},
    });

  if (companyError) {
    logger.error("Company onboarding upsert failed", {
      userId: ctx.user.id,
      message: companyError.message,
    });
    return { ok: false, message: "We couldn't save your company profile. Please try again." };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      // For company accounts, full_name on the main profile is the company
      // contact person (already set at signup). The company name itself
      // lives in company_profiles.company_name.
      avatar_url: parsed.data.companyLogoUrl || null,
      phone: parsed.data.contactPhone,
      // social_handles on profiles mirrors the company's social handles
      // for unified display in the public directory.
      social_handles: parsed.data.socialHandles ?? {},
    })
    .eq("id", ctx.profile.id);

  if (profileError) {
    logger.error("Profile update failed during company onboarding", {
      userId: ctx.user.id,
      message: profileError.message,
    });
    return { ok: false, message: "We couldn't save your company profile. Please try again." };
  }

  return finalizeOnboarding(ctx, "company");
}

// ---------------------------------------------------------------------------
// SHARED FINALIZE
// ---------------------------------------------------------------------------

/**
 * After the role-specific onboarding has been persisted, fetch the
 * fresh profile + role-specific row, compute completeness, and if
 * meetsMinimum → mark onboarding_completed + flip account_status to
 * 'active' + redirect to /dashboard.
 *
 * If the profile still doesn't meet the minimum bar (which shouldn't
 * happen given the schemas require the minimum fields, but defensive),
 * redirect back to the onboarding page so the user can complete it.
 */
async function finalizeOnboarding(
  ctx: OkContext,
  role: UserRole,
): Promise<OnboardingResult> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Re-fetch the role-specific row to compute completeness.
  const tableName =
    role === "landlord"
      ? "landlord_profiles"
      : role === "agent"
        ? "agent_profiles"
        : "company_profiles";

  const { data: roleSpecificRow } = await supabase
    .from(tableName)
    .select("*")
    .eq("profile_id", ctx.profile.id)
    .maybeSingle();

  // Re-fetch the profile row to get the updated state.
  const { data: updatedProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", ctx.profile.id)
    .maybeSingle();

  if (!updatedProfile) {
    return { ok: false, message: "We couldn't verify your profile. Please try again." };
  }

  const result = computeProfileCompleteness(
    role,
    updatedProfile as never,
    roleSpecificRow as never,
  );

  if (!result.meetsMinimum) {
    // Onboarding was saved but minimum bar not met — let user continue
    // editing. They will see the checklist with what's still missing.
    return {
      ok: true,
      redirectTo: `/onboarding/${role}?incomplete=1`,
    };
  }

  // Mark onboarding complete + flip to active. RLS allows users to update
  // their own profile row but the UPDATE policy enforces role + tier
  // immutability, so these are safe client-side calls.
  const { error: completeError } = await supabase
    .from("profiles")
    .update({
      onboarding_completed: true,
      account_status: "active",
    })
    .eq("id", ctx.profile.id);

  if (completeError) {
    logger.error("Could not mark onboarding complete", {
      userId: ctx.user.id,
      message: completeError.message,
    });
    return {
      ok: false,
      message: "Your profile was saved but we couldn't mark onboarding complete. Please contact support.",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true, redirectTo: "/dashboard" };
}

// ---------------------------------------------------------------------------
// SHARED REDIRECT HELPER (used by the /onboarding index page)
// ---------------------------------------------------------------------------

/**
 * Server action: redirect to the user's role-specific onboarding page,
 * or to /dashboard if onboarding is already complete, or to /login if
 * not authenticated.
 *
 * Implemented as a server action so the page can `redirect()` from a
 * Server Component without an extra round-trip.
 */
export async function routeToOnboardingOrDashboard() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login?next=/onboarding");
  }

  if (profile.deleted_at) {
    redirect("/login");
  }

  if (profile.account_status === "banned") {
    redirect("/account-suspended");
  }

  if (profile.onboarding_completed) {
    redirect("/dashboard");
  }

  redirect(`/onboarding/${profile.role}`);
}
