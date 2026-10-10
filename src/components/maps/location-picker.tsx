"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Search, MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchLocationsAction } from "@/lib/maps/server-actions";
import type { LatLng } from "@/lib/maps";
import type { PlaceSearchResult } from "@/lib/maps/geocoding";

// Dynamically import InteractiveMap (Leaflet requires window)
const InteractiveMap = dynamic(
  () => import("./interactive-map").then((m) => m.InteractiveMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex items-center justify-center rounded-lg border bg-muted/30"
        style={{ height: 350 }}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

/**
 * Location picker — search + draggable marker.
 *
 * Per spec Section 5:
 *   * User searches for a location
 *   * Selects a location
 *   * Drags the marker
 *   * Confirms the location
 *   * Sees the selected coordinates
 *   * Can change the location
 *
 * Per spec Section 19 (autocomplete):
 *   * Debounced (300ms)
 *   * Minimum 3-character threshold
 *   * Request cancellation
 *   * Rate limiting
 *
 * Per spec Section 17:
 *   * Manual coordinates remain available as a fallback
 */

export interface LocationPickerProps {
  /** Initial marker position (existing coordinates) */
  initialPosition?: LatLng | null;
  /** Called when the user confirms a location */
  onLocationSelect: (location: {
    coordinates: LatLng;
    displayName?: string;
    state?: string;
    city?: string;
    area?: string;
  }) => void;
  /** Height of the map */
  height?: number;
}

export function LocationPicker({
  initialPosition,
  onLocationSelect,
  height = 350,
}: LocationPickerProps) {
  const [position, setPosition] = React.useState<LatLng | null>(initialPosition ?? null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [showManualEntry, setShowManualEntry] = React.useState(false);
  const [manualLat, setManualLat] = React.useState<string>(
    initialPosition ? String(initialPosition.lat) : "",
  );
  const [manualLng, setManualLng] = React.useState<string>(
    initialPosition ? String(initialPosition.lng) : "",
  );

  // Debounced search (300ms, min 3 chars)
  const searchTimeout = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }

    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchLocationsAction(searchQuery);
      setSearching(false);
      setSearchResults(results);
    }, 300);

    return () => clearTimeout(searchTimeout.current);
  }, [searchQuery]);

  function handleSelectResult(result: PlaceSearchResult) {
    setPosition(result.coordinates);
    setSearchQuery("");
    setSearchResults([]);
    onLocationSelect({
      coordinates: result.coordinates,
      displayName: result.displayName,
    });
  }

  function handleMarkerDrag(coords: LatLng) {
    setPosition(coords);
    onLocationSelect({ coordinates: coords });
  }

  function handleManualSubmit() {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setPosition({ lat, lng });
      onLocationSelect({ coordinates: { lat, lng } });
    }
  }

  // Default center: Abuja (Nigeria's capital) if no position set
  const mapCenter: LatLng = position ?? { lat: 9.0765, lng: 7.3986 };

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for a location (e.g. Garki, Lekki, Ikeja)"
          className="pl-9"
          aria-label="Search location"
        />
        {searching ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {/* Search results dropdown */}
      {searchResults.length > 0 ? (
        <ul className="border rounded-md bg-background shadow-sm max-h-48 overflow-y-auto">
          {searchResults.map((result) => (
            <li key={result.placeId}>
              <button
                type="button"
                onClick={() => handleSelectResult(result)}
                className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
              >
                <p className="font-medium text-foreground">{result.displayName}</p>
                {result.description ? (
                  <p className="text-xs text-muted-foreground">{result.description}</p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Map */}
      <InteractiveMap
        center={mapCenter}
        zoom={position ? 15 : 12}
        draggable
        onMarkerDrag={handleMarkerDrag}
        height={height}
      />

      {/* Selected coordinates */}
      {position ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          <span>
            Selected: {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Search above or drag the marker to set the property location.
        </p>
      )}

      {/* Manual entry fallback */}
      <div>
        <button
          type="button"
          onClick={() => setShowManualEntry(!showManualEntry)}
          className="text-xs text-primary hover:underline"
        >
          {showManualEntry ? "Hide manual entry" : "Enter coordinates manually"}
        </button>
        {showManualEntry ? (
          <div className="flex gap-2 mt-2">
            <Input
              type="number"
              placeholder="Latitude (-90 to 90)"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              className="flex-1"
              step="0.000001"
              min={-90}
              max={90}
            />
            <Input
              type="number"
              placeholder="Longitude (-180 to 180)"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              className="flex-1"
              step="0.000001"
              min={-180}
              max={180}
            />
            <Button type="button" size="sm" onClick={handleManualSubmit}>
              Set
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
