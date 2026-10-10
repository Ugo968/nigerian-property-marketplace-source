/**
 * Browser-side auth helpers. Use these in Client Components.
 * Server-side equivalents live in `./server.ts`.
 */

"use client";

import { createBrowserClient } from "@/lib/db/supabase";

/**
 * Sign in with email + password.
 */
export async function signInWithEmail(email: string, password: string) {
  const supabase = createBrowserClient();
  if (!supabase) return { error: { message: "Auth not configured." } as Error };
  return supabase.auth.signInWithPassword({ email, password });
}

/**
 * Sign up with email + password. The signup form is built in a later phase.
 */
export async function signUpWithEmail(email: string, password: string) {
  const supabase = createBrowserClient();
  if (!supabase) return { error: { message: "Auth not configured." } as Error };
  return supabase.auth.signUp({ email, password });
}

/**
 * Sign out the current user and clear local session.
 */
export async function signOut() {
  const supabase = createBrowserClient();
  if (!supabase) return;
  await supabase.auth.signOut();
  // Redirect to home — server middleware will refresh cookies.
  if (typeof window !== "undefined") {
    window.location.href = "/";
  }
}

/**
 * Request a password-reset email.
 */
export async function requestPasswordReset(email: string) {
  const supabase = createBrowserClient();
  if (!supabase) return { error: { message: "Auth not configured." } as Error };
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
}
