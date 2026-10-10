import type { SearchResult } from "./query-builder";

/**
 * Ranking abstraction.
 *
 * Per spec Section 15:
 *   * "Recommended" is the default sort
 *   * Recommendation considers: search relevance, location relevance,
 *     freshness, listing completeness, verification/trust, availability
 *   * "highest paying user" is NOT the default ranking
 *   * Featured placements will be clearly labeled (P11)
 *
 * This module exposes a `rankProperty()` function that computes a
 * relevance score per property. The score is a SUM of weighted signals:
 *
 *   * + freshness (newer = higher)
 *   * + completeness (more fields filled = higher)
 *   * + verification (bronze / blue badges = small boost)
 *   * + status (available > application_pending > under_offer > rented/sold)
 *   * + (future) featured_listing signal — clearly labeled, never silent
 *
 * The score is 0..100. The "recommended" sort orders by score desc.
 */

export interface RankingSignals {
  /** 0..1 — newer properties score higher */
  freshness: number;
  /** 0..1 — properties with more filled fields score higher */
  completeness: number;
  /** 0..1 — verified properties score slightly higher */
  trust: number;
  /** 0..1 — available properties score higher than rented/sold */
  availability: number;
  /** 0..1 — featured listings (P11) — never silently injected */
  featured: number;
}

export interface RankingWeights {
  freshness: number;
  completeness: number;
  trust: number;
  availability: number;
  featured: number;
}

export const DEFAULT_WEIGHTS: RankingWeights = {
  freshness: 0.30,
  completeness: 0.20,
  trust: 0.15,
  availability: 0.25,
  featured: 0.10,
};

/**
 * Compute the ranking score for a property.
 * Returns 0..100.
 */
export function rankProperty(
  property: SearchResult,
  weights: RankingWeights = DEFAULT_WEIGHTS,
): number {
  const signals = computeSignals(property);
  const score =
    signals.freshness * weights.freshness +
    signals.completeness * weights.completeness +
    signals.trust * weights.trust +
    signals.availability * weights.availability +
    signals.featured * weights.featured;
  return Math.round(score * 100);
}

function computeSignals(property: SearchResult): RankingSignals {
  return {
    freshness: computeFreshness(property),
    completeness: computeCompleteness(property),
    trust: computeTrust(property),
    availability: computeAvailability(property),
    featured: computeFeatured(property),
  };
}

function computeFreshness(property: SearchResult): number {
  if (!property.published_at) return 0;
  const ageDays = (Date.now() - new Date(property.published_at).getTime()) / (24 * 60 * 60 * 1000);
  // Properties published <7 days ago → 1.0
  // Properties published >30 days ago → decays linearly to 0.3 floor
  if (ageDays <= 7) return 1.0;
  if (ageDays <= 30) return 1.0 - (ageDays - 7) / 30 * 0.4; // 1.0 → 0.6
  if (ageDays <= 90) return 0.6;
  if (ageDays <= 180) return 0.4;
  return 0.2;
}

function computeCompleteness(property: SearchResult): number {
  let filled = 0;
  let total = 0;
  // Count which key fields are filled
  total++; if (property.title) filled++;
  total++; if (property.price > 0) filled++;
  total++; if (property.featured_image_url) filled++;
  total++; if (property.state) filled++;
  total++; if (property.city) filled++;
  total++; if (property.area) filled++;
  total++; if (property.bedrooms > 0) filled++;
  total++; if (property.bathrooms > 0) filled++;
  total++; if (property.size_value && property.size_value > 0) filled++;
  total++; if (property.listed_by_name) filled++;
  return filled / total;
}

function computeTrust(property: SearchResult): number {
  switch (property.listed_by_verification) {
    case "blue": return 1.0;
    case "bronze": return 0.7;
    case "pending": return 0.3;
    default: return 0.0;
  }
}

function computeAvailability(property: SearchResult): number {
  switch (property.status) {
    case "available": return 1.0;
    case "application_pending": return 0.7;
    case "under_offer": return 0.5;
    case "rented":
    case "sold": return 0.2;
    default: return 0.0;
  }
}

/**
 * Featured signal — controlled boost for promoted listings.
 * Per spec Section 3: "NO PAY-TO-WIN" — featured weight is only 10% of
 * the total score. Featured is a tie-breaker signal, not a dominant one.
 * Per spec Section 21: "Hard filters always win" — featured only applies
 * AFTER the search query has already filtered by price, location, etc.
 *
 * The `is_featured` field is set by the search query builder after
 * checking the `featured_listings` table for active promotions.
 */
function computeFeatured(property: SearchResult): number {
  // The SearchResult type doesn't have an `is_featured` field directly,
  // but the search query builder sets it when building results.
  // For now, we use the is_saved pattern — the query builder enriches
  // results with featured status before ranking.
  // This returns 0 if not featured, 1.0 if featured.
  // The DEFAULT_WEIGHTS.featured (0.10) means featured adds at most 10 points.
  return (property as unknown as { is_featured?: boolean }).is_featured ? 1.0 : 0.0;
}

/**
 * Returns the human-readable label for a sort option.
 */
export function getSortLabel(sort: string): string {
  switch (sort) {
    case "newest": return "Newest";
    case "price_low_high": return "Price: Low to High";
    case "price_high_low": return "Price: High to Low";
    case "most_relevant": return "Most Relevant";
    case "recommended":
    default: return "Recommended";
  }
}
