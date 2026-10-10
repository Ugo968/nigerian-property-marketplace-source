import { describe, it, expect } from "bun:test";
import {
  fullPropertyPublishSchema,
  propertyTitleSchema as _pts, // unused import test
  PROPERTY_TITLE_SCHEMA,
  PROPERTY_PRICE_SCHEMA,
  COORDINATE_LAT_SCHEMA,
  COORDINATE_LNG_SCHEMA,
  getRequiredFieldsForTransaction,
  shouldShowFurnishedStatus,
} from "@/lib/properties/validation";

describe("PROPERTY_TITLE_SCHEMA", () => {
  it("accepts a descriptive title", () => {
    const result = PROPERTY_TITLE_SCHEMA.safeParse("4-Bedroom Detached Duplex with BQ in Gwarinpa");
    expect(result.success).toBe(true);
  });

  it("rejects titles shorter than 10 chars", () => {
    const result = PROPERTY_TITLE_SCHEMA.safeParse("short");
    expect(result.success).toBe(false);
  });

  it("rejects titles longer than 200 chars", () => {
    const result = PROPERTY_TITLE_SCHEMA.safeParse("x".repeat(201));
    expect(result.success).toBe(false);
  });

  it("rejects titles with leading/trailing whitespace", () => {
    const result = PROPERTY_TITLE_SCHEMA.safeParse("  trimmed title here  ");
    expect(result.success).toBe(false);
  });
});

describe("PROPERTY_PRICE_SCHEMA", () => {
  it("accepts a positive integer price", () => {
    const result = PROPERTY_PRICE_SCHEMA.safeParse(3_500_000_00); // ₦3.5M in kobo
    expect(result.success).toBe(true);
  });

  it("accepts 0 (free / price on request)", () => {
    const result = PROPERTY_PRICE_SCHEMA.safeParse(0);
    expect(result.success).toBe(true);
  });

  it("rejects negative prices", () => {
    const result = PROPERTY_PRICE_SCHEMA.safeParse(-1);
    expect(result.success).toBe(false);
  });

  it("rejects decimal prices", () => {
    const result = PROPERTY_PRICE_SCHEMA.safeParse(3.5);
    expect(result.success).toBe(false);
  });

  it("rejects unreasonably high prices (> ₦1B)", () => {
    const result = PROPERTY_PRICE_SCHEMA.safeParse(2_000_000_000_00);
    expect(result.success).toBe(false);
  });
});

describe("COORDINATE_LAT_SCHEMA", () => {
  it("accepts valid latitude", () => {
    expect(COORDINATE_LAT_SCHEMA.safeParse(6.45).success).toBe(true);
    expect(COORDINATE_LAT_SCHEMA.safeParse(-6.45).success).toBe(true);
    expect(COORDINATE_LAT_SCHEMA.safeParse(0).success).toBe(true);
  });

  it("rejects latitude out of range", () => {
    expect(COORDINATE_LAT_SCHEMA.safeParse(91).success).toBe(false);
    expect(COORDINATE_LAT_SCHEMA.safeParse(-91).success).toBe(false);
  });
});

describe("COORDINATE_LNG_SCHEMA", () => {
  it("accepts valid longitude", () => {
    expect(COORDINATE_LNG_SCHEMA.safeParse(3.45).success).toBe(true);
    expect(COORDINATE_LNG_SCHEMA.safeParse(-3.45).success).toBe(true);
    expect(COORDINATE_LNG_SCHEMA.safeParse(180).success).toBe(true);
    expect(COORDINATE_LNG_SCHEMA.safeParse(-180).success).toBe(true);
  });

  it("rejects longitude out of range", () => {
    expect(COORDINATE_LNG_SCHEMA.safeParse(181).success).toBe(false);
    expect(COORDINATE_LNG_SCHEMA.safeParse(-181).success).toBe(false);
  });
});

describe("getRequiredFieldsForTransaction", () => {
  it("sale does NOT require a price frequency (uses one_off total)", () => {
    const result = getRequiredFieldsForTransaction("sale");
    expect(result.priceFrequency).toBe(false);
    expect(result.priceFrequencyOptions).toEqual(["one_off"]);
  });

  it("rent requires per_month or per_year", () => {
    const result = getRequiredFieldsForTransaction("rent");
    expect(result.priceFrequency).toBe(true);
    expect(result.priceFrequencyOptions).toEqual(["per_month", "per_year"]);
  });

  it("shortlet allows per_night, per_day, per_week, per_month", () => {
    const result = getRequiredFieldsForTransaction("shortlet");
    expect(result.priceFrequency).toBe(true);
    expect(result.priceFrequencyOptions).toContain("per_night");
    expect(result.priceFrequencyOptions).toContain("per_day");
    expect(result.priceFrequencyOptions).toContain("per_week");
    expect(result.priceFrequencyOptions).toContain("per_month");
  });
});

describe("shouldShowFurnishedStatus", () => {
  it("returns true for residential / commercial / industrial", () => {
    expect(shouldShowFurnishedStatus("residential")).toBe(true);
    expect(shouldShowFurnishedStatus("commercial")).toBe(true);
    expect(shouldShowFurnishedStatus("industrial")).toBe(true);
  });

  it("returns false for land", () => {
    expect(shouldShowFurnishedStatus("land")).toBe(false);
  });
});

describe("fullPropertyPublishSchema", () => {
  function validInput(overrides: Record<string, unknown> = {}) {
    return {
      title: "4-Bedroom Detached Duplex with BQ in Gwarinpa",
      description: "Spacious 4-bedroom duplex with boys quarters, located in a serene estate.",
      propertyTypeId: "123e4567-e89b-12d3-a456-426614174000",
      transactionType: "rent",
      price: 3_500_000_00,
      currency: "NGN",
      priceFrequency: "per_year",
      bedrooms: 4,
      bathrooms: 5,
      toilets: 6,
      parkingSpaces: 4,
      furnishedStatus: "furnished",
      country: "Nigeria",
      state: "FCT",
      city: "Abuja",
      area: "Gwarinpa",
      landmark: "Near Gwarinpa Estate Gate 2",
      addressLine: "12 Aminu Jamo Crescent",
      addressLga: "",
      privateLat: 9.123456,
      privateLng: 7.456789,
      amenityIds: [],
      ...overrides,
    };
  }

  it("accepts a valid complete rent listing", () => {
    const result = fullPropertyPublishSchema.safeParse(validInput());
    expect(result.success).toBe(true);
  });

  it("accepts a valid sale listing with one_off frequency", () => {
    const result = fullPropertyPublishSchema.safeParse(
      validInput({
        transactionType: "sale",
        priceFrequency: "one_off",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a valid shortlet listing with per_night frequency", () => {
    const result = fullPropertyPublishSchema.safeParse(
      validInput({
        transactionType: "shortlet",
        priceFrequency: "per_night",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects sale listing without one_off frequency", () => {
    const result = fullPropertyPublishSchema.safeParse(
      validInput({
        transactionType: "sale",
        priceFrequency: "per_month", // wrong for sale
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects rent listing without a frequency", () => {
    const result = fullPropertyPublishSchema.safeParse(
      validInput({
        transactionType: "rent",
        priceFrequency: null,
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects shortlet listing without a frequency", () => {
    const result = fullPropertyPublishSchema.safeParse(
      validInput({
        transactionType: "shortlet",
        priceFrequency: null,
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects when only one of lat/lng is set", () => {
    const result = fullPropertyPublishSchema.safeParse(
      validInput({
        privateLat: 9.12,
        privateLng: undefined,
      }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts when neither lat nor lng is set (coordinates optional)", () => {
    const result = fullPropertyPublishSchema.safeParse(
      validInput({
        privateLat: undefined,
        privateLng: undefined,
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects latitude out of range", () => {
    const result = fullPropertyPublishSchema.safeParse(
      validInput({
        privateLat: 95, // out of range
        privateLng: 7.45,
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects negative prices", () => {
    const result = fullPropertyPublishSchema.safeParse(
      validInput({ price: -1000 }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects title shorter than 10 chars", () => {
    const result = fullPropertyPublishSchema.safeParse(
      validInput({ title: "short" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects missing state or city", () => {
    const noState = fullPropertyPublishSchema.safeParse(
      validInput({ state: "" }),
    );
    expect(noState.success).toBe(false);

    const noCity = fullPropertyPublishSchema.safeParse(
      validInput({ city: "" }),
    );
    expect(noCity.success).toBe(false);
  });

  it("rejects too many amenities (> 50)", () => {
    // Generate 51 distinct valid UUIDs (vary the last digit)
    const tooMany = Array.from({ length: 51 }, (_, i) => {
      // Format a 12-char suffix with leading zero
      const suffix = String(i).padStart(12, "0");
      return `123e4567-e89b-12d3-a456-4266141740${suffix.slice(0, 3)}`.slice(0, 36);
    });
    const result = fullPropertyPublishSchema.safeParse(
      validInput({ amenityIds: tooMany }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects invalid furnished_status value", () => {
    const result = fullPropertyPublishSchema.safeParse(
      validInput({ furnishedStatus: "fully_furnished" }),
    );
    expect(result.success).toBe(false);
  });
});
