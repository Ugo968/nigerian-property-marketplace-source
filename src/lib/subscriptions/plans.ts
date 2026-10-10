import type {
  SubscriptionPlan,
  SubscriptionTier,
  UserRole,
  PlanKey,
} from "@/types";

/**
 * MASTER SUBSCRIPTION PLAN MATRIX
 * --------------------------------
 * Source of truth for pricing. NEVER hard-code Naira amounts elsewhere.
 *
 * All amounts are in Naira per month. ₦0 = free.
 *
 * Pricing was specified in the Master Product Specification — DO NOT change.
 *
 * Landlord:  Free ₦0  | Pro ₦3,500  | Premium ₦9,500
 * Agent:      Free ₦0  | Pro ₦5,000  | Premium ₦12,000
 * Company:    Free ₦0  | Pro ₦20,000 | Premium ₦35,000+ (base; variable)
 * Tenant:     Free ₦0 (7-day trial) | Pro ₦1,500 | (no premium tier)
 *
 * "Premium ₦35,000+" for Company means ₦35,000 is the BASE — campaigns,
 * extra featured-credit top-ups, and extra team seats may push the actual
 * charged amount above the base.
 */

const LANDLORD_PLANS: SubscriptionPlan[] = [
  {
    role: "landlord",
    tier: "free",
    priceNaira: 0,
    isDefault: true,
    tagline: "List your property and connect with agents.",
    highlights: [
      "Up to 5 property photos",
      "No property videos",
      "Basic search",
      "Receive agent applications",
      "Chat with applicants",
      "Application tracking",
      "Reviews & ratings",
      "Basic analytics",
      "Basic property alerts",
      "Featured listings paid separately",
    ],
    sellable: true,
  },
  {
    role: "landlord",
    tier: "pro",
    priceNaira: 3500,
    isDefault: false,
    tagline: "More visibility and tools for active landlords.",
    highlights: [
      "Up to 25 property photos",
      "Up to 2 videos per property",
      "Advanced search",
      "Advanced analytics",
      "3 saved searches",
      "Advanced alerts",
      "Eligible for verification",
      "Featured listing credits included",
      "Search ranking boost",
      "Limited homepage exposure",
      "Priority support",
      "Social media handles",
    ],
    sellable: true,
  },
  {
    role: "landlord",
    tier: "premium",
    priceNaira: 9500,
    isDefault: false,
    tagline: "Everything Pro, plus premium exposure and analytics.",
    highlights: [
      "Unlimited photos (fair-use applies)",
      "Property videos",
      "Advanced search",
      "Full analytics",
      "Unlimited saved searches",
      "Real-time alerts",
      "Eligible for verification",
      "More featured listing credits",
      "Priority search ranking",
      "Priority homepage exposure",
      "Bulk management",
      "Social media handles",
      "Priority support",
    ],
    sellable: true,
  },
];

const AGENT_PLANS: SubscriptionPlan[] = [
  {
    role: "agent",
    tier: "free",
    priceNaira: 0,
    isDefault: true,
    tagline: "Start discovering properties and applying to represent them.",
    highlights: [
      "Browse properties",
      "Basic search",
      "10 applications / month",
      "Chat (per plan limits)",
      "Basic application functionality",
      "Reviews & ratings",
      "10 saved properties",
      "3 saved searches",
      "Basic alerts",
      "No verification badge",
    ],
    sellable: true,
  },
  {
    role: "agent",
    tier: "pro",
    priceNaira: 5000,
    isDefault: false,
    tagline: "Higher limits and Bronze verification eligibility.",
    highlights: [
      "Advanced search",
      "25 applications / month",
      "Chat (per plan limits)",
      "Application tracking",
      "25 saved properties",
      "15 saved searches",
      "Instant alerts",
      "Bronze verification eligibility",
      "Advanced analytics",
      "Featured / visibility benefits",
      "Search ranking boost",
      "Priority support",
      "Social media handles",
    ],
    sellable: true,
  },
  {
    role: "agent",
    tier: "premium",
    priceNaira: 12000,
    isDefault: false,
    tagline: "Unlimited activity and Blue verification eligibility.",
    highlights: [
      "Advanced search",
      "Unlimited applications (fair-use applies)",
      "Unlimited saved properties",
      "Unlimited saved searches",
      "Instant + Priority alerts",
      "Blue verification eligibility",
      "Full analytics",
      "Priority search visibility",
      "Featured profile",
      "Priority support",
      "Social media handles",
    ],
    sellable: true,
  },
];

const COMPANY_PLANS: SubscriptionPlan[] = [
  {
    role: "company",
    tier: "free",
    priceNaira: 0,
    isDefault: true,
    tagline: "List company properties and receive agent applications.",
    highlights: [
      "Up to 10 property listings / month",
      "Up to 3 photos per listing",
      "No listing videos",
      "Basic search",
      "Receive agent applications",
      "Chat (per plan limits)",
      "Application tracking",
      "Reviews & ratings",
      "Basic saved-search functionality",
      "Basic alerts",
      "Verification application",
      "Basic analytics",
      "Featured listings paid separately",
      "1 team / staff account",
    ],
    sellable: true,
  },
  {
    role: "company",
    tier: "pro",
    priceNaira: 20000,
    isDefault: false,
    tagline: "Higher limits and Bronze verification eligibility.",
    highlights: [
      "Up to 20 property listings / month",
      "Up to 5 photos per listing",
      "Up to 2 videos per listing",
      "Advanced search",
      "Receive agent applications",
      "Application tracking",
      "Reviews & ratings",
      "Saved searches",
      "Advanced alerts",
      "Bronze verification eligibility",
      "Advanced analytics",
      "Featured listing credits included",
      "Search ranking boost",
      "Bulk management",
      "5 team / staff accounts",
      "Priority support",
    ],
    sellable: true,
  },
  {
    role: "company",
    tier: "premium",
    priceNaira: 35000,
    isDefault: false,
    tagline: "Unlimited capacity and Blue verification eligibility.",
    highlights: [
      "Unlimited listings (fair-use applies)",
      "Unlimited listing media (fair-use applies)",
      "Advanced search",
      "Unlimited saved searches",
      "Real-time alerts",
      "Blue verification eligibility",
      "Real-time analytics",
      "More featured listing credits",
      "Priority search ranking",
      "Bulk management",
      "Unlimited team / staff accounts",
      "Dedicated support",
      "Social media handles",
    ],
    sellable: true,
  },
];

// ---------------------------------------------------------------------------
// TENANT PLANS (spec Section 2: ₦1,500/month, 7-day free trial)
// ---------------------------------------------------------------------------

const TENANT_PLANS: SubscriptionPlan[] = [
  {
    role: "tenant",
    tier: "free",
    priceNaira: 0,
    isDefault: true,
    tagline: "7-day free trial. Browse up to 10 listings.",
    highlights: [
      "7-day free trial",
      "Browse up to 10 listings",
      "Search and filter properties",
      "View public property details",
      "Save preferences",
    ],
    sellable: false,
  },
  {
    role: "tenant",
    tier: "pro",
    priceNaira: 1500,
    isDefault: false,
    tagline: "Full tenant access. Contact landlords directly.",
    highlights: [
      "Browse all listings",
      "Advanced search and filters",
      "Contact landlords directly",
      "Save properties",
      "Save searches",
      "Property alerts",
      "Manage enquiries",
      "Report suspicious listings",
    ],
    sellable: true,
  },
];

/**
 * Complete plan matrix indexed by PlanKey = `${role}-${tier}`.
 */
export const PLANS: Record<PlanKey, SubscriptionPlan> = [
  ...LANDLORD_PLANS,
  ...TENANT_PLANS,
  ...AGENT_PLANS,
  ...COMPANY_PLANS,
].reduce<Record<PlanKey, SubscriptionPlan>>((acc, plan) => {
  acc[`${plan.role}-${plan.tier}` as PlanKey] = plan;
  return acc;
}, {} as Record<PlanKey, SubscriptionPlan>);

/**
 * Plans for a given role, in tier order (free → pro → premium).
 * Tenants only have free + pro (no premium tier); the returned array
 * is filtered to exclude undefined entries.
 */
export function plansForRole(role: UserRole): SubscriptionPlan[] {
  return (["free", "pro", "premium"] as SubscriptionTier[])
    .map((tier) => PLANS[`${role}-${tier}` as PlanKey])
    .filter(Boolean) as SubscriptionPlan[];
}

/**
 * Look up a single plan. Throws if the (role, tier) pair is invalid.
 */
export function getPlan(role: UserRole, tier: SubscriptionTier) {
  const plan = PLANS[`${role}-${tier}` as PlanKey];
  if (!plan) {
    throw new Error(`No plan found for role=${role}, tier=${tier}`);
  }
  return plan;
}

/**
 * Default (free) plan for a role.
 */
export function getDefaultPlan(role: UserRole): SubscriptionPlan {
  return getPlan(role, "free");
}

/**
 * Format a Naira amount for display.
 * ₦3,500  |  ₦0  |  ₦35,000+
 */
export function formatNaira(amount: number, suffixPlus = false): string {
  const formatted = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
  return suffixPlus ? `${formatted}+` : formatted;
}

/**
 * Whether this plan's price is variable (only Company Premium, ₦35,000+).
 */
export function isVariablePricePlan(role: UserRole, tier: SubscriptionTier) {
  return role === "company" && tier === "premium";
}
