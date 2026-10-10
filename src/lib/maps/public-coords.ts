import type { LatLng } from "./index";

/**
 * Public-coordinate obfuscation strategy.
 *
 * Per spec Section 8 (IMPORTANT PRIVACY RULE):
 *   * Private exact coordinates stored internally
 *   * Public coordinates are approximate (rounded ~100m)
 *   * Obfuscation must be DETERMINISTIC (derived from property ID or
 *     another stable non-secret identifier) — NOT random per page load
 *   * Random offset per page load creates an unstable user experience
 *
 * The existing `publicApproximate()` in index.ts rounds to 3 decimal
 * places (~111m). This module adds deterministic offset within that
 * 111m grid cell so the public marker doesn't sit exactly at the grid
 * intersection (which would make the rounding pattern obvious).
 *
 * The offset is derived from a hash of the property ID — stable across
 * page loads, but unpredictable without knowing the property ID (which
 * is already public).
 */

/**
 * Returns a deterministic public coordinate for a private coordinate.
 *
 * Strategy:
 *   1. Round to 3 decimal places (~111m grid cell) — same as publicApproximate
 *   2. Add a deterministic offset within the grid cell, derived from the
 *      property ID. The offset is at most 30% of the cell size (~33m),
 *      so the public marker stays within ~111m of the real location.
 *
 * @param privateLat Exact latitude
 * @param privateLng Exact longitude
 * @param propertyId Stable non-secret identifier (the property's UUID)
 */
export function deterministicPublicCoordinate(
  privateLat: number,
  privateLng: number,
  propertyId: string,
): LatLng {
  // Step 1: round to 3 decimal places
  const roundedLat = Math.round(privateLat * 1000) / 1000;
  const roundedLng = Math.round(privateLng * 1000) / 1000;

  // Step 2: deterministic offset within the ~111m cell
  const hash = hashString(propertyId);
  // Offset between 0 and 0.0003 degrees (~33m) in both lat + lng
  const latOffset = ((hash % 1000) / 1000) * 0.0003 - 0.00015; // -0.00015..+0.00015
  const lngOffset = (((hash >> 10) % 1000) / 1000) * 0.0003 - 0.00015;

  return {
    lat: roundedLat + latOffset,
    lng: roundedLng + lngOffset,
  };
}

/**
 * Simple string hash (djb2 variant). Returns a 32-bit unsigned integer.
 * Used for deterministic offset — NOT for security.
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0; // | 0 keeps it 32-bit
  }
  return Math.abs(hash);
}

/**
 * Returns true if the public coordinate should be shown on the map.
 * If the private coordinates are null, no public coordinates exist.
 */
export function hasPublicCoordinates(
  privateLat: number | null | undefined,
  privateLng: number | null | undefined,
): boolean {
  return (
    privateLat !== null &&
    privateLat !== undefined &&
    privateLng !== null &&
    privateLng !== undefined
  );
}
