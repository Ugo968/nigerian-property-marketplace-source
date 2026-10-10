/**
 * Coordinate validation + Nigeria geographic bounds.
 *
 * Per spec Sections 13, 17, 25:
 *   * Validate all coordinate values server-side
 *   * Latitude between -90 and 90
 *   * Longitude between -180 and 180
 *   * Reject obviously invalid coordinates (lat=999, lng=-900)
 *   * Nigeria bounds: lat 4.2–13.9, lng 2.7–14.7
 */

export interface CoordinateValidationResult {
  ok: boolean;
  error?: string;
}

export const NIGERIA_BOUNDS = {
  minLat: 4.2,
  maxLat: 13.9,
  minLng: 2.7,
  maxLng: 14.7,
} as const;

/**
 * Validates a latitude value.
 * Must be between -90 and 90 (inclusive).
 */
export function isValidLatitude(lat: number): boolean {
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90
  );
}

/**
 * Validates a longitude value.
 * Must be between -180 and 180 (inclusive).
 */
export function isValidLongitude(lng: number): boolean {
  return (
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Validates a coordinate pair (lat + lng).
 * Both must be set or both must be null.
 */
export function validateCoordinatePair(
  lat: number | null | undefined,
  lng: number | null | undefined,
): CoordinateValidationResult {
  const hasLat = lat !== null && lat !== undefined;
  const hasLng = lng !== null && lng !== undefined;

  // Both must be present or both absent
  if (hasLat !== hasLng) {
    return {
      ok: false,
      error: "Latitude and longitude must both be set or both be empty.",
    };
  }

  if (!hasLat && !hasLng) {
    return { ok: true }; // both null = valid (coordinates optional)
  }

  if (!isValidLatitude(lat!)) {
    return {
      ok: false,
      error: `Latitude must be between -90 and 90 (got ${lat}).`,
    };
  }

  if (!isValidLongitude(lng!)) {
    return {
      ok: false,
      error: `Longitude must be between -180 and 180 (got ${lng}).`,
    };
  }

  return { ok: true };
}

/**
 * Returns true if coordinates fall within Nigeria's bounding box.
 * Nigeria: lat 4.2–13.9, lng 2.7–14.7
 *
 * Used to warn (not block) when a user picks coordinates outside Nigeria
 * for a Nigerian marketplace listing.
 */
export function isInNigeria(lat: number, lng: number): boolean {
  return (
    lat >= NIGERIA_BOUNDS.minLat &&
    lat <= NIGERIA_BOUNDS.maxLat &&
    lng >= NIGERIA_BOUNDS.minLng &&
    lng <= NIGERIA_BOUNDS.maxLng
  );
}

/**
 * Validates a bounding box for viewport-based map search.
 * Per spec Section 13: /properties?bounds=north,south,east,west
 */
export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export function validateBoundingBox(bounds: BoundingBox): CoordinateValidationResult {
  if (!isValidLatitude(bounds.north)) {
    return { ok: false, error: "North bound must be valid latitude (-90 to 90)." };
  }
  if (!isValidLatitude(bounds.south)) {
    return { ok: false, error: "South bound must be valid latitude (-90 to 90)." };
  }
  if (!isValidLongitude(bounds.east)) {
    return { ok: false, error: "East bound must be valid longitude (-180 to 180)." };
  }
  if (!isValidLongitude(bounds.west)) {
    return { ok: false, error: "West bound must be valid longitude (-180 to 180)." };
  }
  if (bounds.north <= bounds.south) {
    return { ok: false, error: "North bound must be greater than south bound." };
  }
  if (bounds.east <= bounds.west) {
    return { ok: false, error: "East bound must be greater than west bound." };
  }
  return { ok: true };
}

/**
 * Parses a bounds query string "north,south,east,west" into a BoundingBox.
 * Returns null if parsing fails.
 */
export function parseBoundingBox(value: string | null | undefined): BoundingBox | null {
  if (!value) return null;
  const parts = value.split(",").map((s) => s.trim());
  if (parts.length !== 4) return null;
  const [n, s, e, w] = parts.map(Number);
  if (![n, s, e, w].every((v) => Number.isFinite(v))) return null;
  const bounds = { north: n, south: s, east: e, west: w };
  return validateBoundingBox(bounds).ok ? bounds : null;
}
