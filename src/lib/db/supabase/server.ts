/**
 * Server-side Supabase client for App Router (Server Components, Route
 * Handlers, Server Actions). Reads cookies from Next.js request scope
 * via @supabase/ssr and writes session cookies back through the
 * cookies() API.
 *
 * This client is RLS-bound: it operates as the currently-authenticated
 * user. For privileged operations (webhook verification, admin actions)
 * use the admin client in `./admin.ts` instead.
 *
 * Typed against our Database shape from src/types/database.ts so query
 * results have full type safety.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverConfig } from "@/lib/security/server-config";
import type { Database } from "@/types";

export async function createClient() {
  const cookieStore = await cookies();
  const url = serverConfig.supabase.url;
  const anonKey = serverConfig.supabase.anonKey;

  if (!url || !anonKey) {
    if (process.env.NODE_ENV !== "production") {
      return null as unknown as ReturnType<typeof createServerClient<Database>>;
    }
    throw new Error(
      "Supabase server client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be safely ignored if you have middleware refreshing
          // user sessions — see src/middleware.ts.
        }
      },
    },
  });
}

export type ServerSupabaseClient = Awaited<
  ReturnType<typeof createClient>
>;
