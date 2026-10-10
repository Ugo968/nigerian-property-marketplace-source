import type { UserRole, SubscriptionTier } from "@/types";
import { getPlan } from "@/lib/subscriptions/plans";

/**
 * CAPABILITY SYSTEM
 * -----------------
 *
 * Centralised so subscription rules can evolve without rewriting the
 * application. Code should NEVER do `if plan === "premium"` — it should
 * ask `capabilities(user).canUseBulkManagement` instead.
 *
 * Capabilities are derived from (role, tier) at runtime. When a feature
 * needs to be granted to a different tier later, change ONLY this file.
 */

export interface Capabilities {
  // Property listings
  maxListingsPerMonth: number | null; // null = unlimited (fair-use applies)
  maxPhotosPerListing: number;
  maxVideosPerListing: number;

  // Search & discovery
  advancedSearch: boolean;
  searchRankingBoost: boolean;
  prioritySearchRanking: boolean;
  homepageExposure: "none" | "limited" | "priority";
  featuredProfile: boolean;

  // Saved items
  maxSavedProperties: number | null;
  maxSavedSearches: number | null;
  alertLevel: "off" | "basic" | "advanced" | "instant" | "priority";

  // Applications (agent-facing)
  maxApplicationsPerMonth: number | null;

  // Messaging
  /** Max NEW conversations allowed per month. Existing conversations never destroyed. */
  maxNewConversationsPerMonth: number | null;

  // Verification
  eligibleForBronze: boolean;
  eligibleForBlue: boolean;

  // Featured listings & advertising
  featuredListingCreditsPerMonth: number;
  canPurchaseFeaturedListings: boolean;
  canPurchaseAdvertising: boolean;

  // Analytics
  analyticsTier: "basic" | "advanced" | "full" | "realtime";

  // Team / staff (Company-only concept; for Landlord & Agent always 0)
  maxTeamMembers: number | null;

  // Support
  supportTier: "standard" | "priority" | "dedicated";

  // Social / branding
  canShowSocialMediaHandles: boolean;
  canBulkManage: boolean;
}

/**
 * Hard "fair-use" ceilings — applied even when a plan says "unlimited".
 * These prevent abuse and keep the platform viable.
 */
export const FAIR_USE_CEILINGS = {
  maxListingsPerMonth: 500,
  maxSavedProperties: 1000,
  maxSavedSearches: 100,
  maxApplicationsPerMonth: 500,
  maxNewConversationsPerMonth: 1000,
  maxPhotosPerListing: 100,
  maxVideosPerListing: 10,
  maxTeamMembers: 50,
} as const;

/**
 * Compose a Capabilities object for a (role, tier) pair.
 * Central definition — referenced by feature flags throughout the app.
 */
export function capabilitiesFor(
  role: UserRole,
  tier: SubscriptionTier,
): Capabilities {
  // Easier-to-read switch than a giant lookup table.
  switch (`${role}-${tier}` as const) {
    case "landlord-free":
      return {
        maxListingsPerMonth: 5,
        maxPhotosPerListing: 5,
        maxVideosPerListing: 0,
        advancedSearch: false,
        searchRankingBoost: false,
        prioritySearchRanking: false,
        homepageExposure: "none",
        featuredProfile: false,
        maxSavedProperties: 10,
        maxSavedSearches: 1,
        alertLevel: "basic",
        maxApplicationsPerMonth: null, // landlord receives applications
        // Per spec Section 27: landlords can chat — no new-conversation limit
        maxNewConversationsPerMonth: null,
        eligibleForBronze: false,
        eligibleForBlue: false,
        featuredListingCreditsPerMonth: 0,
        canPurchaseFeaturedListings: true,
        canPurchaseAdvertising: false,
        analyticsTier: "basic",
        maxTeamMembers: 0,
        supportTier: "standard",
        canShowSocialMediaHandles: false,
        canBulkManage: false,
      };

    case "landlord-pro":
      return {
        maxListingsPerMonth: 25,
        maxPhotosPerListing: 25,
        maxVideosPerListing: 2,
        advancedSearch: true,
        searchRankingBoost: true,
        prioritySearchRanking: false,
        homepageExposure: "limited",
        featuredProfile: false,
        maxSavedProperties: 50,
        maxSavedSearches: 3,
        alertLevel: "advanced",
        maxApplicationsPerMonth: null,
        // Per spec Section 27: landlords can chat — no new-conversation limit
        maxNewConversationsPerMonth: null,
        eligibleForBronze: true,
        eligibleForBlue: false,
        featuredListingCreditsPerMonth: 1,
        canPurchaseFeaturedListings: true,
        canPurchaseAdvertising: false,
        analyticsTier: "advanced",
        maxTeamMembers: 0,
        supportTier: "priority",
        // Per spec Section 23: social media handles are Premium-only.
        canShowSocialMediaHandles: false,
        canBulkManage: false,
      };

    case "landlord-premium":
      return {
        maxListingsPerMonth: FAIR_USE_CEILINGS.maxListingsPerMonth,
        maxPhotosPerListing: FAIR_USE_CEILINGS.maxPhotosPerListing,
        maxVideosPerListing: FAIR_USE_CEILINGS.maxVideosPerListing,
        advancedSearch: true,
        searchRankingBoost: true,
        prioritySearchRanking: true,
        homepageExposure: "priority",
        featuredProfile: false,
        maxSavedProperties: FAIR_USE_CEILINGS.maxSavedProperties,
        maxSavedSearches: FAIR_USE_CEILINGS.maxSavedSearches,
        alertLevel: "priority",
        maxApplicationsPerMonth: null,
        maxNewConversationsPerMonth: FAIR_USE_CEILINGS.maxNewConversationsPerMonth,
        eligibleForBronze: true,
        eligibleForBlue: true,
        featuredListingCreditsPerMonth: 3,
        canPurchaseFeaturedListings: true,
        canPurchaseAdvertising: false,
        analyticsTier: "full",
        maxTeamMembers: 0,
        supportTier: "priority",
        canShowSocialMediaHandles: true,
        canBulkManage: true,
      };

    case "agent-free":
      return {
        maxListingsPerMonth: 0, // agents don't list — they apply to represent
        maxPhotosPerListing: 0,
        maxVideosPerListing: 0,
        advancedSearch: false,
        searchRankingBoost: false,
        prioritySearchRanking: false,
        homepageExposure: "none",
        featuredProfile: false,
        maxSavedProperties: 10,
        maxSavedSearches: 3,
        alertLevel: "basic",
        maxApplicationsPerMonth: 10,
        maxNewConversationsPerMonth: 10,
        eligibleForBronze: false,
        eligibleForBlue: false,
        featuredListingCreditsPerMonth: 0,
        canPurchaseFeaturedListings: false,
        canPurchaseAdvertising: false,
        analyticsTier: "basic",
        maxTeamMembers: 0,
        supportTier: "standard",
        canShowSocialMediaHandles: false,
        canBulkManage: false,
      };

    case "agent-pro":
      return {
        maxListingsPerMonth: 0,
        maxPhotosPerListing: 0,
        maxVideosPerListing: 0,
        advancedSearch: true,
        searchRankingBoost: true,
        prioritySearchRanking: false,
        homepageExposure: "none",
        featuredProfile: false,
        maxSavedProperties: 25,
        maxSavedSearches: 15,
        alertLevel: "instant",
        maxApplicationsPerMonth: 25,
        // Per spec Section 27: agent Pro = 25 new conversations/month
        maxNewConversationsPerMonth: 25,
        eligibleForBronze: true,
        eligibleForBlue: false,
        featuredListingCreditsPerMonth: 0,
        canPurchaseFeaturedListings: false,
        canPurchaseAdvertising: false,
        analyticsTier: "advanced",
        maxTeamMembers: 0,
        supportTier: "priority",
        // Per spec Section 23: social media handles are Premium-only.
        canShowSocialMediaHandles: false,
        canBulkManage: false,
      };

    case "agent-premium":
      return {
        maxListingsPerMonth: 0,
        maxPhotosPerListing: 0,
        maxVideosPerListing: 0,
        advancedSearch: true,
        searchRankingBoost: true,
        prioritySearchRanking: true,
        homepageExposure: "none",
        featuredProfile: true,
        maxSavedProperties: FAIR_USE_CEILINGS.maxSavedProperties,
        maxSavedSearches: FAIR_USE_CEILINGS.maxSavedSearches,
        alertLevel: "priority",
        maxApplicationsPerMonth: FAIR_USE_CEILINGS.maxApplicationsPerMonth,
        maxNewConversationsPerMonth:
          FAIR_USE_CEILINGS.maxNewConversationsPerMonth,
        eligibleForBronze: true,
        eligibleForBlue: true,
        featuredListingCreditsPerMonth: 0,
        canPurchaseFeaturedListings: false,
        canPurchaseAdvertising: false,
        analyticsTier: "full",
        maxTeamMembers: 0,
        supportTier: "priority",
        canShowSocialMediaHandles: true,
        canBulkManage: false,
      };

    case "company-free":
      return {
        maxListingsPerMonth: 10,
        maxPhotosPerListing: 3,
        maxVideosPerListing: 0,
        advancedSearch: false,
        searchRankingBoost: false,
        prioritySearchRanking: false,
        homepageExposure: "none",
        featuredProfile: false,
        maxSavedProperties: 10,
        maxSavedSearches: 3,
        alertLevel: "basic",
        maxApplicationsPerMonth: null,
        // Per spec Section 27: company Free = 15 new conversations/month
        maxNewConversationsPerMonth: 15,
        eligibleForBronze: false,
        eligibleForBlue: false,
        featuredListingCreditsPerMonth: 0,
        canPurchaseFeaturedListings: true,
        canPurchaseAdvertising: false,
        analyticsTier: "basic",
        maxTeamMembers: 1,
        supportTier: "standard",
        canShowSocialMediaHandles: false,
        canBulkManage: false,
      };

    case "company-pro":
      return {
        maxListingsPerMonth: 20,
        maxPhotosPerListing: 5,
        maxVideosPerListing: 2,
        advancedSearch: true,
        searchRankingBoost: true,
        prioritySearchRanking: false,
        homepageExposure: "limited",
        featuredProfile: false,
        maxSavedProperties: 50,
        maxSavedSearches: 15,
        alertLevel: "advanced",
        maxApplicationsPerMonth: null,
        // Per spec Section 27: company Pro = 25 new conversations/month
        maxNewConversationsPerMonth: 25,
        eligibleForBronze: true,
        eligibleForBlue: false,
        featuredListingCreditsPerMonth: 2,
        canPurchaseFeaturedListings: true,
        canPurchaseAdvertising: false,
        analyticsTier: "advanced",
        maxTeamMembers: 5,
        supportTier: "priority",
        // Per spec Section 23: social media handles are Premium-only.
        canShowSocialMediaHandles: false,
        canBulkManage: true,
      };

    case "company-premium":
      return {
        maxListingsPerMonth: FAIR_USE_CEILINGS.maxListingsPerMonth,
        maxPhotosPerListing: FAIR_USE_CEILINGS.maxPhotosPerListing,
        maxVideosPerListing: FAIR_USE_CEILINGS.maxVideosPerListing,
        advancedSearch: true,
        searchRankingBoost: true,
        prioritySearchRanking: true,
        homepageExposure: "priority",
        featuredProfile: true,
        maxSavedProperties: FAIR_USE_CEILINGS.maxSavedProperties,
        maxSavedSearches: FAIR_USE_CEILINGS.maxSavedSearches,
        alertLevel: "priority",
        maxApplicationsPerMonth: null,
        maxNewConversationsPerMonth:
          FAIR_USE_CEILINGS.maxNewConversationsPerMonth,
        eligibleForBronze: true,
        eligibleForBlue: true,
        featuredListingCreditsPerMonth: 5,
        canPurchaseFeaturedListings: true,
        canPurchaseAdvertising: false,
        analyticsTier: "realtime",
        maxTeamMembers: FAIR_USE_CEILINGS.maxTeamMembers,
        supportTier: "dedicated",
        canShowSocialMediaHandles: true,
        canBulkManage: true,
      };

    // ---- TENANT ---- (spec Section 1, 2, 3, 4)
    // Tenant Free: 7-day trial, browse up to 10 listings, search/filter,
    // view public details, save preferences. NO direct contact.
    case "tenant-free":
      return {
        maxListingsPerMonth: 0, // tenants don't create listings
        maxPhotosPerListing: 0,
        maxVideosPerListing: 0,
        advancedSearch: false,
        searchRankingBoost: false,
        prioritySearchRanking: false,
        homepageExposure: "none",
        featuredProfile: false,
        maxSavedProperties: 0, // trial users cannot save properties (paid only)
        maxSavedSearches: 0, // trial users cannot save searches
        alertLevel: "off", // trial users do not receive alerts
        maxApplicationsPerMonth: 0, // tenants don't apply to represent
        maxNewConversationsPerMonth: 0, // trial: no direct contact
        eligibleForBronze: false,
        eligibleForBlue: false,
        featuredListingCreditsPerMonth: 0,
        canPurchaseFeaturedListings: false,
        canPurchaseAdvertising: false,
        analyticsTier: "basic",
        maxTeamMembers: 0,
        supportTier: "standard",
        canShowSocialMediaHandles: false,
        canBulkManage: false,
      };

    // Tenant Pro: ₦1,500/month — full tenant access including direct
    // landlord contact, saved properties, saved searches, alerts.
    case "tenant-pro":
      return {
        maxListingsPerMonth: 0,
        maxPhotosPerListing: 0,
        maxVideosPerListing: 0,
        advancedSearch: true,
        searchRankingBoost: false,
        prioritySearchRanking: false,
        homepageExposure: "none",
        featuredProfile: false,
        maxSavedProperties: 50,
        maxSavedSearches: 10,
        alertLevel: "instant",
        maxApplicationsPerMonth: 0,
        maxNewConversationsPerMonth: 20, // anti-spam: 20 new conversations/month
        eligibleForBronze: false,
        eligibleForBlue: false,
        featuredListingCreditsPerMonth: 0,
        canPurchaseFeaturedListings: false,
        canPurchaseAdvertising: false,
        analyticsTier: "basic",
        maxTeamMembers: 0,
        supportTier: "standard",
        canShowSocialMediaHandles: false,
        canBulkManage: false,
      };

    // Tenant Premium: not a real plan in V1, but the SubscriptionTier type
    // includes 'premium'. We alias it to tenant-pro capabilities so the
    // exhaustive guard doesn't throw. Tenants should only ever be free or pro.
    case "tenant-premium":
      return {
        maxListingsPerMonth: 0,
        maxPhotosPerListing: 0,
        maxVideosPerListing: 0,
        advancedSearch: true,
        searchRankingBoost: false,
        prioritySearchRanking: false,
        homepageExposure: "none",
        featuredProfile: false,
        maxSavedProperties: 50,
        maxSavedSearches: 10,
        alertLevel: "instant",
        maxApplicationsPerMonth: 0,
        maxNewConversationsPerMonth: 20,
        eligibleForBronze: false,
        eligibleForBlue: false,
        featuredListingCreditsPerMonth: 0,
        canPurchaseFeaturedListings: false,
        canPurchaseAdvertising: false,
        analyticsTier: "basic",
        maxTeamMembers: 0,
        supportTier: "standard",
        canShowSocialMediaHandles: false,
        canBulkManage: false,
      };

    default: {
      // Exhaustive guard — if a (role, tier) pair isn't covered above,
      // fail loudly in dev so we never accidentally grant too many or
      // too few capabilities.
      const _: never = `${role}-${tier}` as never;
      throw new Error(`Unhandled plan combination: ${_}`);
    }
  }
}

/**
 * Boolean helpers for the most common checks. Use these in UI gates.
 */
export function canCreateListing(role: UserRole, tier: SubscriptionTier) {
  const c = capabilitiesFor(role, tier);
  return c.maxListingsPerMonth === null || c.maxListingsPerMonth > 0;
}

export function canApplyToProperty(role: UserRole, tier: SubscriptionTier) {
  if (role !== "agent") return false;
  const c = capabilitiesFor(role, tier);
  return c.maxApplicationsPerMonth === null || c.maxApplicationsPerMonth > 0;
}

export function canSaveSearch(role: UserRole, tier: SubscriptionTier) {
  const c = capabilitiesFor(role, tier);
  return c.maxSavedSearches === null || c.maxSavedSearches > 0;
}

export function canReceiveRealTimeAlerts(
  role: UserRole,
  tier: SubscriptionTier,
) {
  const c = capabilitiesFor(role, tier);
  return c.alertLevel === "instant" || c.alertLevel === "priority";
}

export function canUseAnalytics(role: UserRole, tier: SubscriptionTier) {
  const c = capabilitiesFor(role, tier);
  return c.analyticsTier !== "basic";
}

export function canAccessFeaturedCredits(
  role: UserRole,
  tier: SubscriptionTier,
) {
  const c = capabilitiesFor(role, tier);
  return c.featuredListingCreditsPerMonth > 0;
}

export function canUseBulkManagement(role: UserRole, tier: SubscriptionTier) {
  return capabilitiesFor(role, tier).canBulkManage;
}

export function canHaveTeamMembers(role: UserRole, tier: SubscriptionTier) {
  const c = capabilitiesFor(role, tier);
  return c.maxTeamMembers === null || c.maxTeamMembers > 0;
}

// Re-export plan lookup so consumers have a single import surface.
export { getPlan };
