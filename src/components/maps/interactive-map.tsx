"use client";

import * as React from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { mapProvider } from "@/lib/maps";
import type { LatLng } from "@/lib/maps";
import Link from "next/link";

// Fix default marker icon for Leaflet in bundlers
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Import Leaflet CSS (loaded once at module level)
import "leaflet/dist/leaflet.css";

export interface MapMarker {
  id: string;
  position: LatLng;
  title: string;
  subtitle?: string;
  href?: string;
  priceLabel?: string;
}

export interface InteractiveMapProps {
  center: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  onMarkerDrag?: (position: LatLng) => void;
  draggable?: boolean;
  onViewportChange?: (bounds: { north: number; south: number; east: number; west: number }) => void;
  height?: number | string;
  showAttribution?: boolean;
  className?: string;
}

/**
 * Error boundary for the map. Per spec Section 29:
 *   * If map fails, don't break the page — show text fallback.
 */
class MapErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function InteractiveMap({
  center,
  zoom = 13,
  markers = [],
  onMarkerDrag,
  draggable = false,
  onViewportChange,
  height = 400,
  showAttribution = true,
  className,
}: InteractiveMapProps) {
  const fallback = (
    <div
      className="flex items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground"
      style={{ height }}
    >
      Map unavailable
    </div>
  );

  return (
    <MapErrorBoundary fallback={fallback}>
      <div
        className={`relative rounded-lg overflow-hidden border ${className ?? ""}`}
        style={{ height }}
        role="region"
        aria-label="Property map"
      >
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={zoom}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
          attributionControl={showAttribution}
        >
          <TileLayer
            url={mapProvider.tileUrlTemplate()}
            attribution={mapProvider.attribution()}
          />

          {draggable && onMarkerDrag ? (
            <Marker
              position={[center.lat, center.lng]}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const marker = e.target as L.Marker;
                  const pos = marker.getLatLng();
                  onMarkerDrag({ lat: pos.lat, lng: pos.lng });
                },
              }}
            >
              <Popup>Property location</Popup>
            </Marker>
          ) : null}

          {markers.map((marker) => (
            <Marker
              key={marker.id}
              position={[marker.position.lat, marker.position.lng]}
              icon={createPropertyIcon()}
            >
              <Popup>
                <div className="space-y-1">
                  <p className="font-semibold text-sm">{marker.title}</p>
                  {marker.priceLabel ? (
                    <p className="text-primary font-medium text-sm">{marker.priceLabel}</p>
                  ) : null}
                  {marker.subtitle ? (
                    <p className="text-xs text-muted-foreground">{marker.subtitle}</p>
                  ) : null}
                  {marker.href ? (
                    <Link href={marker.href} className="text-xs text-primary hover:underline">
                      View property
                    </Link>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          ))}

          {onViewportChange ? (
            <ViewportChangeHandler onViewportChange={onViewportChange} />
          ) : null}
        </MapContainer>
      </div>
    </MapErrorBoundary>
  );
}

function createPropertyIcon(): L.DivIcon {
  return L.divIcon({
    className: "property-marker",
    html: `<div style="
      background: hsl(152 38% 38%);
      color: white;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

function ViewportChangeHandler({
  onViewportChange,
}: {
  onViewportChange: (bounds: { north: number; south: number; east: number; west: number }) => void;
}) {
  const map = useMap();

  React.useEffect(() => {
    const handler = () => {
      const bounds = map.getBounds();
      onViewportChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
    };

    let timeout: ReturnType<typeof setTimeout>;
    const debouncedHandler = () => {
      clearTimeout(timeout);
      timeout = setTimeout(handler, 500);
    };

    map.on("moveend", debouncedHandler);
    return () => {
      map.off("moveend", debouncedHandler);
      clearTimeout(timeout);
    };
  }, [map, onViewportChange]);

  return null;
}
