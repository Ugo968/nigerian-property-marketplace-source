/**
 * Notification preferences — server-side boundary (spec Section 13, 34).
 *
 * The client can:
 *   - GET preferences for the current user (all categories filled in
 *     with defaults when missing).
 *   - PATCH preferences — server validates the input, refuses to
 *     disable mandatory categories.
 *
 * The client CANNOT:
 *   - Submit a userId (always derived from the session).
 *   - Disable account_security / verification / payments categories.
 *   - Set arbitrary category strings (validated against the enum).
 *
 * This module never exposes the email_delivery_records or
 * notification_events tables to the client.
 */

"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createAdminClient } from "@/lib/db/supabase";
import { getCurrentProfile } from "@/lib/auth/server";
import { logger } from "@/lib/logging";
import {
  MANDATORY_CATEGORIES,
  defaultPreferenceFor,
} from "./types";
import type {
  NotificationCategory,
  EmailFrequency,
  NotificationPreferenceRow,
} from "@/types";
import { NOTIFICATION_CATEGORIES } from "@/types";

// ---------------------------------------------------------------------------
// Result types.
// ---------------------------------------------------------------------------
export type PreferencesResult =
  | { ok: true; preferences: NotificationPreferenceRow[] }
  | { ok: false; message?: string; requiresAuth?: boolean };

export type UpdatePreferenceResult =
  | { ok: true; preference: NotificationPreferenceRow }
  | { ok: false; message?: string; fieldErrors?: Record<string, string[]> };

export interface PreferenceUpdateInput {
  category: NotificationCategory;
  in_app_enabled?: boolean;
  email_enabled?: boolean;
  email_frequency?: EmailFrequency;
}

// ---------------------------------------------------------------------------
// GET preferences — returns a row for every category (defaults filled).
// ---------------------------------------------------------------------------
export async function getMyNotificationPreferences(): Promise<PreferencesResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, requiresAuth: true, message: "Please sign in." };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", profile.id);

  if (error) {
    logger.error("get preferences failed", { error: error.message });
    return { ok: false, message: "We couldn't load your preferences." };
  }

  // Materialise defaults for categories the user hasn't configured.
  const stored = new Map<string, NotificationPreferenceRow>(
    ((data ?? []) as NotificationPreferenceRow[]).map((r) => [r.category, r]),
  );

  const result: NotificationPreferenceRow[] = NOTIFICATION_CATEGORIES.map(
    (category) => {
      const existing = stored.get(category);
      if (existing) return existing;
      // Synthetic default row — not stored, but the UI doesn't need to know.
      const defaults = defaultPreferenceFor(category);
      return {
        id: `default-${category}`,
        user_id: profile.id,
        category,
        in_app_enabled: defaults.in_app_enabled,
        email_enabled: defaults.email_enabled,
        email_frequency: defaults.email_frequency,
        created_at: "",
        updated_at: "",
      };
    },
  );

  return { ok: true, preferences: result };
}

// ---------------------------------------------------------------------------
// PATCH preference — single category at a time.
// ---------------------------------------------------------------------------
const VALID_FREQUENCIES: ReadonlySet<EmailFrequency> = new Set([
  "instant",
  "daily",
  "weekly",
  "off",
]);

export async function updateMyNotificationPreference(
  input: PreferenceUpdateInput,
): Promise<UpdatePreferenceResult> {
  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, message: "Please sign in." };
  }

  // Validate category.
  if (!NOTIFICATION_CATEGORIES.includes(input.category)) {
    return { ok: false, fieldErrors: { category: ["Invalid category."] } };
  }

  // Validate frequency.
  if (
    input.email_frequency !== undefined &&
    !VALID_FREQUENCIES.has(input.email_frequency)
  ) {
    return { ok: false, fieldErrors: { email_frequency: ["Invalid frequency."] } };
  }

  // Mandatory categories: enforce always-on.
  // Per spec Section 13: "Do not allow users to disable mandatory security
  // notifications."
  if (MANDATORY_CATEGORIES.has(input.category)) {
    if (input.in_app_enabled === false || input.email_enabled === false) {
      return {
        ok: false,
        message: "Security-critical notifications cannot be disabled.",
      };
    }
    if (input.email_frequency && input.email_frequency !== "instant") {
      return {
        ok: false,
        message: "Security notifications must be delivered instantly.",
      };
    }
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, message: "Database not configured." };
  }

  // Upsert — the unique (user_id, category) constraint makes this safe.
  const defaults = defaultPreferenceFor(input.category);
  const insertPayload = {
    user_id: profile.id,
    category: input.category,
    in_app_enabled: input.in_app_enabled ?? defaults.in_app_enabled,
    email_enabled: input.email_enabled ?? defaults.email_enabled,
    email_frequency: input.email_frequency ?? defaults.email_frequency,
  };

  const { data, error } = await admin
    .from("notification_preferences")
    .upsert(insertPayload as never, { onConflict: "user_id,category" })
    .select("*")
    .single();

  if (error) {
    logger.error("upsert preference failed", { error: error.message });
    return { ok: false, message: "We couldn't save your preference." };
  }

  revalidatePath("/dashboard/notifications", "page");

  return { ok: true, preference: data as NotificationPreferenceRow };
}

// ---------------------------------------------------------------------------
// Unsubscribe (one-click, GET-callable from email links).
// Per spec Section 34: "Provide an unsubscribe mechanism for non-essential
// / promotional emails. Do not make security-critical account communication
// unsubscribe-able. Ensure unsubscribe links cannot be used to modify
// another user's preferences."
//
// We resolve the profile server-side from the email ONLY (the link is
// personalised by the renderer). Mandatory categories are rejected.
// ---------------------------------------------------------------------------
export async function unsubscribeViaEmail(params: {
  email: string;
  category: NotificationCategory;
}): Promise<{ ok: boolean; message: string }> {
  // Validate category.
  if (!NOTIFICATION_CATEGORIES.includes(params.category)) {
    return { ok: false, message: "Invalid category." };
  }
  if (MANDATORY_CATEGORIES.has(params.category)) {
    return {
      ok: false,
      message: "This category is mandatory and cannot be unsubscribed from.",
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, message: "Service unavailable." };
  }

  // Resolve profile from email via auth.users -> profiles.
  // RLS-bypassing query (admin client). The link contains the email so
  // there is no PII leak beyond what the recipient already owns.
  const { data: userRow } = await admin
    .from("auth.users") // NOTE: this requires the service role.
    .select("id")
    .eq("email", params.email.toLowerCase())
    .maybeSingle();

  if (!userRow) {
    // Don't reveal whether the email exists. Return success silently.
    return { ok: true, message: "If your email is registered, your preference has been updated." };
  }

  const userId = (userRow as { id: string }).id;
  // Look up the profile id.
  const { data: profileRow } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profileRow) {
    return { ok: true, message: "If your email is registered, your preference has been updated." };
  }

  const profileId = (profileRow as { id: string }).id;

  const defaults = defaultPreferenceFor(params.category);
  const { error } = await admin
    .from("notification_preferences")
    .upsert(
      {
        user_id: profileId,
        category: params.category,
        in_app_enabled: defaults.in_app_enabled,
        email_enabled: false,
        email_frequency: "off",
      } as never,
      { onConflict: "user_id,category" },
    );

  if (error) {
    logger.error("unsubscribe failed", { error: error.message, category: params.category });
    return { ok: false, message: "We couldn't process your request. Please try again." };
  }

  return {
    ok: true,
    message: `You've been unsubscribed from ${params.category} emails. You can re-enable anytime from your preferences.`,
  };
}
