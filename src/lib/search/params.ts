import type { TransactionType, PriceFrequency } from "@/types";

/**
 * Search parameter types — typed representation of the URL query string.
 *
 * Per spec Section 18: search/filter state should be reflected in URL
 * query parameters so searches can be shared/bookmarked/refreshed.
 *
 * This module is the single source of truth for parsing + serialising
 * the search query. Server actions and client components both use it.
 */

export interface SearchFilters {
  /** Free-text search query (location name, property type name, etc.) */
  q?: string;
  /** Transaction type filter */
  transaction?: TransactionType | null;
  /** Property type filter (slug — e.g. "apartment", "duplex") */
  propertyType?: string | null;
  /** Location filters */
  state?: string | null;
  city?: string | null;
  area?: string | null;
  landmark?: string | null;
  /** Price range (in Naira minor units / kobo) */
  minPrice?: number | null;
  maxPrice?: number | null;
  /** Price frequency context — so the price filter applies to the right unit */
  priceFrequency?: PriceFrequency | null;
  /** Bedrooms minimum (1+, 2+, 3+, ...) */
  bedroomsMin?: number | null;
  /** Bathrooms minimum */
  bathroomsMin?: number | null;
  /** Furnished status filter */
  furnishedStatus?: "furnished" | "semi_furnished" | "unfurnished" | "not_applicable" | null;
  /** Amenity slugs to filter by (AND — must have ALL selected) */
  amenities?: string[] | null;
  /** Listing status filter — defaults to publicly visible only */
  status?: "available" | "available_and_pending" | null;
}

export type SortOption =
  | "recommended"
  | "newest"
  | "price_low_high"
  | "price_high_low"
  | "most_relevant";

export interface SearchParams extends SearchFilters {
  sort?: SortOption;
  /** Page number (1-indexed) */
  page?: number;
  /** Results per page (capped at 24 in the server action) */
  pageSize?: number;
}

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 24;

// ---------------------------------------------------------------------------
// Parsing — URLSearchParams → SearchParams
// ---------------------------------------------------------------------------

/**
 * Parse a URLSearchParams (or Next.js `searchParams` Record) into a typed
 * SearchParams object. Unknown / invalid values are silently dropped
 * (the URL is treated as if they weren't there).
 */
export function parseSearchParams(
  input: Record<string, string | string[] | undefined> | URLSearchParams,
): SearchParams {
  const get = (key: string): string | null => {
    if (input instanceof URLSearchParams) {
      return input.get(key);
    }
    const value = input[key];
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  };

  const filters: SearchParams = {};

  // Free-text query
  const q = get("q");
  if (q && q.trim().length >= 2 && q.length <= 200) {
    filters.q = q.trim();
  }

  // Transaction type
  const transaction = get("transaction");
  if (
    transaction &&
    ["rent", "sale", "shortlet"].includes(transaction)
  ) {
    filters.transaction = transaction as TransactionType;
  }

  // Property type (slug)
  const propertyType = get("propertyType");
  if (propertyType && propertyType.length <= 60) {
    filters.propertyType = propertyType;
  }

  // Location
  const state = get("state");
  if (state && state.length <= 60) filters.state = state;
  const city = get("city");
  if (city && city.length <= 60) filters.city = city;
  const area = get("area");
  if (area && area.length <= 120) filters.area = area;
  const landmark = get("landmark");
  if (landmark && landmark.length <= 200) filters.landmark = landmark;

  // Price
  const minPrice = parsePositiveInt(get("minPrice"));
  if (minPrice !== null) filters.minPrice = minPrice;
  const maxPrice = parsePositiveInt(get("maxPrice"));
  if (maxPrice !== null) filters.maxPrice = maxPrice;

  const priceFrequency = get("priceFrequency");
  if (
    priceFrequency &&
    ["one_off", "per_day", "per_week", "per_month", "per_year", "per_night"].includes(
      priceFrequency,
    )
  ) {
    filters.priceFrequency = priceFrequency as PriceFrequency;
  }

  // Bedrooms / bathrooms
  const beds = parsePositiveInt(get("bedrooms"));
  if (beds !== null) filters.bedroomsMin = beds;
  const baths = parsePositiveInt(get("bathrooms"));
  if (baths !== null) filters.bathroomsMin = baths;

  // Furnished status
  const furnished = get("furnished");
  if (
    furnished &&
    ["furnished", "semi_furnished", "unfurnished", "not_applicable"].includes(furnished)
  ) {
    filters.furnishedStatus = furnished as SearchFilters["furnishedStatus"];
  }

  // Amenities — comma-separated slugs
  const amenities = get("amenities");
  if (amenities) {
    const slugs = amenities
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 60);
    if (slugs.length > 0 && slugs.length <= 20) {
      filters.amenities = slugs;
    }
  }

  // Status
  const status = get("status");
  if (status === "available" || status === "available_and_pending") {
    filters.status = status;
  }

  // Sort
  const sort = get("sort");
  const result: SearchParams = { ...filters };
  if (
    sort &&
    [
      "recommended",
      "newest",
      "price_low_high",
      "price_high_low",
      "most_relevant",
    ].includes(sort)
  ) {
    result.sort = sort as SortOption;
  } else {
    result.sort = "recommended";
  }

  // Pagination
  const page = parsePositiveInt(get("page"));
  result.page = page && page > 0 ? page : 1;
  const pageSize = parsePositiveInt(get("pageSize"));
  result.pageSize =
    pageSize && pageSize > 0 && pageSize <= MAX_PAGE_SIZE ? pageSize : DEFAULT_PAGE_SIZE;

  return result;
}

function parsePositiveInt(value: string | null): number | null {
  if (value === null) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return null;
  return num;
}

// ---------------------------------------------------------------------------
// Serialisation — SearchParams → URL query string
// ---------------------------------------------------------------------------

/**
 * Serialise SearchParams into a URL query string (without the leading `?`).
 * Used for shareable links + saved-search URLs.
 */
export function serialiseSearchParams(params: SearchParams): string {
  const pairs: Array<[string, string]> = [];

  if (params.q) pairs.push(["q", params.q]);
  if (params.transaction) pairs.push(["transaction", params.transaction]);
  if (params.propertyType) pairs.push(["propertyType", params.propertyType]);
  if (params.state) pairs.push(["state", params.state]);
  if (params.city) pairs.push(["city", params.city]);
  if (params.area) pairs.push(["area", params.area]);
  if (params.landmark) pairs.push(["landmark", params.landmark]);
  if (params.minPrice !== null && params.minPrice !== undefined) {
    pairs.push(["minPrice", String(params.minPrice)]);
  }
  if (params.maxPrice !== null && params.maxPrice !== undefined) {
    pairs.push(["maxPrice", String(params.maxPrice)]);
  }
  if (params.priceFrequency) pairs.push(["priceFrequency", params.priceFrequency]);
  if (params.bedroomsMin !== null && params.bedroomsMin !== undefined) {
    pairs.push(["bedrooms", String(params.bedroomsMin)]);
  }
  if (params.bathroomsMin !== null && params.bathroomsMin !== undefined) {
    pairs.push(["bathrooms", String(params.bathroomsMin)]);
  }
  if (params.furnishedStatus) pairs.push(["furnished", params.furnishedStatus]);
  if (params.amenities && params.amenities.length > 0) {
    pairs.push(["amenities", params.amenities.join(",")]);
  }
  if (params.status) pairs.push(["status", params.status]);
  if (params.sort && params.sort !== "recommended") {
    pairs.push(["sort", params.sort]);
  }
  if (params.page && params.page > 1) pairs.push(["page", String(params.page)]);
  if (params.pageSize && params.pageSize !== DEFAULT_PAGE_SIZE) {
    pairs.push(["pageSize", String(params.pageSize)]);
  }

  return pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/**
 * Returns true if any filter is set (excluding sort + pagination).
 */
export function hasActiveFilters(params: SearchParams): boolean {
  return Boolean(
    params.q ||
      params.transaction ||
      params.propertyType ||
      params.state ||
      params.city ||
      params.area ||
      params.landmark ||
      (params.minPrice != null) ||
      (params.maxPrice != null) ||
      params.priceFrequency ||
      (params.bedroomsMin != null) ||
      (params.bathroomsMin != null) ||
      params.furnishedStatus ||
      (params.amenities && params.amenities.length > 0) ||
      (params.status && params.status !== "available"),
  );
}

/**
 * Returns the count of active filters (for the "Clear all" chip).
 */
export function countActiveFilters(params: SearchParams): number {
  let count = 0;
  if (params.q) count++;
  if (params.transaction) count++;
  if (params.propertyType) count++;
  if (params.state) count++;
  if (params.city) count++;
  if (params.area) count++;
  if (params.landmark) count++;
  if (params.minPrice !== null && params.minPrice !== undefined) count++;
  if (params.maxPrice !== null && params.maxPrice !== undefined) count++;
  if (params.priceFrequency) count++;
  if (params.bedroomsMin !== null && params.bedroomsMin !== undefined) count++;
  if (params.bathroomsMin !== null && params.bathroomsMin !== undefined) count++;
  if (params.furnishedStatus) count++;
  if (params.amenities && params.amenities.length > 0) count++;
  return count;
}

/**
 * Returns a human-readable label for the active filters (used in chips).
 */
export function getFilterChips(params: SearchParams): Array<{ key: string; label: string }> {
  const chips: Array<{ key: string; label: string }> = [];
  if (params.transaction) {
    chips.push({
      key: "transaction",
      label: params.transaction === "shortlet" ? "Short-let" : params.transaction === "rent" ? "Rent" : "Sale",
    });
  }
  if (params.propertyType) chips.push({ key: "propertyType", label: params.propertyType });
  if (params.state) chips.push({ key: "state", label: params.state });
  if (params.city) chips.push({ key: "city", label: params.city });
  if (params.area) chips.push({ key: "area", label: params.area });
  if (params.landmark) chips.push({ key: "landmark", label: params.landmark });
  if (params.bedroomsMin) chips.push({ key: "bedrooms", label: `${params.bedroomsMin}+ beds` });
  if (params.bathroomsMin) chips.push({ key: "bathrooms", label: `${params.bathroomsMin}+ baths` });
  if (params.furnishedStatus) {
    chips.push({
      key: "furnished",
      label: params.furnishedStatus.replace(/_/g, " "),
    });
  }
  if (params.minPrice !== null || params.maxPrice !== null) {
    const min = params.minPrice ? formatNairaShort(params.minPrice) : "₦0";
    const max = params.maxPrice ? formatNairaShort(params.maxPrice) : "Any";
    chips.push({ key: "price", label: `${min} – ${max}` });
  }
  if (params.amenities && params.amenities.length > 0) {
    chips.push({ key: "amenities", label: `${params.amenities.length} amenities` });
  }
  return chips;
}

function formatNairaShort(minorUnits: number): string {
  const naira = minorUnits; // already in kobo; for display, divide by 100
  if (naira >= 1_000_000_00) return `₦${(naira / 100 / 1_000_000).toFixed(1)}M`;
  if (naira >= 1_000_00) return `₦${(naira / 100 / 1_000).toFixed(0)}k`;
  return `₦${(naira / 100).toFixed(0)}`;
}
