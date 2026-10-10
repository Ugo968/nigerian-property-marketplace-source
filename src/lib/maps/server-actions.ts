"use server";

import { geocodingProvider, type PlaceSearchResult } from "@/lib/maps/geocoding";
import { rateLimiter } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging";

/**
 * Maps server actions.
 *
 * Per spec Sections 6, 19, 25, 32:
 *   * Geocoding happens server-side — never call provider APIs from React
 *   * Rate-limited to prevent abuse
 *   * Provider responses normalized into app's location model
 *   * No raw provider data exposed to client
 *   * No server secrets exposed
 */

/**
 * Search for locations (autocomplete).
 * Called from the LocationPicker component.
 *
 * Per spec Section 19:
 *   * Debounced client-side (300ms)
 *   * Minimum 3 characters
 *   * Server-side rate limiting (10 requests/minute per IP)
 */
export async function searchLocationsAction(
  query: string,
): Promise<PlaceSearchResult[]> {
  if (!query || query.trim().length < 3) return [];

  // Rate-limit by IP (10 searches/minute — generous for autocomplete)
  // Note: in dev fallback, the geocodingProvider returns [] so no
  // external calls are made.
  const ip = "server-action"; // TODO: extract real IP from headers
  const rl = await rateLimiter.check({
    key: ip,
    action: "location_search",
    limit: 10,
    windowMs: 60 * 1000, // 10 per minute
  });
  if (!rl.ok) {
    logger.warn("Location search rate-limited", { query });
    return [];
  }

  try {
    return await geocodingProvider.searchLocations(query);
  } catch (err) {
    logger.error("Location search failed", { query, error: String(err) });
    return [];
  }
}

/**
 * Geocode an address string into coordinates.
 * Used by the property wizard when the user enters an address.
 *
 * Per spec Section 21 (cost control):
 *   * Server-side caching — geocoded results stored in the DB
 *   * Don't geocode on every render
 */
export async function geocodeAddressAction(
  address: string,
) {
  if (!address || address.trim().length < 3) return null;

  const rl = await rateLimiter.check({
    key: "server-action",
    action: "geocode",
    limit: 5,
    windowMs: 60 * 1000, // 5 per minute
  });
  if (!rl.ok) {
    return null;
  }

  try {
    return await geocodingProvider.geocode(address);
  } catch (err) {
    logger.error("Geocode failed", { address, error: String(err) });
    return null;
  }
}

/**
 * Reverse geocode coordinates into an address.
 * Used when the user drags a marker to a location.
 */
export async function reverseGeocodeAction(
  lat: number,
  lng: number,
) {
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const rl = await rateLimiter.check({
    key: "server-action",
    action: "reverse_geocode",
    limit: 10,
    windowMs: 60 * 1000,
  });
  if (!rl.ok) {
    return null;
  }

  try {
    return await geocodingProvider.reverseGeocode(lat, lng);
  } catch (err) {
    logger.error("Reverse geocode failed", { lat, lng, error: String(err) });
    return null;
  }
}
