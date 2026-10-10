/**
 * Safe URL validation — centralised protection against:
 *   - Open redirects (spec Section 9)
 *   - SSRF (Server-Side Request Forgery)
 *   - JavaScript / data: / file: scheme injection
 *
 * These helpers are used at every site that accepts a user-supplied URL:
 *   - auth `next=` redirect target
 *   - payment callback URLs
 *   - social handles
 *   - portfolio URLs
 *   - advertising creative target URLs
 *   - map / geocoding requests
 *
 * NEVER use `new URL(input)` directly without going through these helpers.
 */

import { logger } from "@/lib/logging";

// ---------------------------------------------------------------------------
// Internal hosts — anything that resolves to these is "internal" and must
// NOT be fetched server-side (SSRF defence). The list is conservative;
// expand only with caution.
// ---------------------------------------------------------------------------
const INTERNAL_HOST_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./, // link-local (incl. AWS metadata service at 169.254.169.254)
  /^0\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i, // IPv6 unique-local
  /^fe[89ab][0-9a-f]:/i, // IPv6 link-local
  /^fd[0-9a-f]{2}:/i, // IPv6 unique-local (fd00::/8)
  /^\.local$/i,
];

// External host allowlist — hosts the application legitimately contacts
// server-side (for provider API calls, map tiles, image hosting).
const EXTERNAL_HOST_ALLOWLIST: readonly string[] = [
  "api.resend.com",
  "api.sendgrid.com",
  "api.postmarkapp.com",
  "api.paystack.com",
  "api.flutterwave.com",
  "tile.openstreetmap.org",
  "staticmap.openstreetmap.de",
  "nominatim.openstreetmap.org",
  "*.supabase.co",
  "*.supabase.in",
];

// ---------------------------------------------------------------------------
// Internal: scheme allowlist.
// ---------------------------------------------------------------------------
const SAFE_URL_SCHEMES: ReadonlySet<string> = new Set([
  "http:",
  "https:",
]);

// Schemes that are ALWAYS forbidden (XSS / data exfiltration vectors).
const FORBIDDEN_SCHEMES: ReadonlySet<string> = new Set([
  "javascript:",
  "data:",
  "file:",
  "vbscript:",
  "blob:", // blob: URLs from other origins can read ours
  "about:",
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SafeUrlOptions {
  /** When true, internal hosts (localhost / private IPs) are rejected. */
  rejectInternal?: boolean;
  /** When true, only the EXTERNAL_HOST_ALLOWLIST is permitted. */
  ssrfMode?: boolean;
  /** Allowed schemes (defaults to http + https). */
  allowedSchemes?: readonly string[];
  /** Optional allowlist of hostnames to permit (in addition to ssrf allowlist). */
  allowedHosts?: readonly string[];
}

/**
 * Returns a safe URL string, or null when the input is unsafe.
 *
 * Never throws — returns null on any parse error so callers can render
 * a safe fallback. The caller MUST treat null as "reject this URL".
 */
export function safeUrl(
  input: string | null | undefined,
  opts: SafeUrlOptions = {},
): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2048) return null;

  // Reject obviously-dangerous schemes up front (before URL parsing,
  // because `new URL("javascript:alert(1)")` parses fine).
  const lower = trimmed.toLowerCase();
  for (const scheme of FORBIDDEN_SCHEMES) {
    if (lower.startsWith(scheme)) {
      logger.warn("safeUrl: rejected forbidden scheme", { scheme });
      return null;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const schemes = opts.allowedSchemes ?? ["http:", "https:"];
  if (!schemes.includes(parsed.protocol)) {
    logger.warn("safeUrl: rejected scheme", { protocol: parsed.protocol });
    return null;
  }

  // Internal host check (SSRF defence).
  if (opts.rejectInternal || opts.ssrfMode) {
    if (isInternalHost(parsed.hostname)) {
      logger.warn("safeUrl: rejected internal host", { host: parsed.hostname });
      return null;
    }
  }

  // Allowlist mode — host must match the external allowlist (+ any
  // extra hosts passed in).
  if (opts.ssrfMode) {
    const allow = [...EXTERNAL_HOST_ALLOWLIST, ...(opts.allowedHosts ?? [])];
    if (!allow.some((h) => matchesHost(parsed.hostname, h))) {
      logger.warn("safeUrl: rejected host not in allowlist", { host: parsed.hostname });
      return null;
    }
  } else if (opts.allowedHosts && opts.allowedHosts.length > 0) {
    if (!opts.allowedHosts.some((h) => matchesHost(parsed.hostname, h))) {
      logger.warn("safeUrl: rejected host not in allowedHosts", { host: parsed.hostname });
      return null;
    }
  }

  // Strip the fragment (carries no security value and can be used for
  // fragment-injection tricks).
  parsed.hash = "";

  return parsed.toString();
}

/**
 * Returns true if the host is internal / private / link-local.
 * Used for SSRF defence.
 */
export function isInternalHost(host: string): boolean {
  const lower = host.toLowerCase();
  for (const pattern of INTERNAL_HOST_PATTERNS) {
    if (pattern.test(lower)) return true;
  }
  return false;
}

/**
 * Returns true if the input host matches the pattern (supports wildcards
 * like `*.supabase.co`).
 */
function matchesHost(host: string, pattern: string): boolean {
  const lowerHost = host.toLowerCase();
  const lowerPattern = pattern.toLowerCase();
  if (lowerPattern.startsWith("*.")) {
    const suffix = lowerPattern.slice(1); // ".supabase.co"
    return lowerHost.endsWith(suffix);
  }
  return lowerHost === lowerPattern;
}

// ---------------------------------------------------------------------------
// Specialised: safe redirect target for `next=` query params.
// Per spec Section 9: open-redirect protection.
// ---------------------------------------------------------------------------

/**
 * Returns a relative path on our own origin that's safe to redirect to.
 * Rejects:
 *   - Absolute URLs (http://other.example.com)
 *   - Protocol-relative URLs (//other.example.com)
 *   - javascript: / data: / file: schemes
 *   - Paths starting with `//` (protocol-relative)
 *   - Admin / API paths (don't let post-auth redirect send users there)
 *
 * Returns the safe path, or the fallback when the input is unsafe.
 */
export function safeRelativeRedirect(
  input: string | null | undefined,
  fallback = "/dashboard",
  opts: { blockedPrefixes?: readonly string[] } = {},
): string {
  if (!input) return fallback;
  const trimmed = input.trim();
  if (!trimmed) return fallback;

  // Must start with a single "/" — not "//" (protocol-relative), not
  // an absolute URL.
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.startsWith("/\\") || trimmed.startsWith("\\/")) return fallback;

  // Reject schemes that slip past the leading-slash check
  // (e.g. "/javascript:alert(1)" — yes, this is a real attack vector).
  const afterSlash = trimmed.slice(1).toLowerCase();
  for (const scheme of FORBIDDEN_SCHEMES) {
    if (afterSlash.startsWith(scheme)) return fallback;
  }

  // Reject known-internal paths we don't want to send post-auth visitors to.
  const blocked = opts.blockedPrefixes ?? ["/admin", "/api", "/forbidden"];
  if (blocked.some((p) => trimmed === p || trimmed.startsWith(`${p}/`))) {
    return fallback;
  }

  return trimmed;
}

/**
 * Returns true if the input is a safe relative path on our origin
 * (starts with "/" but not "//"). Used to validate CTA hrefs in
 * notifications and email templates.
 */
export function isSafeRelativePath(input: string | null | undefined): boolean {
  if (!input) return true;
  const trimmed = input.trim();
  if (!trimmed) return true;
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed.startsWith("/\\")) return false;
  // Reject absolute-scheme URLs that happen to start with /
  // (e.g. "/javascript:alert(1)" — yes, this is a real attack vector).
  const afterSlash = trimmed.slice(1).toLowerCase();
  for (const scheme of FORBIDDEN_SCHEMES) {
    if (afterSlash.startsWith(scheme)) return false;
  }
  return true;
}
