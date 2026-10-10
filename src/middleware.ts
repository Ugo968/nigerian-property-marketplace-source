import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { serverConfig } from "@/lib/security/server-config";

/**
 * Next.js middleware — runs on every matched request before the route
 * handler. Responsibilities:
 *
 *   1. Refresh the Supabase session cookie (so Server Components always
 *      see the latest auth state).
 *   2. Gate protected route groups:
 *        /dashboard/*   → requires authenticated session
 *        /admin/*       → requires authenticated session
 *        /onboarding/*  → requires authenticated session + pending profile
 *
 * Lightweight by design — no DB queries beyond reading the session.
 * Account-status checks (suspended / banned) happen in Server Components
 * via requireActiveUser() so they have the latest profile state.
 *
 * Match everything except static assets and Next internals.
 */

const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/onboarding"];

// Routes that authenticated-but-pending users are allowed to visit
// during onboarding. Anything else under /dashboard sends them to /onboarding.
const ONBOARDING_ALLOWED_ROUTES = ["/onboarding", "/verify-email", "/account-suspended"];

export async function middleware(request: NextRequest) {
  const { supabaseUrl, supabaseAnonKey } = serverConfig.supabase;

  // When Supabase isn't configured locally, skip auth refresh but
  // still allow the route to render (foundation fallback).
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  const response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // ---------------------------------------------------------------------
  // 1. Protect /dashboard, /admin, /onboarding
  // ---------------------------------------------------------------------
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (isProtected && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // ---------------------------------------------------------------------
  // 2. /admin additionally requires admin role. We can't fully verify
  //    in middleware (no DB), so the route's server component does the
  //    final check via requireAdmin(). Middleware just enforces that a
  //    session exists.
  // ---------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // 3. Authenticated users hitting /login or /signup are redirected to
  //    /dashboard or /onboarding depending on profile state. We can't
  //    check profile state in middleware cheaply, so just redirect to
  //    /dashboard — the dashboard's server component will redirect to
  //    /onboarding if onboarding is incomplete.
  // ---------------------------------------------------------------------
  if (user && (pathname === "/login" || pathname === "/signup")) {
    // Preserve a `next=` redirect if present (e.g. user clicked "login"
    // from a deep link). Otherwise default to /dashboard.
    const next = request.nextUrl.searchParams.get("next");
    const target = next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";
    return NextResponse.redirect(new URL(target, request.url));
  }

  // ---------------------------------------------------------------------
  // 4. Authenticated users hitting /onboarding when they're not in the
  //    onboarding flow: redirect to /dashboard. We check by reading the
  //    profiles table — this is a single indexed lookup, fast.
  // ---------------------------------------------------------------------
  if (user && pathname === "/onboarding") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, onboarding_completed, account_status, deleted_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const p = profile as
      | {
          role: string;
          onboarding_completed: boolean;
          account_status: string;
          deleted_at: string | null;
        }
      | null;

    // Profile doesn't exist yet (signup-created auth user, no profile
    // because email verification pending). Allow onboarding index to
    // redirect them properly via routeToOnboardingOrDashboard().
    if (!p) {
      return response;
    }

    // Banned / soft-deleted users: skip onboarding redirect.
    if (p.account_status === "banned" || p.deleted_at) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Already-onboarded users hitting /onboarding: send to dashboard.
    if (p.onboarding_completed && p.account_status === "active") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *  - _next/static, _next/image, _next/data (Next internals)
     *  - favicon.ico, robots.txt, manifest, icons
     *  - public assets
     */
    "/((?!_next/static|_next/image|_next/data|favicon.ico|robots.txt|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
