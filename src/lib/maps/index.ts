/**
 * Map provider abstraction.
 *
 * The default implementation uses OpenStreetMap raster tiles via Leaflet —
 * free, no API key required, perfect for a Nigerian marketplace that wants
 * to ship without a Google Maps billing relationship. The
 * `MAPS_PROVIDER_KEY` env var exists so a future Google Maps provider can
 * be swapped in without changing call sites.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapProvider {
  /** Read-only identifier so call sites can branch on provider. */
  readonly name: "openstreetmap" | "google";
  /**
   * Returns a static map image URL for the given lat/lng + zoom + size.
   * Used in property cards and detail pages where an interactive map
   * is overkill.
   */
  staticMapUrl(input: {
    center: LatLng;
    zoom: number;
    width: number;
    height: number;
    /** Optional marker style override. */
    markerColor?: string;
  }): string;
  /**
   * Returns the tile URL template for an interactive Leaflet map.
   * Format expected: {x} {y} {z} placeholders.
   */
  tileUrlTemplate(): string;
  /** Attribution HTML shown in the corner of every map. */
  attribution(): string;
}

class OpenStreetMapProvider implements MapProvider {
  readonly name = "openstreetmap" as const;

  staticMapUrl({
    center,
    zoom,
    width,
    height,
    markerColor = "0f5132",
  }: {
    center: LatLng;
    zoom: number;
    width: number;
    height: number;
    markerColor?: string;
  }) {
    // OSM static map service — see https://staticmap.openstreetmap.de
    const params = new URLSearchParams({
      center: `${center.lat},${center.lng}`,
      zoom: String(zoom),
      size: `${width}x${height}`,
    });
    const marker = `${markerColor},pushpin|${center.lat},${center.lng}`;
    return `https://staticmap.openstreetmap.de/staticmap.php?${params.toString()}&markers=${marker}`;
  }

  tileUrlTemplate() {
    return "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  }

  attribution() {
    return `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>`;
  }
}

/**
 * Singleton map provider. Swap to Google Maps by replacing this export.
 */
export const mapProvider: MapProvider = new OpenStreetMapProvider();

/**
 * Returns an approximate public coordinate for an exact private one.
 *
 * Nigerian real-estate marketplace safety pattern: don't expose the
 * exact private address by default. Round to ~100m of the real location
 * for the public map pin. Exact address is released only after a
 * representation relationship is accepted.
 */
export function publicApproximate(lat: number, lng: number): LatLng {
  // ~0.001 degrees ≈ 111m at the equator.
  return {
    lat: Math.round(lat * 1000) / 1000,
    lng: Math.round(lng * 1000) / 1000,
  };
}
