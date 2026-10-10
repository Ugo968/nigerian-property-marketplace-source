/**
 * Advertising ecosystem types.
 *
 * The advertising system is SEPARATE from the three core marketplace roles.
 * Businesses (carpenters, plumbers, electricians, etc.) use this system.
 * Advertising is NOT a fourth user role — it has its own business profiles,
 * campaigns, placements, and payments.
 */

/**
 * Master list of business categories. Extensible at runtime via DB.
 */
export const ADVERTISER_CATEGORIES = [
  "carpenter",
  "interior_designer",
  "furniture_business",
  "plumber",
  "electrician",
  "architect",
  "painter",
  "mover",
  "security_company",
  "cleaning_company",
  "landscaping",
  "building_materials_supplier",
  "generator_solar",
  "home_appliance_business",
  "other",
] as const;
export type AdvertiserCategory = (typeof ADVERTISER_CATEGORIES)[number];

export const ADVERTISER_CATEGORY_LABELS: Record<AdvertiserCategory, string> = {
  carpenter: "Carpenter",
  interior_designer: "Interior Designer",
  furniture_business: "Furniture Business",
  plumber: "Plumber",
  electrician: "Electrician",
  architect: "Architect",
  painter: "Painter",
  mover: "Mover / Moving Company",
  security_company: "Security Company",
  cleaning_company: "Cleaning Company",
  landscaping: "Landscaping",
  building_materials_supplier: "Building Materials Supplier",
  generator_solar: "Generator / Solar",
  home_appliance_business: "Home Appliance Business",
  other: "Other",
};

/**
 * Where an ad can appear. All placements must be clearly labeled
 * "Sponsored" / "Advertisement".
 */
export const AD_PLACEMENTS = [
  "homepage",
  "property_search",
  "category_page",
  "location_targeted",
  "sponsored_business_card",
  "banner",
] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export const AD_PLACEMENT_LABELS: Record<AdPlacement, string> = {
  homepage: "Homepage",
  property_search: "Property Search Results",
  category_page: "Category Page",
  location_targeted: "Location-Targeted Area",
  sponsored_business_card: "Sponsored Business Card",
  banner: "Banner Placement",
};

/**
 * Campaign lifecycle.
 */
export const CAMPAIGN_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "active",
  "paused",
  "ended",
  "rejected",
  "cancelled",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  approved: "Approved",
  active: "Active",
  paused: "Paused",
  ended: "Ended",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/**
 * Minimum advertising spend — ₦5,000 is the floor, not the only price.
 * Campaigns can budget more; this is just the minimum entry purchase.
 */
export const MIN_ADVERTISING_SPEND_NAIRA = 5000;

/**
 * Advertising campaign record.
 */
export interface AdvertisingCampaign {
  id: string;
  businessId: string;
  name: string;
  package: string;
  placement: AdPlacement;
  budgetNaira: number;
  startDate: string; // ISO
  endDate: string; // ISO
  status: CampaignStatus;
  impressions: number;
  clicks: number;
  createdAt: string; // ISO
}
