/**
 * Browser-side Supabase client.
 *
 * Uses @supabase/ssr to manage auth cookies over Next.js App Router.
 * This client respects Row-Level Security — it operates as the
 * currently-authenticated user (or anonymous if logged out).
 *
 * NEVER use the service-role key here. The service role bypasses RLS.
 *
 * Typed against our Database shape from src/types/database.ts.
 */

import { createBrowserClient } from "@supabase/ssr";
import { serverConfig } from "@/lib/security/server-config";
import type { Database } from "@/types";

/**
 * Build a browser Supabase client bound to the current page session.
 * Returns null when Supabase credentials are not configured so the
 * foundation can boot offline for design / preview purposes.
 */
export function createClient() {
  const url = serverConfig.supabase.url;
  const anonKey = serverConfig.supabase.anonKey;

  if (!url || !anonKey) {
    if (process.env.NODE_ENV !== "production") {
      // Dev fallback so the app boots without real Supabase creds.
      return null as unknown as ReturnType<typeof createBrowserClient<Database>>;
    }
    throw new Error(
      "Supabase browser client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}

/**
 * Type alias consumers can use without importing the underlying lib.
 */
export type BrowserSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;
