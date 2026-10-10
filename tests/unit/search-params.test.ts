import { describe, it, expect } from "bun:test";
import {
  parseSearchParams,
  serialiseSearchParams,
  hasActiveFilters,
  countActiveFilters,
  getFilterChips,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@/lib/search/params";

describe("parseSearchParams", () => {
  it("parses an empty input into defaults", () => {
    const result = parseSearchParams({});
    expect(result.sort).toBe("recommended");
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(result.q).toBeUndefined();
  });

  it("parses a transaction type", () => {
    const result = parseSearchParams({ transaction: "rent" });
    expect(result.transaction).toBe("rent");
  });

  it("rejects an invalid transaction type", () => {
    const result = parseSearchParams({ transaction: "invalid" });
    expect(result.transaction).toBeUndefined();
  });

  it("parses all three transaction types", () => {
    expect(parseSearchParams({ transaction: "rent" }).transaction).toBe("rent");
    expect(parseSearchParams({ transaction: "sale" }).transaction).toBe("sale");
    expect(parseSearchParams({ transaction: "shortlet" }).transaction).toBe("shortlet");
  });

  it("parses location filters", () => {
    const result = parseSearchParams({
      state: "Lagos",
      city: "Lekki",
      area: "Phase 1",
      landmark: "Near Shoprite",
    });
    expect(result.state).toBe("Lagos");
    expect(result.city).toBe("Lekki");
    expect(result.area).toBe("Phase 1");
    expect(result.landmark).toBe("Near Shoprite");
  });

  it("parses price range", () => {
    const result = parseSearchParams({
      minPrice: "500000",
      maxPrice: "5000000",
    });
    expect(result.minPrice).toBe(500000);
    expect(result.maxPrice).toBe(5000000);
  });

  it("rejects negative prices", () => {
    const result = parseSearchParams({ minPrice: "-1" });
    expect(result.minPrice).toBeUndefined();
  });

  it("rejects non-integer prices", () => {
    const result = parseSearchParams({ minPrice: "3.5" });
    expect(result.minPrice).toBeUndefined();
  });

  it("parses price frequency", () => {
    const result = parseSearchParams({ priceFrequency: "per_year" });
    expect(result.priceFrequency).toBe("per_year");
  });

  it("rejects invalid price frequency", () => {
    const result = parseSearchParams({ priceFrequency: "invalid" });
    expect(result.priceFrequency).toBeUndefined();
  });

  it("parses bedrooms + bathrooms as minimums", () => {
    const result = parseSearchParams({ bedrooms: "3", bathrooms: "2" });
    expect(result.bedroomsMin).toBe(3);
    expect(result.bathroomsMin).toBe(2);
  });

  it("parses furnished status", () => {
    const result = parseSearchParams({ furnished: "furnished" });
    expect(result.furnishedStatus).toBe("furnished");
  });

  it("rejects invalid furnished status", () => {
    const result = parseSearchParams({ furnished: "fully" });
    expect(result.furnishedStatus).toBeUndefined();
  });

  it("parses amenities as a comma-separated list", () => {
    const result = parseSearchParams({ amenities: "parking,security,generator" });
    expect(result.amenities).toEqual(["parking", "security", "generator"]);
  });

  it("rejects too many amenities (>20)", () => {
    const many = Array.from({ length: 21 }, (_, i) => `amenity${i}`).join(",");
    const result = parseSearchParams({ amenities: many });
    expect(result.amenities).toBeUndefined();
  });

  it("parses sort options", () => {
    expect(parseSearchParams({ sort: "newest" }).sort).toBe("newest");
    expect(parseSearchParams({ sort: "price_low_high" }).sort).toBe("price_low_high");
    expect(parseSearchParams({ sort: "price_high_low" }).sort).toBe("price_high_low");
    expect(parseSearchParams({ sort: "most_relevant" }).sort).toBe("most_relevant");
  });

  it("defaults sort to recommended when invalid", () => {
    expect(parseSearchParams({ sort: "invalid" }).sort).toBe("recommended");
  });

  it("parses pagination", () => {
    const result = parseSearchParams({ page: "3", pageSize: "24" });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(24);
  });

  it("caps pageSize at MAX_PAGE_SIZE", () => {
    const result = parseSearchParams({ pageSize: "100" });
    expect(result.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("rejects query string shorter than 2 chars", () => {
    const result = parseSearchParams({ q: "a" });
    expect(result.q).toBeUndefined();
  });

  it("trims whitespace from query", () => {
    const result = parseSearchParams({ q: "  lagos  " });
    expect(result.q).toBe("lagos");
  });
});

describe("serialiseSearchParams", () => {
  it("serialises an empty params object to empty string", () => {
    expect(serialiseSearchParams({})).toBe("");
  });

  it("serialises a full search", () => {
    const result = serialiseSearchParams({
      transaction: "rent",
      state: "Lagos",
      city: "Lekki",
      minPrice: 500000,
      maxPrice: 5000000,
      bedroomsMin: 3,
      sort: "newest",
      page: 2,
    });
    expect(result).toContain("transaction=rent");
    expect(result).toContain("state=Lagos");
    expect(result).toContain("city=Lekki");
    expect(result).toContain("minPrice=500000");
    expect(result).toContain("maxPrice=5000000");
    expect(result).toContain("bedrooms=3");
    expect(result).toContain("sort=newest");
    expect(result).toContain("page=2");
  });

  it("does not include sort=recommended (default)", () => {
    const result = serialiseSearchParams({ sort: "recommended" });
    expect(result).not.toContain("sort=");
  });

  it("URL-encodes special characters", () => {
    const result = serialiseSearchParams({ q: "lagos & abuja" });
    expect(result).toContain("q=lagos%20%26%20abuja");
  });
});

describe("hasActiveFilters", () => {
  it("returns false for empty params", () => {
    expect(hasActiveFilters({})).toBe(false);
  });

  it("returns true when any filter is set", () => {
    expect(hasActiveFilters({ transaction: "rent" })).toBe(true);
    expect(hasActiveFilters({ state: "Lagos" })).toBe(true);
    expect(hasActiveFilters({ minPrice: 100000 })).toBe(true);
    expect(hasActiveFilters({ bedroomsMin: 3 })).toBe(true);
    expect(hasActiveFilters({ amenities: ["parking"] })).toBe(true);
  });

  it("returns false for sort + pagination only", () => {
    expect(hasActiveFilters({ sort: "newest", page: 2 })).toBe(false);
  });
});

describe("countActiveFilters", () => {
  it("counts each active filter", () => {
    expect(countActiveFilters({})).toBe(0);
    expect(countActiveFilters({ transaction: "rent" })).toBe(1);
    expect(countActiveFilters({ transaction: "rent", state: "Lagos", bedroomsMin: 3 })).toBe(3);
    expect(
      countActiveFilters({
        transaction: "rent",
        minPrice: 100,
        maxPrice: 1000,
        amenities: ["parking", "security"],
      }),
    ).toBe(4);
  });
});

describe("getFilterChips", () => {
  it("returns chips for active filters", () => {
    const chips = getFilterChips({
      transaction: "rent",
      state: "Lagos",
      bedroomsMin: 3,
    });
    expect(chips).toContainEqual({ key: "transaction", label: "Rent" });
    expect(chips).toContainEqual({ key: "state", label: "Lagos" });
    expect(chips).toContainEqual({ key: "bedrooms", label: "3+ beds" });
  });

  it("formats short-let correctly", () => {
    const chips = getFilterChips({ transaction: "shortlet" });
    expect(chips[0].label).toBe("Short-let");
  });

  it("formats price range as compact string", () => {
    const chips = getFilterChips({ minPrice: 500000, maxPrice: 5000000 });
    expect(chips[0].label).toContain("–");
  });
});

describe("round-trip: parse → serialise → parse", () => {
  it("preserves filter state across round-trips", () => {
    const original = {
      transaction: "rent" as const,
      state: "Lagos",
      city: "Lekki",
      minPrice: 500000,
      maxPrice: 5000000,
      bedroomsMin: 3,
      furnishedStatus: "furnished" as const,
      amenities: ["parking", "security"],
    };
    const serialised = serialiseSearchParams(original);
    const parsed = parseSearchParams(new URLSearchParams(serialised));
    expect(parsed.transaction).toBe("rent");
    expect(parsed.state).toBe("Lagos");
    expect(parsed.city).toBe("Lekki");
    expect(parsed.minPrice).toBe(500000);
    expect(parsed.maxPrice).toBe(5000000);
    expect(parsed.bedroomsMin).toBe(3);
    expect(parsed.furnishedStatus).toBe("furnished");
    expect(parsed.amenities).toEqual(["parking", "security"]);
  });
});
