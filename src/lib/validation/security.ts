/**
 * Security validation schemas — Zod schemas for user-controlled input.
 *
 * Centralised so the same schema is used on client forms (instant
 * feedback) + server actions (authoritative check). Server-side
 * `parse()` is the source of truth — client-side validation is for
 * UX only.
 *
 * Schemas in this file cover the inputs that are NOT validated by
 * the existing per-domain validation modules. Each schema enforces:
 *   - Type validation
 *   - Length limits
 *   - Numeric ranges
 *   - Enum validation
 *   - Required fields
 *   - Safe URL validation (via safeRelativeRedirect / safeUrl)
 *   - Reasonable text sizes
 */

import { z } from "zod";
import { safeUrl, isSafeRelativePath } from "@/lib/security/safe-url";

// ---------------------------------------------------------------------------
// Common primitives
// ---------------------------------------------------------------------------

/** Free-form text — strips HTML by virtue of length limit + downstream HTML escape. */
export const SAFE_TEXT_SCHEMA = (max: number) =>
  z.string().trim().min(1).max(max);

/** Safe URL — must be http(s) and not internal (when ssrfMode). */
export const SAFE_URL_SCHEMA = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => safeUrl(v, { rejectInternal: true }) !== null, {
    message: "URL must be http(s) and not point to an internal host.",
  })
  .optional();

/** Safe relative path — for CTAs / deep links / notification hrefs. */
export const SAFE_RELATIVE_PATH_SCHEMA = z
  .string()
  .trim()
  .max(512)
  .refine((v) => isSafeRelativePath(v), {
    message: "Must be a relative path on our origin.",
  })
  .optional();

/** Positive integer minor-units (kobo). */
export const POSITIVE_AMOUNT_MINOR_SCHEMA = z
  .number()
  .int("Amount must be a whole number")
  .min(1, "Amount must be greater than zero")
  .max(10_000_000_00, "Amount is too large"); // ₦10,000,000

/** Non-negative integer minor-units (allows 0). */
export const NON_NEGATIVE_AMOUNT_MINOR_SCHEMA = z
  .number()
  .int()
  .min(0)
  .max(10_000_000_00);

/** Currency — V1 supports NGN only for property transactions, USD reserved for future. */
export const CURRENCY_SCHEMA = z.enum(["NGN", "USD"]);

/** Price frequency — matches properties table CHECK constraint. */
export const PRICE_FREQUENCY_SCHEMA = z.enum([
  "one_off",
  "per_day",
  "per_week",
  "per_month",
  "per_year",
]);

/** Reason text — for moderation / cancellation / decline actions. */
export const REASON_SCHEMA = (minLen: number, maxLen = 500) =>
  z.string().trim().min(minLen, `Reason must be at least ${minLen} characters.`).max(maxLen);

/** Cancellation reason — required (spec Section 37). */
export const CANCELLATION_REASON_SCHEMA = REASON_SCHEMA(5);

/** Coordinates — Nigeria is roughly 4°N-14°N, 3°E-15°E. We allow a
 *  wider envelope to avoid rejecting legitimate edge cases but still
 *  block obviously-wrong values like (90, 180) or (-1, -1).
 */
export const LATITUDE_SCHEMA = z
  .number()
  .min(-90, "Latitude must be between -90 and 90")
  .max(90, "Latitude must be between -90 and 90");
export const LONGITUDE_SCHEMA = z
  .number()
  .min(-180, "Longitude must be between -180 and 180")
  .max(180, "Longitude must be between -180 and 180");

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

export const PROPERTY_TITLE_SCHEMA = z
  .string()
  .trim()
  .min(10, "Title must be at least 10 characters")
  .max(120, "Title must be at most 120 characters")
  .refine((v) => !/<script|javascript:/i.test(v), {
    message: "Title cannot contain HTML scripts",
  });

export const PROPERTY_DESCRIPTION_SCHEMA = z
  .string()
  .trim()
  .max(5000, "Description must be at most 5000 characters")
  .optional();

export const PROPERTY_PRICE_SCHEMA = z
  .number()
  .int()
  .min(0, "Price must be non-negative")
  .max(10_000_000_000_00, "Price is too large"); // ₦100,000,000,000

export const BEDROOMS_SCHEMA = z.number().int().min(0).max(50);
export const BATHROOMS_SCHEMA = z.number().int().min(0).max(50);

// ---------------------------------------------------------------------------
// Application / Messaging
// ---------------------------------------------------------------------------

export const APPLICATION_MESSAGE_SCHEMA = z
  .string()
  .trim()
  .min(10, "Application message must be at least 10 characters")
  .max(2000, "Application message must be at most 2000 characters");

export const COMMISSION_PCT_SCHEMA = z
  .number()
  .min(0, "Commission percentage must be non-negative")
  .max(100, "Commission percentage must be at most 100");

export const MESSAGE_BODY_SCHEMA = z
  .string()
  .trim()
  .min(1, "Message cannot be empty")
  .max(5000, "Message must be at most 5000 characters");

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export const REVIEW_RATING_SCHEMA = z
  .number()
  .int("Rating must be a whole number")
  .min(1, "Rating must be at least 1 star")
  .max(5, "Rating must be at most 5 stars");

export const REVIEW_BODY_SCHEMA = z
  .string()
  .trim()
  .min(10, "Review must be at least 10 characters")
  .max(5000, "Review must be at most 5000 characters");

export const REVIEW_TITLE_SCHEMA = z
  .string()
  .trim()
  .max(200, "Title must be at most 200 characters")
  .optional();

// ---------------------------------------------------------------------------
// Transaction workflow
// ---------------------------------------------------------------------------

export const OFFER_AMOUNT_SCHEMA = POSITIVE_AMOUNT_MINOR_SCHEMA;
export const OFFER_VALIDITY_HOURS_SCHEMA = z
  .number()
  .int()
  .min(1, "Validity must be at least 1 hour")
  .max(720, "Validity must be at most 720 hours (30 days)");

export const INSPECTION_NOTES_SCHEMA = z.string().trim().max(2000).optional();

// ---------------------------------------------------------------------------
// Advertising
// ---------------------------------------------------------------------------

export const CAMPAIGN_BUDGET_NAIRA_SCHEMA = z
  .number()
  .int()
  .min(5000, "Minimum campaign budget is ₦5,000")
  .max(10_000_000_00, "Budget is too large");

export const CREATIVE_HEADLINE_SCHEMA = z
  .string()
  .trim()
  .min(3)
  .max(120, "Headline must be at most 120 characters")
  .refine((v) => !/<script|javascript:/i.test(v), "Headline cannot contain scripts");

export const CREATIVE_BODY_TEXT_SCHEMA = z
  .string()
  .trim()
  .max(500, "Body text must be at most 500 characters")
  .optional();

export const CREATIVE_TARGET_URL_SCHEMA = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => safeUrl(v, { rejectInternal: true, ssrfMode: false }) !== null, {
    message: "Target URL must be http(s) and not point to an internal host.",
  });

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const BIO_SCHEMA = z.string().trim().max(2000).optional();
export const AGENCY_NAME_SCHEMA = z.string().trim().min(2).max(120);
export const COMPANY_NAME_SCHEMA = z.string().trim().min(2).max(120);
export const CAC_REG_NUMBER_SCHEMA = z
  .string()
  .trim()
  .max(30)
  .optional();

// ---------------------------------------------------------------------------
// Social handles (extended validation — the basic SOCIAL_HANDLES_SCHEMA
// lives in auth.ts; this one adds trim + max-length per-handle).
// Named differently to avoid the barrel re-export collision.
// ---------------------------------------------------------------------------

export const SOCIAL_HANDLES_EXTENDED_SCHEMA = z
  .record(z.string(), z.string().trim().max(120))
  .optional();

// ---------------------------------------------------------------------------
// Notification metadata — never trust client-supplied secrets.
// ---------------------------------------------------------------------------

export const NOTIFICATION_METADATA_SCHEMA = z
  .record(z.string(), z.unknown())
  .optional();
