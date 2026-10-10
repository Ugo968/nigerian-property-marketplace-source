/**
 * Admin / service-role Supabase client.
 *
 * ⚠️  This client bypasses Row-Level Security. Use ONLY for:
 *   - Payment webhook verification (where the request comes from a
 *     provider, not a user, so there is no RLS principal)
 *   - Scheduled / automated jobs
 *   - First-run admin seeding
 *   - Verified admin actions behind a strict RBAC check
 *
 * Never use for normal user-facing queries. Those MUST go through
 * the RLS-bound server client so RLS can enforce ownership.
 *
 * Never import this module from a client component. It reads
 * SUPABASE_SERVICE_ROLE_KEY which must never be exposed to the browser.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverConfig } from "@/lib/security/server-config";
import { invariant } from "@/lib/utils/invariant";
import type { Database } from "@/types";

let cached: ReturnType<typeof createSupabaseClient<Database>> | null = null;

/**
 * Returns a service-role Supabase client.
 *
 * @throws if SUPABASE_SERVICE_ROLE_KEY is missing in production.
 */
export function createAdminClient() {
  if (cached) return cached;

  const url = serverConfig.supabase.url;
  const serviceRoleKey = serverConfig.supabase.serviceRoleKey;

  invariant(
    Boolean(url),
    "Admin client requires NEXT_PUBLIC_SUPABASE_URL to be configured.",
  );

  if (!serviceRoleKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Admin client requires SUPABASE_SERVICE_ROLE_KEY in production.",
      );
    }
    // Dev fallback: return a stub so the app boots without real creds.
    return null as unknown as ReturnType<typeof createSupabaseClient<Database>>;
  }

  cached = createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      // Service-role clients do not need a session.
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cached;
}

export type AdminSupabaseClient = ReturnType<typeof createSupabaseClient<Database>>;
