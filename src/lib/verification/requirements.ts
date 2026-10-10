import type { UserRole, VerificationTier } from "@/types";

/**
 * Verification requirements — configurable per (role, tier).
 *
 * Per spec Section 10: "Do NOT hard-code all verification requirements
 * directly into React components. Requirements should be configurable."
 *
 * Each requirement has:
 *   - id: stable identifier for the requirements-checklist UI
 *   - label: human-readable description shown to the user
 *   - category: grouping for UI display (profile / documents / contact)
 *   - checkType: how the system verifies the requirement was met
 *
 * When the application is submitted, the server-side eligibility
 * service re-evaluates all requirements before accepting the submission.
 */

export type RequirementCheckType =
  | "profile_completeness" // checked via computeProfileCompleteness()
  | "email_verified" // checked via profiles.email_verified
  | "phone_verified" // checked via profiles.phone_verified
  | "field_present" // a specific field on profiles or role-specific row
  | "document_required" // at least one document of a given type must exist
  | "document_count" // minimum total documents
  | "account_age_days" // account must be at least N days old
  | "previous_tier" // user must hold a lower tier first
  | "custom"; // checked via custom eligibility function

export interface Requirement {
  id: string;
  label: string;
  description: string;
  category: "Profile" | "Documents" | "Contact" | "Account";
  checkType: RequirementCheckType;
  /** For field_present: the column path (e.g. "agent_profiles.license_number"). */
  field?: string;
  /** For document_required: the document type that must be present. */
  documentType?:
    | "government_id"
    | "utility_bill"
    | "proof_of_address"
    | "cac_certificate"
    | "business_license"
    | "professional_certification"
    | "agent_license"
    | "office_lease"
    | "other";
  /** For document_count: minimum number of documents. */
  minCount?: number;
  /** For account_age_days: minimum account age in days. */
  minDays?: number;
  /** For previous_tier: the tier that must already be held. */
  previousTier?: "bronze" | "blue";
  /** For profile_completeness: minimum percentage (0–100). */
  minPercentage?: number;
}

/**
 * Returns the requirements for a (role, tier) pair.
 * Centralised so admin can adjust rules without code changes
 * (when persisted to the DB in a future iteration).
 */
export function getVerificationRequirements(
  role: UserRole,
  tier: VerificationTier,
): Requirement[] {
  if (tier === "bronze") {
    return bronzeRequirements(role);
  }
  return blueRequirements(role);
}

// ---------------------------------------------------------------------------
// Bronze requirements
// ---------------------------------------------------------------------------
function bronzeRequirements(role: UserRole): Requirement[] {
  const base: Requirement[] = [
    {
      id: "profile_completeness_min",
      label: "Profile completeness ≥ 60%",
      description:
        "Your profile must be at least 60% complete before applying.",
      category: "Profile",
      checkType: "profile_completeness",
      minPercentage: 60,
    },
    {
      id: "email_verified",
      label: "Verified email address",
      description:
        "Your email must be verified. Check your inbox for the verification link.",
      category: "Contact",
      checkType: "email_verified",
    },
    {
      id: "profile_photo",
      label: "Profile photo",
      description: "Upload a clear profile photo or company logo.",
      category: "Profile",
      checkType: "field_present",
      field: "profiles.avatar_url",
    },
    {
      id: "identity_document",
      label: "Government-issued ID",
      description:
        "Upload a clear photo of a valid government-issued ID (NIN, driver's licence, international passport, or voter's card).",
      category: "Documents",
      checkType: "document_required",
      documentType: "government_id",
    },
  ];

  if (role === "agent") {
    return [
      ...base,
      {
        id: "professional_name",
        label: "Professional name",
        description: "Provide your professional / display name.",
        category: "Profile",
        checkType: "field_present",
        field: "agent_profiles.professional_name",
      },
      {
        id: "years_of_experience",
        label: "Years of experience",
        description: "Tell us how long you've been working as an agent.",
        category: "Profile",
        checkType: "field_present",
        field: "agent_profiles.years_of_experience",
      },
    ];
  }

  if (role === "company") {
    return [
      ...base,
      {
        id: "company_name",
        label: "Company name",
        description: "Your registered company name.",
        category: "Profile",
        checkType: "field_present",
        field: "company_profiles.company_name",
      },
      {
        id: "office_address",
        label: "Office address",
        description: "Your company's office address.",
        category: "Profile",
        checkType: "field_present",
        field: "company_profiles.office_address",
      },
    ];
  }

  // Landlord — no role-specific additions
  return base;
}

// ---------------------------------------------------------------------------
// Blue requirements
// ---------------------------------------------------------------------------
function blueRequirements(role: UserRole): Requirement[] {
  // Blue requires Bronze first (or equivalent — currently just Bronze).
  const base: Requirement[] = [
    {
      id: "previous_tier_bronze",
      label: "Bronze verification",
      description: "You must hold Bronze verification before applying for Blue.",
      category: "Account",
      checkType: "previous_tier",
      previousTier: "bronze",
    },
    {
      id: "profile_completeness_high",
      label: "Profile completeness ≥ 80%",
      description:
        "Your profile must be at least 80% complete before applying for Blue.",
      category: "Profile",
      checkType: "profile_completeness",
      minPercentage: 80,
    },
    {
      id: "account_age_30_days",
      label: "Account age ≥ 30 days",
      description:
        "Your account must be at least 30 days old before applying for Blue.",
      category: "Account",
      checkType: "account_age_days",
      minDays: 30,
    },
    {
      id: "identity_document_blue",
      label: "Government-issued ID",
      description: "Re-submit a clear photo of a valid government-issued ID.",
      category: "Documents",
      checkType: "document_required",
      documentType: "government_id",
    },
    {
      id: "min_documents_3",
      label: "At least 3 supporting documents",
      description:
        "Upload at least 3 documents total to support your application.",
      category: "Documents",
      checkType: "document_count",
      minCount: 3,
    },
  ];

  if (role === "agent") {
    return [
      ...base,
      {
        id: "agent_license",
        label: "Real-estate agent license",
        description:
          "Upload a valid real-estate agent license or professional certification.",
        category: "Documents",
        checkType: "document_required",
        documentType: "agent_license",
      },
      {
        id: "professional_description",
        label: "Professional description",
        description: "Your professional bio should be filled in.",
        category: "Profile",
        checkType: "field_present",
        field: "agent_profiles.professional_description",
      },
      {
        id: "areas_served",
        label: "Areas served",
        description: "List at least one area you serve.",
        category: "Profile",
        checkType: "field_present",
        field: "profiles.areas_served",
      },
    ];
  }

  if (role === "company") {
    return [
      ...base,
      {
        id: "cac_certificate",
        label: "CAC registration certificate",
        description:
          "Upload your company's CAC registration certificate. This is required for Blue verification.",
        category: "Documents",
        checkType: "document_required",
        documentType: "cac_certificate",
      },
      {
        id: "office_lease",
        label: "Proof of office",
        description:
          "Upload your office lease agreement or a recent utility bill for your office address.",
        category: "Documents",
        checkType: "document_required",
        documentType: "office_lease",
      },
      {
        id: "company_description",
        label: "Company description",
        description: "Your company description should be filled in.",
        category: "Profile",
        checkType: "field_present",
        field: "company_profiles.company_description",
      },
    ];
  }

  // Landlord — Blue is rare but allowed if they want it (Premium tier)
  return base;
}

/**
 * Returns the application timeout in days for a tier.
 * Bronze: 30 days. Blue: 60 days (more docs to gather).
 */
export function getApplicationExpiryDays(tier: VerificationTier): number {
  return tier === "bronze" ? 30 : 60;
}
