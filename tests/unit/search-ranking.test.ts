import { describe, it, expect } from "bun:test";
import {
  rankProperty,
  getSortLabel,
  DEFAULT_WEIGHTS,
  type RankingWeights,
} from "@/lib/search/ranking";
import type { SearchResult } from "@/lib/search/query-builder";

// Helper: build a SearchResult with sensible defaults
function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: "p1",
    title: "Test Property",
    price: 3_500_000_00,
    price_frequency: "per_year",
    currency: "NGN",
    transaction_type: "rent",
    bedrooms: 4,
    bathrooms: 5,
    toilets: 6,
    parking_spaces: 4,
    size_value: 250,
    size_unit: "sqm",
    furnished_status: "furnished",
    status: "available",
    published_at: new Date().toISOString(), // just published
    created_at: new Date().toISOString(),
    property_type_id: "pt1",
    property_type_slug: "duplex",
    property_type_label: "Duplex",
    property_type_category: "residential",
    listing_creator_id: "u1",
    state: "Lagos",
    city: "Lekki",
    area: "Phase 1",
    landmark: "Near Shoprite",
    public_lat: 6.45,
    public_lng: 3.45,
    featured_image_url: "https://example.com/photo.jpg",
    listed_by_name: "Ada Properties",
    listed_by_avatar: null,
    listed_by_role: "agent",
    listed_by_verification: "bronze",
    is_saved: false,
    ...overrides,
  };
}

describe("rankProperty", () => {
  it("returns a score between 0 and 100", () => {
    const result = rankProperty(makeResult());
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("a freshly-published, complete, verified, available property scores high", () => {
    const property = makeResult({
      published_at: new Date().toISOString(),
      status: "available",
      listed_by_verification: "blue",
    });
    const score = rankProperty(property);
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it("an old property scores lower than a fresh one", () => {
    const fresh = makeResult({ published_at: new Date().toISOString() });
    const old = makeResult({
      published_at: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(rankProperty(fresh)).toBeGreaterThan(rankProperty(old));
  });

  it("an incomplete property scores lower than a complete one", () => {
    const complete = makeResult({
      title: "Full Title",
      price: 3_500_000_00,
      featured_image_url: "https://example.com/photo.jpg",
      state: "Lagos",
      city: "Lekki",
      area: "Phase 1",
      bedrooms: 4,
      bathrooms: 5,
      size_value: 250,
      listed_by_name: "Ada Properties",
    });
    const incomplete = makeResult({
      title: "",
      price: 0,
      featured_image_url: null,
      state: null,
      city: null,
      area: null,
      bedrooms: 0,
      bathrooms: 0,
      size_value: null,
      listed_by_name: null,
    });
    expect(rankProperty(complete)).toBeGreaterThan(rankProperty(incomplete));
  });

  it("blue-verified property scores higher than unverified", () => {
    const verified = makeResult({ listed_by_verification: "blue" });
    const unverified = makeResult({ listed_by_verification: "unverified" });
    expect(rankProperty(verified)).toBeGreaterThan(rankProperty(unverified));
  });

  it("available property scores higher than rented/sold", () => {
    const available = makeResult({ status: "available" });
    const rented = makeResult({ status: "rented" });
    const sold = makeResult({ status: "sold" });
    expect(rankProperty(available)).toBeGreaterThan(rankProperty(rented));
    expect(rankProperty(available)).toBeGreaterThan(rankProperty(sold));
  });

  it("respects custom weights", () => {
    const property = makeResult({ listed_by_verification: "blue" });
    const trustHeavy: RankingWeights = {
      freshness: 0,
      completeness: 0,
      trust: 1.0,
      availability: 0,
      featured: 0,
    };
    const score = rankProperty(property, trustHeavy);
    // With 100% trust weight and blue verification (trust=1.0), score should be 100
    expect(score).toBe(100);
  });

  it("featured signal is 0 by default (not yet implemented)", () => {
    const property = makeResult();
    // The featured weight is 0.10 in DEFAULT_WEIGHTS, but the signal is 0.
    // So a property with all other signals at 1.0 would score 90 (100 - 10).
    const perfect: SearchResult = makeResult({
      published_at: new Date().toISOString(),
      status: "available",
      listed_by_verification: "blue",
    });
    const score = rankProperty(perfect);
    // With everything else at max but featured=0, score should be ≤ 90
    expect(score).toBeLessThanOrEqual(90);
  });
});

describe("getSortLabel", () => {
  it("returns the correct label for each sort option", () => {
    expect(getSortLabel("recommended")).toBe("Recommended");
    expect(getSortLabel("newest")).toBe("Newest");
    expect(getSortLabel("price_low_high")).toBe("Price: Low to High");
    expect(getSortLabel("price_high_low")).toBe("Price: High to Low");
    expect(getSortLabel("most_relevant")).toBe("Most Relevant");
  });

  it("returns 'Recommended' for unknown sort options", () => {
    expect(getSortLabel("unknown")).toBe("Recommended");
  });
});

describe("DEFAULT_WEIGHTS", () => {
  it("weights sum to 1.0", () => {
    const sum =
      DEFAULT_WEIGHTS.freshness +
      DEFAULT_WEIGHTS.completeness +
      DEFAULT_WEIGHTS.trust +
      DEFAULT_WEIGHTS.availability +
      DEFAULT_WEIGHTS.featured;
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
  });

  it("freshness is the largest weight (per spec — recommended = freshness-weighted)", () => {
    expect(DEFAULT_WEIGHTS.freshness).toBeGreaterThan(DEFAULT_WEIGHTS.trust);
    expect(DEFAULT_WEIGHTS.freshness).toBeGreaterThan(DEFAULT_WEIGHTS.featured);
  });

  it("featured weight is small (not the dominant signal)", () => {
    expect(DEFAULT_WEIGHTS.featured).toBeLessThan(DEFAULT_WEIGHTS.freshness);
    expect(DEFAULT_WEIGHTS.featured).toBeLessThan(DEFAULT_WEIGHTS.availability);
  });
});
