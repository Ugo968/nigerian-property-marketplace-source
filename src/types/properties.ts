/**
 * Property transaction-type definitions.
 *
 * The marketplace supports rent, sale, and short-let from launch.
 * Transaction type drives which price-frequency values are valid.
 */

export const TRANSACTION_TYPES = ["rent", "sale", "shortlet"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  rent: "For Rent",
  sale: "For Sale",
  shortlet: "Short-let",
};

/**
 * Price frequency — the unit of time a price represents.
 * Valid combinations are enforced by validation rules in lib/validation/properties.ts.
 */
export const PRICE_FREQUENCIES = [
  "one_off", // For sales
  "per_day", // For short-let
  "per_week", // For short-let
  "per_month", // For rent / short-let
  "per_year", // For rent (Nigeria common — annual rent)
  "per_night", // For short-let (nightly pricing)
] as const;
export type PriceFrequency = (typeof PRICE_FREQUENCIES)[number];

export const PRICE_FREQUENCY_LABELS: Record<PriceFrequency, string> = {
  one_off: "Total",
  per_day: "/ day",
  per_week: "/ week",
  per_month: "/ month",
  per_year: "/ year",
  per_night: "/ night",
};

/**
 * Listing lifecycle. Tracks a property from draft to published to closed.
 */
export const LISTING_STATUSES = [
  "draft",
  "pending_review",
  "active",
  "paused",
  "withdrawn",
  "expired",
  "taken_down",
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/**
 * Property type master list. Extensible — additional types can be added
 * to the database without code changes. These are the seeded defaults.
 */
export const PROPERTY_TYPES = [
  "apartment",
  "house",
  "duplex",
  "terrace",
  "bungalow",
  "land",
  "plot",
  "commercial_building",
  "office",
  "shop",
  "warehouse",
  "industrial",
  "event_space",
  "hotel",
  "student_accommodation",
  "estate",
  "mixed_use",
  "other",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment: "Apartment",
  house: "House",
  duplex: "Duplex",
  terrace: "Terrace",
  bungalow: "Bungalow",
  land: "Land",
  plot: "Plot",
  commercial_building: "Commercial Building",
  office: "Office Space",
  shop: "Shop",
  warehouse: "Warehouse",
  industrial: "Industrial Property",
  event_space: "Event Space",
  hotel: "Hotel",
  student_accommodation: "Student Accommodation",
  estate: "Estate",
  mixed_use: "Mixed-Use",
  other: "Other",
};

/**
 * Master list of seedable amenities. The amenities table is extensible
 * at runtime — admins can add new amenities without code changes.
 */
export const AMENITIES_SEED = [
  "parking",
  "security",
  "generator",
  "swimming_pool",
  "garden",
  "water_supply",
  "electricity",
  "air_conditioning",
  "fitted_kitchen",
  "pop_ceiling",
  "cctv",
  "estate_security",
  "elevator",
  "internet",
  "borehole",
  "solar_power",
  "inverter",
  "boys_quarter",
  "furnished",
  "serviced",
] as const;
export type SeedAmenity = (typeof AMENITIES_SEED)[number];
