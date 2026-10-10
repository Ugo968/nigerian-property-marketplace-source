import { z } from "zod";
import { TRANSACTION_TYPES, PRICE_FREQUENCIES } from "@/types";

/**
 * Property validation schemas.
 *
 * Per spec Section 38: validation adapts to property type.
 *   - Land: bedrooms/bathrooms NOT required (defaults to 0)
 *   - Apartment: bedrooms/bathrooms relevant
 *   - Commercial: bedrooms irrelevant
 *   - Short-let: price frequency supports per_night
 *
 * Per spec Section 8: title must be descriptive, readable, not spam.
 * Per spec Section 9: description is rich but controlled — no raw HTML.
 *
 * Per spec Section 10: pricing adapts to transaction type.
 *   - Sale → price_frequency = 'one_off' (total)
 *   - Rent → per_month or per_year (Nigeria commonly annual)
 *   - Short-let → per_day, per_week, per_month, or per_night
 *
 * Server-side parse() is authoritative. Client-side validation is for UX.
 */

// ---------------------------------------------------------------------------
// Reusable primitives
// ---------------------------------------------------------------------------

export const PROPERTY_TITLE_SCHEMA = z
  .string()
  .min(10, "Title must be at least 10 characters")
  .max(200, "Title is too long (max 200 characters)")
  .refine((value) => value.trim() === value, {
    message: "Title must not have leading or trailing whitespace",
  });

export const PROPERTY_DESCRIPTION_SCHEMA = z
  .string()
  .max(5000, "Description is too long (max 5000 characters)")
  .optional()
  .or(z.literal(""));

export const PROPERTY_PRICE_SCHEMA = z
  .number()
  .int("Price must be a whole number")
  .min(0, "Price cannot be negative")
  .max(1_000_000_000_00, "Price seems unreasonably high (max ₦1,000,000,000)");

export const PRICE_FREQUENCY_SCHEMA = z.enum(PRICE_FREQUENCIES);

export const TRANSACTION_TYPE_SCHEMA = z.enum(TRANSACTION_TYPES);

export const COORDINATE_LAT_SCHEMA = z
  .number()
  .min(-90, "Latitude must be between -90 and 90")
  .max(90, "Latitude must be between -90 and 90");

export const COORDINATE_LNG_SCHEMA = z
  .number()
  .min(-180, "Longitude must be between -180 and 180")
  .max(180, "Longitude must be between -180 and 180");

// ---------------------------------------------------------------------------
// Step 1+2: Type + transaction selection
// ---------------------------------------------------------------------------

export const propertyTypeChoiceSchema = z.object({
  propertyTypeId: z.string().uuid("Select a property type"),
});

export const transactionChoiceSchema = z.object({
  transactionType: TRANSACTION_TYPE_SCHEMA,
});

// ---------------------------------------------------------------------------
// Step 3: Basic details
// ---------------------------------------------------------------------------

export const propertyBasicDetailsSchema = z.object({
  title: PROPERTY_TITLE_SCHEMA,
  bedrooms: z.number().int().min(0).max(50).default(0),
  bathrooms: z.number().int().min(0).max(50).default(0),
  toilets: z.number().int().min(0).max(50).default(0),
  yearBuilt: z
    .number()
    .int()
    .min(1800)
    .max(new Date().getFullYear() + 1)
    .optional(),
  parkingSpaces: z.number().int().min(0).max(1000).default(0),
  floors: z.number().int().min(0).max(200).optional(),
});

// ---------------------------------------------------------------------------
// Step 4: Pricing
// ---------------------------------------------------------------------------

export const propertyPricingSchema = z.object({
  price: PROPERTY_PRICE_SCHEMA,
  currency: z.enum(["NGN", "USD"]).default("NGN"),
  priceFrequency: PRICE_FREQUENCY_SCHEMA.nullable(),
});

// ---------------------------------------------------------------------------
// Step 5: Location
// ---------------------------------------------------------------------------

export const propertyLocationSchema = z
  .object({
    country: z.string().min(2).max(60).default("Nigeria"),
    state: z.string().min(2, "State is required").max(60),
    city: z.string().min(2, "City is required").max(60),
    area: z.string().max(120).optional().or(z.literal("")),
    landmark: z.string().max(200).optional().or(z.literal("")),
    addressLine: z.string().max(300).optional().or(z.literal("")),
    addressLga: z.string().max(60).optional().or(z.literal("")),
    privateLat: COORDINATE_LAT_SCHEMA.optional(),
    privateLng: COORDINATE_LNG_SCHEMA.optional(),
  })
  .refine(
    (data) => {
      const hasLat = data.privateLat !== undefined && data.privateLat !== null;
      const hasLng = data.privateLng !== undefined && data.privateLng !== null;
      return hasLat === hasLng;
    },
    {
      message: "Latitude and longitude must both be set or both be empty",
    },
  );

// ---------------------------------------------------------------------------
// Step 6: Features & amenities
// ---------------------------------------------------------------------------

export const propertyFeaturesSchema = z.object({
  furnishedStatus: z.enum([
    "furnished",
    "semi_furnished",
    "unfurnished",
    "not_applicable",
  ]),
  sizeValue: z.number().positive().max(1_000_000).optional(),
  sizeUnit: z.enum(["sqm", "sqft", "acre", "hectare", "plot"]).optional(),
  amenityIds: z.array(z.string().uuid()).max(50, "Too many amenities").default([]),
});

// ---------------------------------------------------------------------------
// Step 7: Photos & videos
//    (validation happens per-file via the media-upload action; this schema
//    is just used to verify the count at publish time)
// ---------------------------------------------------------------------------

export const propertyMediaSchema = z.object({
  hasMinimumPhotos: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Step 8: Description
// ---------------------------------------------------------------------------

export const propertyDescriptionSchema = z.object({
  description: PROPERTY_DESCRIPTION_SCHEMA,
});

// ---------------------------------------------------------------------------
// Full property publish schema — used at final publish validation
// ---------------------------------------------------------------------------

export const fullPropertyPublishSchema = z
  .object({
    title: PROPERTY_TITLE_SCHEMA,
    description: PROPERTY_DESCRIPTION_SCHEMA,
    propertyTypeId: z.string().uuid("Select a property type"),
    transactionType: TRANSACTION_TYPE_SCHEMA,
    price: PROPERTY_PRICE_SCHEMA,
    currency: z.enum(["NGN", "USD"]),
    priceFrequency: PRICE_FREQUENCY_SCHEMA.nullable(),
    bedrooms: z.number().int().min(0).max(50),
    bathrooms: z.number().int().min(0).max(50),
    toilets: z.number().int().min(0).max(50),
    yearBuilt: z
      .number()
      .int()
      .min(1800)
      .max(new Date().getFullYear() + 1)
      .optional(),
    parkingSpaces: z.number().int().min(0).max(1000).default(0),
    floors: z.number().int().min(0).max(200).optional(),
    furnishedStatus: z.enum([
      "furnished",
      "semi_furnished",
      "unfurnished",
      "not_applicable",
    ]),
    sizeValue: z.number().positive().max(1_000_000).optional(),
    sizeUnit: z.enum(["sqm", "sqft", "acre", "hectare", "plot"]).optional(),
    // Location
    country: z.string().min(2).max(60),
    state: z.string().min(2).max(60),
    city: z.string().min(2).max(60),
    area: z.string().max(120).optional().or(z.literal("")),
    landmark: z.string().max(200).optional().or(z.literal("")),
    addressLine: z.string().max(300).optional().or(z.literal("")),
    addressLga: z.string().max(60).optional().or(z.literal("")),
    privateLat: COORDINATE_LAT_SCHEMA.optional(),
    privateLng: COORDINATE_LNG_SCHEMA.optional(),
    // Amenities
    amenityIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .refine(
    (data) => {
      // Sale MUST have one_off; rent/shortlet MUST have a frequency.
      if (data.transactionType === "sale" && data.priceFrequency !== "one_off") {
        return false;
      }
      if (
        (data.transactionType === "rent" || data.transactionType === "shortlet") &&
        !data.priceFrequency
      ) {
        return false;
      }
      return true;
    },
    {
      message:
        "Sale listings must use total pricing; rent/short-let listings must specify a price frequency",
      path: ["priceFrequency"],
    },
  )
  .refine(
    (data) => {
      const hasLat = data.privateLat !== undefined && data.privateLat !== null;
      const hasLng = data.privateLng !== undefined && data.privateLng !== null;
      return hasLat === hasLng;
    },
    { message: "Latitude and longitude must both be set or both be empty" },
  );

export type FullPropertyPublishInput = z.infer<typeof fullPropertyPublishSchema>;

// ---------------------------------------------------------------------------
// Helper: which fields are required for the current transaction type?
// ---------------------------------------------------------------------------

export function getRequiredFieldsForTransaction(
  transactionType: "rent" | "sale" | "shortlet",
) {
  return {
    priceFrequency: transactionType !== "sale" ? true : false,
    priceFrequencyOptions:
      transactionType === "sale"
        ? (["one_off"] as const)
        : transactionType === "rent"
          ? (["per_month", "per_year"] as const)
          : (["per_night", "per_day", "per_week", "per_month"] as const),
  };
}

/**
 * Returns true if a property type should hide the furnished_status field.
 * Land types should not be furnished.
 */
export function shouldShowFurnishedStatus(category: string): boolean {
  return category !== "land";
}
