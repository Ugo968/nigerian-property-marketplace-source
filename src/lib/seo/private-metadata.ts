import type { Metadata } from "next";

/**
 * Metadata for private/authenticated routes.
 *
 * Per spec Section 19 (SEO / public launch): private pages must not
 * be indexable. This includes /dashboard, /admin, /onboarding, and
 * all auth pages (login, signup, password reset, etc.).
 *
 * Usage:
 *   import { privateRouteMetadata } from "@/lib/seo/private-metadata";
 *   export const metadata = privateRouteMetadata;
 */

export const privateRouteMetadata: Metadata = {
  title: {
    default: "Shelty",
    template: "%s · Shelty",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};
