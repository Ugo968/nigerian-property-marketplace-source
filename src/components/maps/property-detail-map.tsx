"use client";

import * as React from "react";
import { MapPin, AlertCircle } from "lucide-react";
import { InteractiveMap, type MapMarker } from "./interactive-map";
import type { LatLng } from "@/lib/maps";

/**
 * Property detail map — read-only map showing the property's
 * APPROXIMATE public location.
 *
 * Per spec Sections 7, 8, 9, 29:
 *   * Shows "Approximate location" label (not exact)
 *   * Uses public_lat/public_lng (already obfuscated from Phase 6)
 *   * Falls back to text-only location if map fails
 *   * No private exact address exposed
 */

export interface PropertyDetailMapProps {
  /** Public approximate coordinates (already rounded by the server) */
  publicLat: number | null;
  publicLng: number | null;
  /** Text-only location (used as fallback + screen-reader alt) */
  locationText: string;
  landmark?: string | null;
  height?: number;
}

export function PropertyDetailMap({
  publicLat,
  publicLng,
  locationText,
  landmark,
  height = 300,
}: PropertyDetailMapProps) {
  // If no public coordinates, show text-only fallback
  if (publicLat === null || publicLng === null || publicLat === undefined || publicLng === undefined) {
    return (
      <section className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <h2 className="text-lg font-semibold">Location</h2>
        <p className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          {locationText}
          {landmark ? ` · Near ${landmark}` : ""}
        </p>
      </section>
    );
  }

  const center: LatLng = { lat: publicLat, lng: publicLng };
  const markers: MapMarker[] = [
    {
      id: "property",
      position: center,
      title: "Property location",
      subtitle: "Approximate — exact address shared after contact",
    },
  ];

  return (
    <section className="rounded-lg border bg-background p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Location</h2>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Approximate location
        </span>
      </div>

      <p className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <MapPin className="h-4 w-4" aria-hidden="true" />
        {locationText}
        {landmark ? ` · Near ${landmark}` : ""}
      </p>

      <InteractiveMap
        center={center}
        zoom={14}
        markers={markers}
        height={height}
      />

      <p className="text-xs text-muted-foreground">
        Exact address is shared only after you contact the lister.
      </p>
    </section>
  );
}
