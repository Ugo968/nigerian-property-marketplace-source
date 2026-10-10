/**
 * Server-only environment configuration.
 *
 * This module MUST NEVER be imported from a client component.
 * It reads secrets that are not exposed to the browser via NEXT_PUBLIC_*
 * and validates that critical secrets are present before use.
 *
 * For browser-safe public env vars, see `./public-env.ts`.
 */

import { invariant } from "@/lib/utils/invariant";

/**
 * Throws a clear error if a required server env var is missing.
 * Use this only for variables that are genuinely required for the
 * current operation to succeed.
 */
function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Missing required environment variable: ${name}. Configure it in your deployment environment.`,
      );
    }
    // In non-production, return a placeholder so the app can boot
    // for design / preview purposes without real credentials.
    return `dev-placeholder-for-${name}`;
  }
  return value;
}

/**
 * Cached configuration object.
 * Constructed once at module load to avoid re-reading process.env on every call.
 */
export const serverConfig = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: process.env.NODE_ENV !== "production",

  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",

  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  },

  paystack: {
    publicKey: process.env.PAYSTACK_PUBLIC_KEY ?? "",
    secretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
    webhookHash: process.env.PAYSTACK_WEBHOOK_HASH ?? "",
  },

  flutterwave: {
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY ?? "",
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY ?? "",
    webhookHash: process.env.FLUTTERWAVE_WEBHOOK_HASH ?? "",
    encryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY ?? "",
  },

  maps: {
    providerKey: process.env.MAPS_PROVIDER_KEY ?? "",
  },

  email: {
    apiKey: process.env.EMAIL_PROVIDER_API_KEY ?? "",
    fromAddress: process.env.EMAIL_FROM_ADDRESS ?? "no-reply@naijahaus.example",
    fromName: process.env.EMAIL_FROM_NAME ?? "Shelty",
  },

  sms: {
    apiKey: process.env.SMS_PROVIDER_API_KEY ?? "",
    senderId: process.env.SMS_PROVIDER_SENDER_ID ?? "Shelty",
  },

  auth: {
    secret: process.env.AUTH_SECRET ?? "",
    adminEmails: (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
} as const;

/**
 * Returns the Supabase service-role key, throwing if it is genuinely missing
 * in production. Use this ONLY inside server-only code paths (webhooks,
 * admin operations, automated jobs).
 */
export function getSupabaseServiceRoleKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

/**
 * True when the real Supabase project credentials are configured.
 * Used to decide whether to fall back to a local stub in development.
 */
export function hasSupabaseCredentials(): boolean {
  return Boolean(
    serverConfig.supabase.url &&
      serverConfig.supabase.anonKey &&
      serverConfig.supabase.url !== "",
  );
}

/**
 * Asserts a server-side invariant with consistent error messaging.
 * Re-exported here so server modules have a single import for config + invariant.
 */
export { invariant };
