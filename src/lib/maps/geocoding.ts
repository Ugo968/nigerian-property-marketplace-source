import { serverConfig } from "@/lib/security/server-config";
import { logger } from "@/lib/logging";
import type { LatLng } from "./index";
import { isValidLatitude, isValidLongitude } from "./coordinate-validation";

/**
 * Geocoding service — converts addresses to coordinates + vice versa.
 *
 * Per spec Section 6 + 32:
 *   * Provider abstraction: geocode(), reverseGeocode(), searchLocations()
 *   * Don't expose raw provider responses to the client
 *   * Normalize into the application's own location model
 *   * Use server-side service layer — don't call provider APIs from React
 *
 * Per spec Section 21 (cost control):
 *   * Server-side caching (geocoded results stored in the DB)
 *   * Don't geocode on every render
 *
 * Default provider: OpenStreetMap Nominatim (free, no API key).
 * Swap to Google/Mapbox by replacing the implementation.
 */

export interface GeocodeResult {
  coordinates: LatLng;
  /** Normalized display name (e.g. "Garki, Abuja, FCT") */
  displayName: string;
  /** Structured address components */
  country?: string;
  state?: string;
  city?: string;
  area?: string;
  landmark?: string;
}

export interface PlaceSearchResult {
  /** Unique place ID from the provider */
  placeId: string;
  displayName: string;
  coordinates: LatLng;
  /** Short description (e.g. "Neighbourhood, City, State") */
  description?: string;
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GeocodingProvider {
  readonly name: string;
  geocode(address: string): Promise<GeocodeResult | null>;
  reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null>;
  searchLocations(query: string): Promise<PlaceSearchResult[]>;
}

// ---------------------------------------------------------------------------
// OpenStreetMap Nominatim provider (free, no API key required)
// ---------------------------------------------------------------------------

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

class NominatimProvider implements GeocodingProvider {
  readonly name = "nominatim";

  async geocode(address: string): Promise<GeocodeResult | null> {
    if (!address || address.trim().length < 3) return null;

    const url = new URL(`${NOMINATIM_BASE}/search`);
    url.searchParams.set("q", address.trim());
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "ng"); // Nigeria focus
    url.searchParams.set("email", serverConfig.email.fromAddress);

    try {
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": `Shelty/1.0 (${serverConfig.email.fromAddress})`,
        },
        // Nominatim rate limit: 1 request/second
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        logger.warn("Nominatim geocode failed", { status: res.status });
        return null;
      }
      const data = (await res.json()) as Array<{
        lat: string;
        lon: string;
        display_name: string;
        address?: Record<string, string>;
      }>;
      if (!data || data.length === 0) return null;

      const first = data[0];
      const lat = Number(first.lat);
      const lng = Number(first.lon);
      if (!isValidLatitude(lat) || !isValidLongitude(lng)) return null;

      return {
        coordinates: { lat, lng },
        displayName: first.display_name,
        country: first.address?.country,
        state: first.address?.state,
        city: first.address?.city ?? first.address?.town ?? first.address?.village,
        area: first.address?.suburb ?? first.address?.neighbourhood,
      };
    } catch (err) {
      logger.warn("Nominatim geocode error", { error: String(err) });
      return null;
    }
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
    if (!isValidLatitude(lat) || !isValidLongitude(lng)) return null;

    const url = new URL(`${NOMINATIM_BASE}/reverse`);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("zoom", "14"); // neighbourhood level

    try {
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": `Shelty/1.0 (${serverConfig.email.fromAddress})`,
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        logger.warn("Nominatim reverse geocode failed", { status: res.status });
        return null;
      }
      const data = (await res.json()) as {
        lat: string;
        lon: string;
        display_name: string;
        address?: Record<string, string>;
      };
      if (!data || !data.lat) return null;

      return {
        coordinates: { lat: Number(data.lat), lng: Number(data.lon) },
        displayName: data.display_name,
        country: data.address?.country,
        state: data.address?.state,
        city: data.address?.city ?? data.address?.town ?? data.address?.village,
        area: data.address?.suburb ?? data.address?.neighbourhood,
      };
    } catch (err) {
      logger.warn("Nominatim reverse geocode error", { error: String(err) });
      return null;
    }
  }

  async searchLocations(query: string): Promise<PlaceSearchResult[]> {
    if (!query || query.trim().length < 3) return [];

    const url = new URL(`${NOMINATIM_BASE}/search`);
    url.searchParams.set("q", query.trim());
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "ng");

    try {
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": `Shelty/1.0 (${serverConfig.email.fromAddress})`,
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as Array<{
        place_id: string;
        lat: string;
        lon: string;
        display_name: string;
        address?: Record<string, string>;
      }>;
      if (!data || data.length === 0) return [];

      return data.map((item) => ({
        placeId: item.place_id,
        displayName: item.display_name,
        coordinates: { lat: Number(item.lat), lng: Number(item.lon) },
        description: [
          item.address?.suburb ?? item.address?.neighbourhood,
          item.address?.city ?? item.address?.town,
          item.address?.state,
        ]
          .filter(Boolean)
          .join(", "),
      }));
    } catch (err) {
      logger.warn("Nominatim search error", { error: String(err) });
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Stub provider — used when no geocoding is needed (dev/test)
// ---------------------------------------------------------------------------

class StubGeocodingProvider implements GeocodingProvider {
  readonly name = "stub";

  async geocode(_address: string): Promise<GeocodeResult | null> {
    return null;
  }

  async reverseGeocode(_lat: number, _lng: number): Promise<GeocodeResult | null> {
    return null;
  }

  async searchLocations(_query: string): Promise<PlaceSearchResult[]> {
    return [];
  }
}

/**
 * Singleton geocoding provider.
 *
 * In production: uses Nominatim (OpenStreetMap's free geocoding service).
 * In development: uses StubGeocodingProvider (no external calls).
 *
 * To swap to Google/Mapbox: replace this export with an implementation
 * of GeocodingProvider. No call-site changes needed.
 */
export const geocodingProvider: GeocodingProvider =
  process.env.NODE_ENV === "production"
    ? new NominatimProvider()
    : new StubGeocodingProvider();
