import { describe, it, expect } from "bun:test";
import {
  isValidLatitude,
  isValidLongitude,
  validateCoordinatePair,
  isInNigeria,
  validateBoundingBox,
  parseBoundingBox,
  NIGERIA_BOUNDS,
} from "@/lib/maps/coordinate-validation";

describe("isValidLatitude", () => {
  it("accepts valid latitudes", () => {
    expect(isValidLatitude(0)).toBe(true);
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(6.451234)).toBe(true);
    expect(isValidLatitude(-6.45)).toBe(true);
  });

  it("rejects out-of-range latitudes", () => {
    expect(isValidLatitude(91)).toBe(false);
    expect(isValidLatitude(-91)).toBe(false);
    expect(isValidLatitude(999)).toBe(false);
    expect(isValidLatitude(-999)).toBe(false);
  });

  it("rejects non-finite values", () => {
    expect(isValidLatitude(NaN)).toBe(false);
    expect(isValidLatitude(Infinity)).toBe(false);
    expect(isValidLatitude(-Infinity)).toBe(false);
  });
});

describe("isValidLongitude", () => {
  it("accepts valid longitudes", () => {
    expect(isValidLongitude(0)).toBe(true);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(-180)).toBe(true);
    expect(isValidLongitude(3.451234)).toBe(true);
    expect(isValidLongitude(-3.45)).toBe(true);
  });

  it("rejects out-of-range longitudes", () => {
    expect(isValidLongitude(181)).toBe(false);
    expect(isValidLongitude(-181)).toBe(false);
    expect(isValidLongitude(900)).toBe(false);
    expect(isValidLongitude(-900)).toBe(false);
  });

  it("rejects non-finite values", () => {
    expect(isValidLongitude(NaN)).toBe(false);
    expect(isValidLongitude(Infinity)).toBe(false);
    expect(isValidLongitude(-Infinity)).toBe(false);
  });
});

describe("validateCoordinatePair", () => {
  it("accepts both set + valid", () => {
    const result = validateCoordinatePair(6.45, 3.45);
    expect(result.ok).toBe(true);
  });

  it("accepts both null (coordinates optional)", () => {
    expect(validateCoordinatePair(null, null).ok).toBe(true);
    expect(validateCoordinatePair(undefined, undefined).ok).toBe(true);
  });

  it("rejects when only one is set", () => {
    const result = validateCoordinatePair(6.45, null);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("both be set");
  });

  it("rejects when only longitude is set", () => {
    const result = validateCoordinatePair(null, 3.45);
    expect(result.ok).toBe(false);
  });

  it("rejects invalid latitude", () => {
    const result = validateCoordinatePair(999, 3.45);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Latitude");
  });

  it("rejects invalid longitude", () => {
    const result = validateCoordinatePair(6.45, -900);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Longitude");
  });
});

describe("isInNigeria", () => {
  it("returns true for coordinates within Nigeria", () => {
    expect(isInNigeria(9.0765, 7.3986)).toBe(true); // Abuja
    expect(isInNigeria(6.5244, 3.3792)).toBe(true); // Lagos
    expect(isInNigeria(4.8156, 7.0498)).toBe(true); // Port Harcourt
  });

  it("returns false for coordinates outside Nigeria", () => {
    expect(isInNigeria(51.5074, -0.1278)).toBe(false); // London
    expect(isInNigeria(40.7128, -74.006)).toBe(false); // New York
    expect(isInNigeria(0, 0)).toBe(false); // Gulf of Guinea
  });

  it("respects Nigeria bounds", () => {
    expect(isInNigeria(NIGERIA_BOUNDS.minLat, NIGERIA_BOUNDS.minLng)).toBe(true);
    expect(isInNigeria(NIGERIA_BOUNDS.maxLat, NIGERIA_BOUNDS.maxLng)).toBe(true);
    expect(isInNigeria(NIGERIA_BOUNDS.minLat - 0.1, NIGERIA_BOUNDS.minLng)).toBe(false);
  });
});

describe("validateBoundingBox", () => {
  it("accepts a valid bounding box", () => {
    const result = validateBoundingBox({
      north: 10,
      south: 8,
      east: 10,
      west: 6,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects when north <= south", () => {
    const result = validateBoundingBox({
      north: 8,
      south: 8,
      east: 10,
      west: 6,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects when east <= west", () => {
    const result = validateBoundingBox({
      north: 10,
      south: 8,
      east: 6,
      west: 6,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects out-of-range bounds", () => {
    expect(
      validateBoundingBox({ north: 999, south: 8, east: 10, west: 6 }).ok,
    ).toBe(false);
    expect(
      validateBoundingBox({ north: 10, south: 8, east: 999, west: 6 }).ok,
    ).toBe(false);
  });
});

describe("parseBoundingBox", () => {
  it("parses a valid bounds string", () => {
    const result = parseBoundingBox("10,8,10,6");
    expect(result).toEqual({ north: 10, south: 8, east: 10, west: 6 });
  });

  it("returns null for null input", () => {
    expect(parseBoundingBox(null)).toBeNull();
    expect(parseBoundingBox(undefined)).toBeNull();
  });

  it("returns null for invalid format", () => {
    expect(parseBoundingBox("10,8,10")).toBeNull();
    expect(parseBoundingBox("abc,def,ghi,jkl")).toBeNull();
  });

  it("returns null for invalid bounds (north <= south)", () => {
    expect(parseBoundingBox("5,10,10,6")).toBeNull();
  });
});
