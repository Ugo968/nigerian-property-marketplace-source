/**
 * Featured listing promotion configuration.
 *
 * Per spec Sections 5, 11, 13:
 *   * Configurable promotion types + durations + credit costs
 *   * NOT hard-coded in React components
 *   * Values clearly marked as requiring final business approval
 *
 * The DB `promotion_products` table (migration 0022) is the authoritative
 * source. This module provides defaults + TypeScript types.
 */

export interface PromotionProduct {
  id: string;
  slug: string;
  label: string;
  placement: "homepage" | "search" | "category" | "location";
  creditCost: number;
  durationDays: number;
  isActive: boolean;
  sortOrder: number;
}

/**
 * Default promotion products. These are seeded into the
 * `promotion_products` table in migration 0022.
 *
 * ⚠️  Credit costs and durations are initial values — final pricing
 *    requires business approval. The DB table is the source of truth;
 *    admin can adjust without code changes.
 */
export const DEFAULT_PROMOTION_PRODUCTS: PromotionProduct[] = [
  { id: "", slug: "search_boost_7", label: "Search Boost — 7 days", placement: "search", creditCost: 1, durationDays: 7, isActive: true, sortOrder: 10 },
  { id: "", slug: "search_boost_14", label: "Search Boost — 14 days", placement: "search", creditCost: 2, durationDays: 14, isActive: true, sortOrder: 20 },
  { id: "", slug: "search_boost_30", label: "Search Boost — 30 days", placement: "search", creditCost: 3, durationDays: 30, isActive: true, sortOrder: 30 },
  { id: "", slug: "homepage_featured_7", label: "Homepage Featured — 7 days", placement: "homepage", creditCost: 2, durationDays: 7, isActive: true, sortOrder: 40 },
  { id: "", slug: "homepage_featured_14", label: "Homepage Featured — 14 days", placement: "homepage", creditCost: 4, durationDays: 14, isActive: true, sortOrder: 50 },
  { id: "", slug: "location_featured_7", label: "Location Featured — 7 days", placement: "location", creditCost: 1, durationDays: 7, isActive: true, sortOrder: 60 },
  { id: "", slug: "location_featured_14", label: "Location Featured — 14 days", placement: "location", creditCost: 2, durationDays: 14, isActive: true, sortOrder: 70 },
];

/**
 * Maximum simultaneous active promotions per user.
 * Per spec Section 24: "Prevent one user from abusing the promotional system."
 */
export const MAX_ACTIVE_PROMOTIONS_PER_USER = 10;

/**
 * Credit purchase price in Naira (per credit).
 * ⚠️  Requires final business approval.
 */
export const CREDIT_PURCHASE_PRICE_NAIRA = 2000;

/**
 * Minimum credits purchasable in one transaction.
 */
export const MIN_CREDITS_PER_PURCHASE = 1;

/**
 * Maximum credits purchasable in one transaction.
 */
export const MAX_CREDITS_PER_PURCHASE = 50;
