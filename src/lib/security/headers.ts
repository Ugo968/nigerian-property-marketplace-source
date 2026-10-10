/**
 * Security headers applied to every response.
 *
 * Used in next.config.ts via the `headers()` export. Centralised here
 * so the security posture is auditable in one place.
 */

export interface SecurityHeadersConfig {
  /** Browser XSS protection (legacy but still useful). */
  xssProtection: string;
  /** Disable MIME-sniffing on responses. */
  nosniff: string;
  /** Prevent clickjacking via iframe embedding. */
  frameGuard: string;
  /** Controls referrer information sent on outbound links. */
  referrerPolicy: string;
  /** Restrict loaded resources to known origins. */
  contentSecurityPolicy: string;
  /** Permit cross-origin isolation if needed. */
  permissionsPolicy: string;
}

export const securityHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-DNS-Prefetch-Control": "off",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

/**
 * CSP is intentionally permissive in development so Next.js fast-refresh
 * and inline styles work. Tightened in production.
 */
export function buildContentSecurityPolicy(opts: {
  appUrl: string;
  supabaseUrl?: string;
  mapsProviderUrl?: string;
  isProduction: boolean;
}): string {
  const { appUrl, supabaseUrl, mapsProviderUrl, isProduction } = opts;
  const connectSources = [
    "'self'",
    appUrl,
    supabaseUrl,
    mapsProviderUrl,
    "https://*.paystack.com",
    "https://api.flutterwave.com",
    "https://tile.openstreetmap.org",
  ]
    .filter(Boolean)
    .join(" ");

  if (!isProduction) {
    return [
      "default-src 'self'",
      `connect-src ${connectSources} ws: wss:`,
      // Allow Next.js dev inline styles + eval for HMR
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
    ].join("; ");
  }

  return [
    "default-src 'self'",
    `connect-src ${connectSources}`,
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.paystack.com https://api.flutterwave.com",
  ].join("; ");
}
