"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/db/supabase";
import { rateLimiter, RATE_LIMITS } from "@/lib/security/rate-limit";
import { safeRelativeRedirect } from "@/lib/security/safe-url";
import { logger } from "@/lib/logging";
import { notificationService } from "@/lib/notifications";
import {
  signupSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  loginSchema,
} from "@/lib/validation";
import { normalizeNigerianPhone } from "@/lib/utils/phone";
import { getCurrentProfile } from "@/lib/auth/server";
import type { SignupInput, LoginInput } from "@/lib/validation";

/**
 * Authentication server actions.
 *
 * All flows run server-side. The browser NEVER submits role / status /
 * verification values that get persisted as-is — the server:
 *   * Validates with Zod (authoritative, not the client)
 *   * Calls Supabase Auth for actual auth operations
 *   * Writes the profile row with the role enum constrained to
 *     landlord/agent/company at the database layer
 *
 * Returns a discriminated union so client components can render the
 * correct error UI without parsing strings.
 */

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------
export type AuthActionResult =
  | { ok: true; redirectTo: string }
  | { ok: false; fieldErrors?: Record<string, string[]>; message?: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a redirect URL that's guaranteed to be a relative path on
 * our own origin. NEVER allow open redirects.
 *
 * Delegates to the centralised safeRelativeRedirect helper so the
 * open-redirect protection rules live in one auditable place
 * (src/lib/security/safe-url.ts).
 */
function safeRedirect(target: string | null | undefined, fallback = "/dashboard"): string {
  return safeRelativeRedirect(target, fallback);
}

/**
 * Returns the request IP for rate-limiting. Falls back to a stable
 * fingerprint when behind a proxy that strips the IP.
 */
async function getRequestIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Maps a Supabase auth error to a user-safe message. NEVER exposes
 * internal Supabase error details. Avoids account enumeration by
 * returning the same message for "user doesn't exist" and "wrong password".
 */
function safeAuthErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const msg = String((error as { message: string }).message).toLowerCase();
    if (msg.includes("invalid login")) {
      return "Invalid email or password.";
    }
    if (msg.includes("email not confirmed")) {
      return "Please verify your email before signing in.";
    }
    if (msg.includes("user already registered")) {
      return "An account with this email already exists.";
    }
    if (msg.includes("rate limit")) {
      return "Too many attempts. Please try again later.";
    }
  }
  return "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------------
// SIGNUP
// ---------------------------------------------------------------------------

export async function signupAction(
  input: SignupInput,
  redirectTarget?: string,
): Promise<AuthActionResult> {
  // Validate with Zod — authoritative check on the server.
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { email, password, fullName, phone, role } = parsed.data;
  const normalisedPhone = normalizeNigerianPhone(phone);
  if (!normalisedPhone) {
    return {
      ok: false,
      fieldErrors: { phone: ["Enter a valid Nigerian phone number"] },
    };
  }

  // Rate-limit by IP. Limit signup attempts to discourage brute-force.
  const ip = await getRequestIp();
  const rl = await rateLimiter.check({
    key: ip,
    action: "signup",
    ...RATE_LIMITS.signup,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many signup attempts. Try again later." };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return {
      ok: false,
      message:
        "Authentication is not configured in this environment. Set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }

  // Create the auth user. Supabase sends a verification email automatically
  // when email confirmation is enabled (default).
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        // Stored in auth.users.raw_user_metadata — used by the
        // post-verification server action to create the profile row.
        full_name: fullName,
        phone: normalisedPhone,
        role,
      },
    },
  });

  if (error) {
    logger.warn("Signup failed", {
      reason: "auth_error",
      email,
      message: error.message,
    });
    return { ok: false, message: safeAuthErrorMessage(error) };
  }

  // If Supabase returns a session immediately (email confirmation disabled
  // in dev), create the profile row now. Otherwise the profile is created
  // when the user clicks the verification link (handled by the email
  // verification callback flow).
  if (data.session) {
    await ensureProfileRow({
      supabase,
      userId: data.user!.id,
      email,
      fullName,
      phone: normalisedPhone,
      role,
    });
    revalidatePath("/", "layout");
    return { ok: true, redirectTo: `/onboarding/${role}` };
  }

  // Email verification required — redirect to "check your email" page.
  revalidatePath("/", "layout");
  return {
    ok: true,
    redirectTo: `/verify-email?email=${encodeURIComponent(email)}`,
  };
}

/**
 * Idempotent: ensures the profile row exists for a user.
 *
 * On signup, the auth user is created first. The profile row may be
 * created immediately (if email confirmation is off) or deferred to
 * the email-verification callback. Either way, this function makes
 * sure the profile row exists with the right role and account_status.
 *
 * Role immutability is enforced at the DB layer: the role check
 * constraint rejects anything outside landlord/agent/company, and
 * the RLS UPDATE policy prevents changing role from the client.
 */
async function ensureProfileRow(args: {
  supabase: NonNullable<Awaited<ReturnType<typeof createServerClient>>>;
  userId: string;
  email: string;
  fullName: string;
  phone: string;
  role: "landlord" | "agent" | "company";
}) {
  // Check if profile already exists (idempotent)
  const { data: existing } = await args.supabase
    .from("profiles")
    .select("id")
    .eq("user_id", args.userId)
    .maybeSingle();

  if (existing) return;

  // Insert with the validated role. RLS allows users to insert their own
  // profile; the CHECK constraint rejects anything outside the enum.
  const { error } = await args.supabase.from("profiles").insert({
    user_id: args.userId,
    role: args.role,
    full_name: args.fullName,
    phone: args.phone,
    email_verified: false,
    account_status: "pending", // user must complete onboarding → active
    onboarding_completed: false,
    // social_handles defaults to '{}' via the column default
  });

  if (error) {
    logger.error("Profile insert failed during signup", {
      userId: args.userId,
      role: args.role,
      error: error.message,
    });
    // Don't leak the DB error to the user — return a generic message.
    throw new Error("PROFILE_INSERT_FAILED");
  }

  // Resolve the profile.id (RLS-bound server client returns only own
  // rows; this is safe). Used as the dispatcher recipient.
  const { data: profileRow } = await args.supabase
    .from("profiles")
    .select("id")
    .eq("user_id", args.userId)
    .maybeSingle();
  const profileId = (profileRow as { id: string } | null)?.id;
  if (profileId) {
    // Send the welcome notification (best-effort — failures don't block signup).
    // Idempotent via eventKey: the welcome notification for a given user is
    // only sent once.
    await notificationService.dispatch({
      recipientId: profileId,
      type: "account.welcome",
      title: "Welcome to Shelty",
      body: `Welcome, ${args.fullName}! Your account is ready. Complete onboarding to start listing properties.`,
      href: `/onboarding/${args.role}`,
      relatedEntityType: "profile",
      relatedEntityId: profileId,
      eventKey: `account.welcome:${args.userId}`,
      metadata: { role: args.role, fullName: args.fullName },
      emailTemplateInput: { role: args.role },
    });
  }
}

// ---------------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------------

export async function loginAction(
  input: LoginInput,
  redirectTarget?: string,
): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const ip = await getRequestIp();
  const rl = await rateLimiter.check({
    key: ip,
    action: "login",
    ...RATE_LIMITS.login,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many login attempts. Try again later." };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Authentication is not configured." };
  }

  const { error, data } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    logger.warn("Login failed", {
      reason: "auth_error",
      email: parsed.data.email,
      message: error.message,
    });
    return { ok: false, message: safeAuthErrorMessage(error) };
  }

  // Fetch the profile to decide where to send the user.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("role, account_status, onboarding_completed, deleted_at")
    .eq("user_id", data.user!.id)
    .maybeSingle();

  const profile = profileRow as
    | {
        role: "landlord" | "agent" | "company";
        account_status: string;
        onboarding_completed: boolean;
        deleted_at: string | null;
      }
    | null;

  // Banned users cannot sign in.
  if (profile?.account_status === "banned") {
    return {
      ok: false,
      message:
        "Your account has been banned. Contact support if you believe this is a mistake.",
    };
  }

  // Soft-deleted users cannot sign in either.
  if (profile?.deleted_at) {
    return {
      ok: false,
      message:
        "This account has been deactivated. Contact support to reactivate.",
    };
  }

  revalidatePath("/", "layout");

  // Suspended users can see a "your account is suspended" page.
  if (profile?.account_status === "suspended") {
    return { ok: true, redirectTo: "/account-suspended" };
  }

  // Pending / active users without completed onboarding → onboarding.
  if (profile && !profile.onboarding_completed) {
    return { ok: true, redirectTo: `/onboarding/${profile.role}` };
  }

  // Otherwise: send them to their intended destination (or dashboard).
  return { ok: true, redirectTo: safeRedirect(redirectTarget, "/dashboard") };
}

// ---------------------------------------------------------------------------
// LOGOUT
// ---------------------------------------------------------------------------

export async function logoutAction() {
  const supabase = await createServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/");
}

// ---------------------------------------------------------------------------
// RESEND VERIFICATION EMAIL
// ---------------------------------------------------------------------------

export async function resendVerificationAction(
  email: string,
): Promise<AuthActionResult> {
  const ip = await getRequestIp();
  const rl = await rateLimiter.check({
    key: ip,
    action: "otp",
    ...RATE_LIMITS.otp,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many requests. Try again later." };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Authentication is not configured." };
  }

    const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: "https://shelty.ng/auth/confirm",
    },
  });

  if (error) {
    // Don't reveal whether the email exists. Same message for all errors.
    return {
      ok: false,
      message: "We couldn't send a verification email. Please try again later.",
    };
  }

  return {
    ok: true,
    redirectTo: `/verify-email?email=${encodeURIComponent(email)}`,
  };
}

// ---------------------------------------------------------------------------
// FORGOT PASSWORD
// ---------------------------------------------------------------------------

export async function forgotPasswordAction(
  email: string,
): Promise<AuthActionResult> {
  const parsed = passwordResetRequestSchema.safeParse({ email });
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const ip = await getRequestIp();
  const rl = await rateLimiter.check({
    key: ip,
    action: "passwordReset",
    ...RATE_LIMITS.passwordReset,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many requests. Try again later." };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Authentication is not configured." };
  }

  // We always return success — never reveal whether an account exists.
  // Supabase will return an error if the email isn't associated, but
  // we treat that the same as success from the user's perspective.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/reset-password`,
  });

  return {
    ok: true,
    redirectTo: `/forgot-password?sent=1&email=${encodeURIComponent(email)}`,
  };
}

// ---------------------------------------------------------------------------
// RESET PASSWORD (after clicking the email link)
// ---------------------------------------------------------------------------

export async function resetPasswordAction(
  password: string,
  confirmPassword: string,
): Promise<AuthActionResult> {
  const parsed = passwordResetSchema.safeParse({ password, confirmPassword });
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Authentication is not configured." };
  }

  // Supabase has already verified the reset token in the email link and
  // established a recovery session. We just call updateUser with the new
  // password.
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    logger.warn("Password reset failed", { message: error.message });
    return {
      ok: false,
      message: safeAuthErrorMessage(error),
    };
  }

  // Best-effort: notify the user (if a profile exists) of the security
  // event. The user is in a recovery session so we can resolve their id
  // via getCurrentProfile().
  try {
    const profile = await getCurrentProfile();
    if (profile) {
      await notificationService.dispatch({
        recipientId: profile.id,
        type: "account.password_changed",
        title: "Your password was changed",
        body: "Your Shelty account password was changed. If this wasn't you, please contact support immediately.",
        href: `/dashboard/profile`,
        relatedEntityType: "profile",
        relatedEntityId: profile.id,
        eventKey: `account.password_changed:${profile.id}:${Date.now()}`,
        metadata: { reason: "password_reset" },
        emailTemplateInput: {
          eventDescription: "Your Shelty account password was changed.",
          whenIso: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    logger.warn("post-reset notification failed", {
      error: err instanceof Error ? err.message : "unknown",
    });
  }

  return { ok: true, redirectTo: "/login?reset=1" };
}
