import type { UserRole } from "@/types";
import type {
  ProfileRow,
  LandlordProfileRow,
  AgentProfileRow,
  CompanyProfileRow,
} from "@/types";

/**
 * Profile completeness calculator.
 *
 * Returns a 0–100 percentage based on the role-specific fields the user
 * has filled in. Each field has a weight that reflects its importance
 * to marketplace trust (photo is heaviest; bio matters; contact info
 * matters; etc.).
 *
 * Important: the calculation is honest, not gamified. We don't inflate
 * the percentage to push users to fill in low-value fields. A profile
 * that has every required field for marketplace participation scores
 * ~80–100; a bare-minimum profile scores ~40–60.
 *
 * The same weights drive the UI checklist AND the search-ranking
 * "listing completeness" signal — there is one source of truth.
 */

export interface ProfileCompletenessResult {
  percentage: number; // 0–100
  /** Field-level breakdown for UI display ("Photo ✓", "Bio ✗"). */
  checklist: Array<{ label: string; weight: number; complete: boolean }>;
  /** True when the profile meets the minimum bar for marketplace access. */
  meetsMinimum: boolean;
}

interface Field {
  label: string;
  weight: number; // sums to 100 within each role
  complete: boolean;
}

// ---------------------------------------------------------------------------
// LANDLORD
// ---------------------------------------------------------------------------
const LANDLORD_FIELDS: Array<{
  label: string;
  weight: number;
  check: (profile: ProfileRow, landlord: LandlordProfileRow | null) => boolean;
}> = [
  { label: "Full name", weight: 15, check: (p) => Boolean(p.full_name?.trim()) },
  { label: "Profile photo", weight: 20, check: (p) => Boolean(p.avatar_url) },
  { label: "Phone number", weight: 15, check: (p) => Boolean(p.phone) },
  { label: "Preferred location", weight: 15, check: (p) => Boolean(p.preferred_location?.trim()) },
  { label: "Short bio", weight: 15, check: (p) => Boolean(p.bio?.trim()) },
  {
    label: "Preferred contact method",
    weight: 10,
    check: (_p, l) => Boolean(l?.preferred_contact_method),
  },
  {
    label: "Ownership summary",
    weight: 10,
    check: (_p, l) => Boolean(l?.ownership_summary?.trim()),
  },
];

// ---------------------------------------------------------------------------
// AGENT
// ---------------------------------------------------------------------------
const AGENT_FIELDS: Array<{
  label: string;
  weight: number;
  check: (profile: ProfileRow, agent: AgentProfileRow | null) => boolean;
}> = [
  { label: "Full name", weight: 10, check: (p) => Boolean(p.full_name?.trim()) },
  { label: "Profile photo", weight: 15, check: (p) => Boolean(p.avatar_url) },
  { label: "Phone number", weight: 10, check: (p) => Boolean(p.phone) },
  { label: "Bio", weight: 10, check: (p) => Boolean(p.bio?.trim()) },
  {
    label: "Professional name",
    weight: 10,
    check: (_p, a) => Boolean(a?.professional_name?.trim()),
  },
  {
    label: "Years of experience",
    weight: 10,
    check: (_p, a) => typeof a?.years_of_experience === "number" && a.years_of_experience >= 0,
  },
  {
    label: "Areas served",
    weight: 15,
    check: (p, _a) => Array.isArray(p.areas_served) && (p.areas_served?.length ?? 0) > 0,
  },
  {
    label: "Agency / company",
    weight: 5,
    check: (_p, a) => Boolean(a?.agency_name?.trim()),
  },
  {
    label: "Professional information",
    weight: 10,
    check: (_p, a) => Boolean(a?.professional_description?.trim()),
  },
  {
    label: "Portfolio / website",
    weight: 5,
    check: (_p, a) => Boolean(a?.portfolio_url?.trim()),
  },
];

// ---------------------------------------------------------------------------
// COMPANY
// ---------------------------------------------------------------------------
const COMPANY_FIELDS: Array<{
  label: string;
  weight: number;
  check: (profile: ProfileRow, company: CompanyProfileRow | null) => boolean;
}> = [
  { label: "Company name", weight: 15, check: (p, c) => Boolean(p.full_name?.trim() || c?.company_name?.trim()) },
  { label: "Company logo", weight: 15, check: (_p, c) => Boolean(c?.company_logo_url?.trim()) },
  { label: "Company description", weight: 15, check: (_p, c) => Boolean(c?.company_description?.trim()) },
  { label: "Office address", weight: 10, check: (_p, c) => Boolean(c?.office_address?.trim()) },
  { label: "Office state", weight: 10, check: (_p, c) => Boolean(c?.office_state?.trim()) },
  { label: "Phone number", weight: 10, check: (p) => Boolean(p.phone) },
  { label: "Website", weight: 5, check: (_p, c) => Boolean(c?.website?.trim()) },
  { label: "CAC registration", weight: 15, check: (_p, c) => Boolean(c?.cac_registered && c?.cac_registration_number?.trim()) },
  { label: "Social media", weight: 5, check: (_p, c) => Boolean(c?.social_handles && Object.keys(c.social_handles).length > 0) },
];

/**
 * Compute profile completeness for a (profile, role-specific-row) pair.
 * The caller fetches the role-specific row before calling.
 */
export function computeProfileCompleteness(
  role: UserRole,
  profile: ProfileRow,
  roleSpecific:
    | LandlordProfileRow
    | AgentProfileRow
    | CompanyProfileRow
    | null,
): ProfileCompletenessResult {
  const fields =
    role === "landlord"
      ? LANDLORD_FIELDS
      : role === "agent"
        ? AGENT_FIELDS
        : COMPANY_FIELDS;

  const checklist = fields.map((f) => ({
    label: f.label,
    weight: f.weight,
    complete: f.check(profile, roleSpecific as never),
  }));

  const sum = checklist.reduce(
    (acc, item) => acc + (item.complete ? item.weight : 0),
    0,
  );

  // The minimum bar: required fields complete (the heaviest-weighted
  // ones — name, photo, phone, plus role-specific minimum).
  const minimumFieldLabels =
    role === "landlord"
      ? ["Full name", "Phone number", "Preferred location"]
      : role === "agent"
        ? [
            "Full name",
            "Phone number",
            "Professional name",
            "Areas served",
          ]
        : [
            "Company name",
            "Company description",
            "Office address",
            "Phone number",
          ];

  const meetsMinimum = checklist
    .filter((item) => minimumFieldLabels.includes(item.label))
    .every((item) => item.complete);

  return {
    percentage: sum,
    checklist,
    meetsMinimum,
  };
}

/**
 * Convenience: returns true if a profile is "complete enough" to access
 * the marketplace (publish properties, apply to properties, message).
 *
 * In the application layer, this gates whether onboarding is "done" and
 * the user can proceed to /dashboard.
 */
export function isOnboardingComplete(
  role: UserRole,
  profile: ProfileRow,
  roleSpecific:
    | LandlordProfileRow
    | AgentProfileRow
    | CompanyProfileRow
    | null,
): boolean {
  return computeProfileCompleteness(role, profile, roleSpecific)
    .meetsMinimum;
}
