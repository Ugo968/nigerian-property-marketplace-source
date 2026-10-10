/**
 * Verification tier types.
 *
 * Verification is separate from subscription. Paying for Pro or Premium
 * does NOT automatically grant a verification badge — admins must review
 * and approve.
 *
 * Two badge tiers exist: Bronze (basic) and Blue (advanced).
 * "Eligibility" for a tier is granted by subscription; the actual badge
 * is granted by admin review.
 */

export const VERIFICATION_STATES = [
  "unverified",
  "pending",
  "bronze",
  "blue",
  "rejected",
  "suspended",
  "revoked",
] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const VERIFICATION_STATE_LABELS: Record<VerificationState, string> = {
  unverified: "Unverified",
  pending: "Verification Pending",
  bronze: "Bronze Verified",
  blue: "Blue Verified",
  rejected: "Rejected",
  suspended: "Suspended",
  revoked: "Revoked",
};

/**
 * Whether a state should display a public badge.
 * Pending / rejected / suspended / revoked are NOT shown publicly.
 */
export const PUBLICLY_VISIBLE_BADGE_STATES: VerificationState[] = [
  "bronze",
  "blue",
];

/**
 * Returns the badge CSS variable name for a given verification state.
 * Used by the <VerificationBadge /> component.
 */
export function verificationBadgeToken(
  state: VerificationState,
): "bronze" | "blue" | null {
  if (state === "bronze") return "bronze";
  if (state === "blue") return "blue";
  return null;
}

/**
 * Verification application lifecycle.
 */
export const VERIFICATION_APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "approved",
  "rejected",
  "withdrawn",
  "expired",
] as const;
export type VerificationApplicationStatus =
  (typeof VERIFICATION_APPLICATION_STATUSES)[number];

/**
 * Verification tier the application is targeting.
 */
export const VERIFICATION_TIERS = ["bronze", "blue"] as const;
export type VerificationTier = (typeof VERIFICATION_TIERS)[number];
