/**
 * Public Supabase client barrel.
 *
 * Import from "@/lib/db/supabase":
 *   - createBrowserClient (client components)
 *   - createServerClient   (server components, route handlers, server actions)
 *   - createAdminClient    (service-role only — never client)
 *
 * Re-exports the typed helpers so consumers don't need to know which file
 * each function lives in.
 */

export { createClient as createBrowserClient } from "./browser";
export { createClient as createServerClient } from "./server";
export { createAdminClient } from "./admin";

export type { BrowserSupabaseClient } from "./browser";
export type { ServerSupabaseClient } from "./server";
export type { AdminSupabaseClient } from "./admin";

/**
 * Sentinel returned when Supabase credentials are not configured in
 * development. UI components can check for this to render a graceful
 * "configure Supabase to enable this feature" state.
 */
export const NO_SUPABASE_CLIENT = null;
