import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/db/supabase";
import type { ProfileRow, UserRole } from "@/types";

/**
 * Server-side auth helpers.
 *
 * These helpers read from the profiles table to determine the caller's
 * role, account status, and onboarding state. They are pure read helpers
 * — never trust client-submitted values for role/account_status/verification.
 */

export type AccountStatus =
  | "active"
  | "suspended"
  | "banned"
  | "pending"
  | "deactivated";

/**
 * Returns the current authenticated user's Supabase session, if any.
 */
export async function getSession(): Promise<Session | null> {
  const supabase = await createServerClient();
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Returns the currently authenticated user, or null.
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Returns the caller's full profile row (role, account_status, etc.),
 * or null when not signed in / Supabase not configured / no profile yet.
 */
export async function getCurrentProfile(): Promise<ProfileRow | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createServerClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

/**
 * Returns the role currently assigned to the authenticated user.
 */
export async function getCurrentUserRole(): Promise<UserRole | null> {
  const profile = await getCurrentProfile();
  return profile?.role ?? null;
}

/**
 * Returns the caller's account status (active / pending / suspended /
 * banned / deactivated). Defaults to 'pending' when no profile exists
 * yet (signup incomplete).
 */
export async function getCurrentAccountStatus(): Promise<AccountStatus> {
  const profile = await getCurrentProfile();
  return profile?.account_status ?? "pending";
}

/**
 * Returns true if the caller has completed role-specific onboarding.
 * Stored as `onboarding_completed` on the profiles row.
 */
export async function isOnboardingComplete(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile?.onboarding_completed ?? false;
}

/**
 * Returns true if the caller's account is in a state that allows
 * marketplace access (active OR pending-only-onboarding).
 */
export function canAccessMarketplace(status: AccountStatus): boolean {
  return status === "active" || status === "pending";
}

/**
 * Returns true if the caller's account is suspended (limited access —
 * can read but cannot publish / apply / message).
 */
export function isSuspended(status: AccountStatus): boolean {
  return status === "suspended";
}

/**
 * Returns true if the caller is banned (no login / no marketplace access).
 */
export function isBanned(status: AccountStatus): boolean {
  return status === "banned";
}

/**
 * Asserts the user is authenticated. Throws otherwise.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

/**
 * Asserts the user is authenticated AND their account is active (or
 * pending — pending is allowed for onboarding routes only).
 *
 * Use this in (dashboard) routes to enforce account-status gating.
 */
export async function requireActiveUser() {
  const user = await requireUser();
  const status = await getCurrentAccountStatus();
  if (status === "banned") {
    throw new Error("BANNED");
  }
  if (status === "suspended") {
    throw new Error("SUSPENDED");
  }
  if (status === "deactivated") {
    throw new Error("DEACTIVATED");
  }
  return { user, status };
}

/**
 * Asserts the user is authenticated, active, AND has completed onboarding.
 * Use in (dashboard) routes that require a fully-set-up account.
 */
export async function requireFullyOnboardedUser() {
  const { user, status } = await requireActiveUser();
  const onboardingComplete = await isOnboardingComplete();
  if (!onboardingComplete) {
    throw new Error("ONBOARDING_INCOMPLETE");
  }
  return { user, status };
}

/**
 * Asserts the user is authenticated and has the given role.
 * Use to gate role-specific routes (e.g. company-only team management).
 */
export async function requireRole(role: UserRole) {
  const { user } = await requireActiveUser();
  const userRole = await getCurrentUserRole();
  if (userRole !== role) {
    throw new Error("FORBIDDEN");
  }
  return { user, role };
}

/**
 * Asserts the user is an admin (admin role row OR email in ADMIN_EMAILS).
 * Use for the (admin) route group.
 */
export async function requireAdmin() {
  const user = await requireUser();
  const supabase = await createServerClient();
  if (!supabase) {
    throw new Error("FORBIDDEN");
  }
  const { data } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) {
    // Fall back to ADMIN_EMAILS env list for first-run seeding.
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!adminEmails.includes(user.email ?? "")) {
      throw new Error("FORBIDDEN");
    }
  }
  return user;
}

/**
 * Type guard for the sentinel "no Supabase client" case.
 */
export function isSupabaseReady(client: unknown): client is SupabaseClient {
  return client !== null && client !== undefined;
}
