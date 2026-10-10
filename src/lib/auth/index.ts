/**
 * Auth barrel.
 *
 * Server-only helpers live in `server.ts`. Client-callable auth helpers
 * (signOut, requestPasswordReset) live in `browser.ts`. Server actions
 * (signup, login, logout, onboarding) live in `actions.ts` and
 * `onboarding-actions.ts`.
 */

export * from "./server";
export * from "./browser";
