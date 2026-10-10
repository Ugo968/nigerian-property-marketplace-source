import type { UserRole, VerificationTier } from "@/types";
import { capabilitiesFor } from "@/lib/capabilities";
import { computeProfileCompleteness } from "@/lib/profiles/completeness";
import type {
  ProfileRow,
  LandlordProfileRow,
  AgentProfileRow,
  CompanyProfileRow,
  VerificationApplicationRow,
} from "@/types";
import { getVerificationRequirements } from "./requirements";

/**
 * Verification eligibility service.
 *
 * Per spec Section 8: "Do NOT scatter checks throughout the UI. Create
 * a reusable capability/eligibility service."
 *
 * The single public entry point is `canApplyForVerification(...)` which
 * returns an exhaustive eligibility result — UI components render the
 * reason list as a checklist, server actions re-check before persisting.
 *
 * Per spec Section 7 (CRITICAL BUSINESS RULE):
 *   Payment does NOT equal verification.
 *   - Pro subscription grants BRONZE ELIGIBILITY (the right to APPLY)
 *   - Premium subscription grants BLUE ELIGIBILITY (the right to APPLY)
 *   - The actual badge is granted by admin review only.
 *
 * No code path anywhere converts subscription_tier into verification_state.
 */

export interface EligibilityResult {
  /** True if the user can submit a NEW application for this tier right now. */
  canApply: boolean;
  /** Human-readable reasons why the user cannot apply (if any). */
  blockingReasons: string[];
  /** What the user needs to do to become eligible. */
  checklist: Array<{
    label: string;
    description: string;
    /** True when the requirement is currently met. */
    complete: boolean;
  }>;
  /** True if the user is already at or above the requested tier. */
  alreadyHasTier: boolean;
  /** True if the user has a pending application for this tier. */
  hasPendingApplication: boolean;
}

/**
 * Returns the eligibility result for applying to a verification tier.
 *
 * Inputs:
 *   - role + tier + verificationState: current state of the user
 *   - subscriptionTier: capability derivation
 *   - profile + roleSpecific: completeness calculation
 *   - existingApplications: history of applications
 */
export function canApplyForVerification(input: {
  role: UserRole;
  tier: VerificationTier;
  verificationState: ProfileRow["verification_state"];
  subscriptionTier: ProfileRow["subscription_tier"];
  emailVerified: boolean;
  phoneVerified: boolean;
  accountCreatedAt: string; // ISO
  profile: ProfileRow;
  roleSpecific:
    | LandlordProfileRow
    | AgentProfileRow
    | CompanyProfileRow
    | null;
  existingApplications: VerificationApplicationRow[];
}): EligibilityResult {
  const {
    role,
    tier,
    verificationState,
    subscriptionTier,
    emailVerified,
    phoneVerified,
    accountCreatedAt,
    profile,
    roleSpecific,
    existingApplications,
  } = input;

  const caps = capabilitiesFor(role, subscriptionTier);
  const blockingReasons: string[] = [];
  const checklist: EligibilityResult["checklist"] = [];

  // ---------------------------------------------------------------------
  // 1. Account-level checks
  // ---------------------------------------------------------------------
  if (verificationState === "suspended" || verificationState === "revoked") {
    blockingReasons.push(
      `Your verification is currently ${verificationState}. Contact support before applying again.`,
    );
  }

  if (profile.account_status !== "active") {
    blockingReasons.push(
      "Your account must be active before applying for verification.",
    );
  }

  // ---------------------------------------------------------------------
  // 2. Subscription eligibility (NOT auto-grant — just permission to APPLY)
  // ---------------------------------------------------------------------
  const tierEligible = tier === "bronze" ? caps.eligibleForBronze : caps.eligibleForBlue;
  if (!tierEligible) {
    if (tier === "bronze") {
      blockingReasons.push(
        `Bronze verification requires a Pro subscription. Upgrade to Pro to apply.`,
      );
    } else {
      blockingReasons.push(
        `Blue verification requires a Premium subscription. Upgrade to Premium to apply.`,
      );
    }
  }

  // ---------------------------------------------------------------------
  // 3. Already at or above tier?
  // ---------------------------------------------------------------------
  const alreadyHasTier =
    (tier === "bronze" && verificationState === "bronze") ||
    (tier === "blue" && verificationState === "blue") ||
    (tier === "bronze" && verificationState === "blue"); // blue implies bronze

  // ---------------------------------------------------------------------
  // 4. Pending application?
  // ---------------------------------------------------------------------
  const hasPendingApplication = existingApplications.some(
    (a) => a.tier === tier && (a.status === "submitted" || a.status === "in_review"),
  );

  if (hasPendingApplication) {
    blockingReasons.push(
      `You already have a pending ${tier} application. We'll review it before you can submit a new one.`,
    );
  }

  // ---------------------------------------------------------------------
  // 5. Blue requires Bronze first (or currently bronze)
  // ---------------------------------------------------------------------
  if (tier === "blue" && verificationState !== "bronze" && verificationState !== "blue") {
    blockingReasons.push(
      "Blue verification requires Bronze verification first. Apply for Bronze before Blue.",
    );
  }

  // ---------------------------------------------------------------------
  // 6. Build the requirements checklist — drives the UI checklist
  // ---------------------------------------------------------------------
  const requirements = getVerificationRequirements(role, tier);
  const completeness = computeProfileCompleteness(role, profile, roleSpecific);

  for (const req of requirements) {
    let complete = false;

    switch (req.checkType) {
      case "profile_completeness": {
        const minPct = req.minPercentage ?? 0;
        complete = completeness.percentage >= minPct;
        if (!complete) {
          blockingReasons.push(
            `Profile completeness must be at least ${minPct}%. You're currently at ${completeness.percentage}%.`,
          );
        }
        break;
      }
      case "email_verified":
        complete = emailVerified;
        if (!complete) {
          blockingReasons.push("Verify your email address before applying.");
        }
        break;
      case "phone_verified":
        complete = phoneVerified;
        if (!complete) {
          blockingReasons.push("Verify your phone number before applying.");
        }
        break;
      case "field_present": {
        const value = getFieldValue(profile, roleSpecific, req.field);
        complete = Boolean(value && String(value).trim().length > 0);
        if (!complete) {
          blockingReasons.push(`${req.label} is required.`);
        }
        break;
      }
      case "document_required":
        // Documents are uploaded DURING the application flow, not before.
        // We can't check them at eligibility time. Show as "not yet" in
        // the checklist but DON'T block eligibility — the server re-checks
        // at submit time.
        complete = false;
        break;
      case "document_count":
        // Same — document count is checked at submit time, not eligibility time.
        complete = false;
        break;
      case "account_age_days": {
        const minDays = req.minDays ?? 0;
        const ageMs = Date.now() - new Date(accountCreatedAt).getTime();
        const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
        complete = ageDays >= minDays;
        if (!complete) {
          blockingReasons.push(
            `Your account must be at least ${minDays} days old (currently ${ageDays} days).`,
          );
        }
        break;
      }
      case "previous_tier": {
        const required = req.previousTier;
        complete =
          (required === "bronze" &&
            (verificationState === "bronze" || verificationState === "blue")) ||
          (required === "blue" && verificationState === "blue");
        if (!complete) {
          blockingReasons.push(`You must hold ${required} verification first.`);
        }
        break;
      }
      case "custom":
        // Future: hook for custom checks
        break;
    }

    checklist.push({
      label: req.label,
      description: req.description,
      complete,
    });
  }

  // ---------------------------------------------------------------------
  // 7. Final eligibility decision
  // ---------------------------------------------------------------------
  const canApply =
    blockingReasons.length === 0 &&
    !alreadyHasTier &&
    !hasPendingApplication;

  return {
    canApply,
    blockingReasons,
    checklist,
    alreadyHasTier,
    hasPendingApplication,
  };
}

// ---------------------------------------------------------------------------
// Field access helper — used by the eligibility service to check whether
// a particular field is filled in. Looks across profile + role-specific
// rows using a dotted path like "agent_profiles.professional_name".
// ---------------------------------------------------------------------------

function getFieldValue(
  profile: ProfileRow,
  roleSpecific:
    | LandlordProfileRow
    | AgentProfileRow
    | CompanyProfileRow
    | null,
  path: string | undefined,
): unknown {
  if (!path) return null;
  const [table, column] = path.split(".");

  if (table === "profiles") {
    return (profile as Record<string, unknown>)[column];
  }

  if (!roleSpecific) return null;
  return (roleSpecific as Record<string, unknown>)[column];
}

/**
 * Map an application status to the verification_state on the profile.
 * Used by the admin review server action to atomically update both.
 *
 * Per spec Section 14:
 *   application submitted → verification_state = pending
 *   application approved (bronze) → verification_state = bronze
 *   application approved (blue) → verification_state = blue
 *   application rejected → verification_state = rejected
 *
 * Withdrawn / expired / draft do NOT change verification_state — the
 * previous state is preserved.
 */
export function mapApplicationStatusToVerificationState(
  applicationStatus: VerificationApplicationRow["status"],
  tier: VerificationTier,
): ProfileRow["verification_state"] | null {
  switch (applicationStatus) {
    case "submitted":
    case "in_review":
      return "pending";
    case "approved":
      return tier; // 'bronze' or 'blue'
    case "rejected":
      return "rejected";
    case "withdrawn":
    case "expired":
    case "draft":
      return null; // don't change verification_state
  }
}
