import { describe, it, expect } from "bun:test";
import {
  geocodingProvider,
  type GeocodingProvider,
  type PlaceSearchResult,
} from "@/lib/maps/geocoding";

describe("geocodingProvider", () => {
  it("is a GeocodingProvider instance", () => {
    expect(geocodingProvider).toBeDefined();
    expect(geocodingProvider.name).toBeDefined();
    expect(typeof geocodingProvider.geocode).toBe("function");
    expect(typeof geocodingProvider.reverseGeocode).toBe("function");
    expect(typeof geocodingProvider.searchLocations).toBe("function");
  });

  it("in development, uses a stub provider that returns empty results", () => {
    // In the dev sandbox, NODE_ENV !== "production" so the stub is used.
    // This means no external API calls are made — keeping tests fast + offline.
    if (process.env.NODE_ENV !== "production") {
      expect(geocodingProvider.name).toBe("stub");
    }
  });

  it("stub geocode returns null for any address", async () => {
    if (process.env.NODE_ENV === "production") return; // skip in prod
    const result = await geocodingProvider.geocode("Lagos, Nigeria");
    expect(result).toBeNull();
  });

  it("stub reverseGeocode returns null", async () => {
    if (process.env.NODE_ENV === "production") return;
    const result = await geocodingProvider.reverseGeocode(6.5244, 3.3792);
    expect(result).toBeNull();
  });

  it("stub searchLocations returns empty array", async () => {
    if (process.env.NODE_ENV === "production") return;
    const results = await geocodingProvider.searchLocations("Lagos");
    expect(results).toEqual([]);
  });

  it("stub searchLocations returns empty for short queries", async () => {
    if (process.env.NODE_ENV === "production") return;
    const results = await geocodingProvider.searchLocations("ab");
    expect(results).toEqual([]);
  });
});

describe("GeocodingProvider interface compliance", () => {
  // Verify the interface shape is correct — ensures future providers
  // can be swapped without breaking call sites.
  it("has geocode(address: string) → Promise<GeocodeResult | null>", () => {
    const fn = geocodingProvider.geocode;
    expect(typeof fn).toBe("function");
    // The function should accept a string argument
    const result = fn("test");
    expect(result).toBeInstanceOf(Promise);
  });

  it("has reverseGeocode(lat, lng) → Promise<GeocodeResult | null>", () => {
    const fn = geocodingProvider.reverseGeocode;
    expect(typeof fn).toBe("function");
    const result = fn(0, 0);
    expect(result).toBeInstanceOf(Promise);
  });

  it("has searchLocations(query: string) → Promise<PlaceSearchResult[]>", () => {
    const fn = geocodingProvider.searchLocations;
    expect(typeof fn).toBe("function");
    const result = fn("test");
    expect(result).toBeInstanceOf(Promise);
  });
});

describe("PlaceSearchResult type shape", () => {
  it("has the expected fields", () => {
    const sample: PlaceSearchResult = {
      placeId: "123",
      displayName: "Garki, Abuja, FCT",
      coordinates: { lat: 9.0765, lng: 7.3986 },
      description: "Garki, Abuja, FCT",
    };
    expect(sample.placeId).toBe("123");
    expect(sample.coordinates.lat).toBe(9.0765);
    expect(sample.coordinates.lng).toBe(7.3986);
  });
});
