/**
 * Advertising configuration — central source of truth for advertising rules.
 *
 * Per spec Sections 1, 3, 5, 6, 12, 27:
 *   * ₦5,000 minimum campaign budget (enforced here + DB CHECK)
 *   * No fourth marketplace role
 *   * Advertising is paid separately (no free ads from Pro/Premium)
 *   * Configurable categories + placements
 */

/** Minimum campaign budget in Naira (major units). Per spec Section 5. */
export const MIN_CAMPAIGN_BUDGET_NAIRA = 5000;

/** Minimum campaign budget in kobo (minor units) for DB + payment. */
export const MIN_CAMPAIGN_BUDGET_KOBO = MIN_CAMPAIGN_BUDGET_NAIRA * 100;

/** Maximum campaigns per business (anti-abuse, spec Section 24 concept). */
export const MAX_CAMPAIGNS_PER_BUSINESS = 20;

/** Maximum businesses per user (anti-abuse). */
export const MAX_BUSINESSES_PER_USER = 5;

/** Campaign lifecycle states (spec Section 4). */
export const CAMPAIGN_STATUSES = [
  "draft",
  "pending_payment",
  "pending_review",
  "active",
  "paused",
  "completed",
  "rejected",
  "cancelled",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  pending_payment: "Pending Payment",
  pending_review: "Pending Review",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Valid state transitions (spec Section 4: "Use state transitions deliberately"). */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["pending_payment", "cancelled"],
  pending_payment: ["draft", "pending_review", "cancelled"],
  pending_review: ["active", "rejected", "cancelled"],
  active: ["paused", "completed", "cancelled"],
  paused: ["active", "cancelled"],
  completed: [],
  rejected: [],
  cancelled: [],
};

/** Business statuses (spec Section 2). */
export const BUSINESS_STATUSES = [
  "active",
  "pending_review",
  "suspended",
  "rejected",
  "archived",
] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

/** Placements (spec Section 6). */
export const AD_PLACEMENTS = [
  "homepage",
  "search_results",
  "property_pages",
  "category_pages",
  "location_pages",
  "sponsored_business_cards",
  "banners",
] as const;

/** Creative validation limits (spec Section 9). */
export const MAX_CREATIVE_TITLE_LENGTH = 100;
export const MAX_CREATIVE_DESCRIPTION_LENGTH = 300;
export const MAX_CREATIVE_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_CREATIVE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
