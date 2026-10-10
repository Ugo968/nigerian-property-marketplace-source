import { describe, it, expect } from "bun:test";
import {
  deterministicPublicCoordinate,
  hasPublicCoordinates,
} from "@/lib/maps/public-coords";

describe("deterministicPublicCoordinate", () => {
  it("returns coordinates near the private location (within ~111m)", () => {
    const privateLat = 9.0765;
    const privateLng = 7.3986;
    const propertyId = "123e4567-e89b-12d3-a456-426614174000";

    const public1 = deterministicPublicCoordinate(privateLat, privateLng, propertyId);
    const public2 = deterministicPublicCoordinate(privateLat, privateLng, propertyId);

    // Should be deterministic — same input = same output
    expect(public1.lat).toBe(public2.lat);
    expect(public1.lng).toBe(public2.lng);

    // Should be close to the private location (within ~111m = ~0.001 degrees)
    const latDiff = Math.abs(public1.lat - privateLat);
    const lngDiff = Math.abs(public1.lng - privateLng);
    expect(latDiff).toBeLessThan(0.001);
    expect(lngDiff).toBeLessThan(0.001);
  });

  it("produces different results for different property IDs", () => {
    const lat = 9.0765;
    const lng = 7.3986;
    const id1 = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const id2 = "11111111-2222-3333-4444-555555555555";

    const pub1 = deterministicPublicCoordinate(lat, lng, id1);
    const pub2 = deterministicPublicCoordinate(lat, lng, id2);

    // Different property IDs → different offsets (with very high probability)
    // At least one of lat/lng should differ
    const differs = pub1.lat !== pub2.lat || pub1.lng !== pub2.lng;
    expect(differs).toBe(true);
  });

  it("is stable across multiple calls (deterministic, not random)", () => {
    const lat = 6.5244;
    const lng = 3.3792;
    const id = "abc-123-def-456";

    const results = Array.from({ length: 10 }, () =>
      deterministicPublicCoordinate(lat, lng, id),
    );

    // All 10 results should be identical
    const allSameLat = results.every((r) => r.lat === results[0].lat);
    const allSameLng = results.every((r) => r.lng === results[0].lng);
    expect(allSameLat).toBe(true);
    expect(allSameLng).toBe(true);
  });

  it("preserves the general area (Nigeria stays Nigeria)", () => {
    // Abuja coordinates
    const abujaLat = 9.0765;
    const abujaLng = 7.3986;
    const pub = deterministicPublicCoordinate(abujaLat, abujaLng, "test-id");

    // Public coordinate should still be in the Nigeria region
    expect(pub.lat).toBeGreaterThan(8);
    expect(pub.lat).toBeLessThan(10);
    expect(pub.lng).toBeGreaterThan(6);
    expect(pub.lng).toBeLessThan(8);
  });
});

describe("hasPublicCoordinates", () => {
  it("returns true when both coordinates are set", () => {
    expect(hasPublicCoordinates(9.07, 7.39)).toBe(true);
  });

  it("returns false when either coordinate is null/undefined", () => {
    expect(hasPublicCoordinates(null, 7.39)).toBe(false);
    expect(hasPublicCoordinates(9.07, null)).toBe(false);
    expect(hasPublicCoordinates(undefined, 7.39)).toBe(false);
    expect(hasPublicCoordinates(9.07, undefined)).toBe(false);
    expect(hasPublicCoordinates(null, null)).toBe(false);
    expect(hasPublicCoordinates(undefined, undefined)).toBe(false);
  });
});
