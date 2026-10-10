"use client";

import * as React from "react";
import { InteractiveMap, type MapMarker } from "./interactive-map";
import { formatNaira } from "@/lib/subscriptions/plans";
import type { SearchResult } from "@/lib/search/query-builder";
import type { LatLng } from "@/lib/maps";

/**
 * Search results map — displays all search results as markers.
 *
 * Per spec Sections 10, 11, 12, 22, 23:
 *   * Markers represent properties (custom icon, not default Leaflet pin)
 *   * Marker popup shows property summary + link to detail
 *   * Respects currently active filters (markers come from the same search results)
 *   * Efficient rendering — markers are rendered as a single layer (no
 *     per-marker React component overhead; Leaflet handles clustering
 *     at the DOM level)
 *   * Viewport change handler can trigger bounds-based search (debounced)
 */

export interface SearchResultsMapProps {
  results: SearchResult[];
  /** Called when the map viewport changes (debounced 500ms) */
  onViewportChange?: (bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  }) => void;
  height?: number | string;
}

export function SearchResultsMap({
  results,
  onViewportChange,
  height = 500,
}: SearchResultsMapProps) {
  // Filter results that have public coordinates
  const geolocatedResults = results.filter(
    (r) => r.public_lat !== null && r.public_lng !== null,
  );

  // Compute map center from the first result (or default to Nigeria center)
  const defaultCenter: LatLng = { lat: 9.0765, lng: 7.3986 }; // Nigeria center
  const center: LatLng =
    geolocatedResults.length > 0
      ? {
          lat: geolocatedResults[0].public_lat!,
          lng: geolocatedResults[0].public_lng!,
        }
      : defaultCenter;

  // Build markers
  const markers: MapMarker[] = geolocatedResults.map((result) => {
    const priceDisplay = result.price > 0 ? formatNaira(result.price) : "Price on request";
    const priceSuffix = result.price_frequency
      ? ` / ${result.price_frequency.replace(/_/g, " ")}`
      : "";
    return {
      id: result.id,
      position: { lat: result.public_lat!, lng: result.public_lng! },
      title: result.title,
      subtitle: [result.area, result.city, result.state].filter(Boolean).join(", "),
      priceLabel: `${priceDisplay}${priceSuffix}`,
      href: `/properties/${result.id}`,
    };
  });

  if (geolocatedResults.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground"
        style={{ height }}
      >
        No properties with map coordinates found.
      </div>
    );
  }

  return (
    <InteractiveMap
      center={center}
      zoom={12}
      markers={markers}
      onViewportChange={onViewportChange}
      height={height}
    />
  );
}
