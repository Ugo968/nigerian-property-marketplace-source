import { z } from "zod";
import { USER_ROLES } from "@/types";
import { normalizeNigerianPhone } from "@/lib/utils/phone";

/**
 * Zod validation schemas.
 *
 * Validation lives in one place so the same schema can be used on:
 *   - Client forms (instant feedback)
 *   - Server actions / route handlers (authoritative)
 *
 * Client-side validation is for UX only — NEVER trust it for security.
 * Server-side `parse()` is the source of truth.
 */

export const EMAIL_SCHEMA = z
  .string()
  .min(1, "Email is required")
  .email("Enter a valid email address")
  .max(254, "Email is too long");

export const PASSWORD_SCHEMA = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[A-Z]/, "Include at least one uppercase letter")
  .regex(/[a-z]/, "Include at least one lowercase letter")
  .regex(/[0-9]/, "Include at least one number");

/**
 * Phone schema. Accepts local + international Nigerian forms; the
 * server normalises to E.164 form before storing.
 */
export const PHONE_SCHEMA = z
  .string()
  .min(1, "Phone number is required")
  .refine((value) => normalizeNigerianPhone(value) !== null, {
    message: "Enter a valid Nigerian phone number (e.g. 0803 123 4567)",
  });

export const FULL_NAME_SCHEMA = z
  .string()
  .min(2, "Name is too short")
  .max(80, "Name is too long");

export const OPTIONAL_URL_SCHEMA = z
  .string()
  .url("Enter a valid URL")
  .max(2048, "URL is too long")
  .optional()
  .or(z.literal(""));

export const SOCIAL_HANDLES_SCHEMA = z
  .record(z.string(), z.string().max(120, "Handle too long"))
  .optional()
  .default({});

/**
 * Signup schema. Includes password confirmation + safety-warning
 * acknowledgement per spec Section 3.
 */
export const signupSchema = z
  .object({
    fullName: FULL_NAME_SCHEMA,
    email: EMAIL_SCHEMA,
    phone: PHONE_SCHEMA,
    password: PASSWORD_SCHEMA,
    confirmPassword: z.string().min(1, "Confirm your password"),
    role: z.enum(USER_ROLES, {
      message: "Choose Landlord, Agent, or Company",
    }),
    acceptSafetyWarning: z.literal(true, {
      message: "You must acknowledge the safety warning to continue",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignupInput = z.infer<typeof signupSchema>;

/**
 * Login schema.
 */
export const loginSchema = z.object({
  email: EMAIL_SCHEMA,
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Password reset request schema.
 */
export const passwordResetRequestSchema = z.object({
  email: EMAIL_SCHEMA,
});

export type PasswordResetRequestInput = z.infer<
  typeof passwordResetRequestSchema
>;

/**
 * New password (after clicking the reset email link).
 */
export const passwordResetSchema = z
  .object({
    password: PASSWORD_SCHEMA,
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

// ---------------------------------------------------------------------------
// ONBOARDING SCHEMAS — one per role, matching the role-specific DB tables.
// Each schema is the COMPLETE onboarding submission (all steps combined).
// Multi-step UI forms can validate each step against a subset; the full
// schema is used on the final submit.
// ---------------------------------------------------------------------------

export const landlordOnboardingSchema = z.object({
  // Step 1: profile basics
  avatarUrl: z.string().optional().or(z.literal("")),
  bio: z.string().max(500, "Bio is too long").optional().or(z.literal("")),
  preferredLocation: z
    .string()
    .min(2, "Location is required")
    .max(120, "Location is too long"),
  preferredContactMethod: z
    .enum(["phone", "email", "whatsapp"])
    .optional()
    .or(z.literal("")),
  preferredContactValue: z
    .string()
    .max(120, "Contact value too long")
    .optional()
    .or(z.literal("")),
  ownershipSummary: z
    .string()
    .max(500, "Summary too long")
    .optional()
    .or(z.literal("")),
});
export type LandlordOnboardingInput = z.infer<typeof landlordOnboardingSchema>;

export const agentOnboardingSchema = z.object({
  // Step 1: profile basics
  avatarUrl: z.string().optional().or(z.literal("")),
  bio: z
    .string()
    .min(10, "Tell potential clients a bit about yourself (min 10 chars)")
    .max(500, "Bio is too long"),
  professionalName: z
    .string()
    .min(2, "Professional name is required")
    .max(80, "Professional name too long"),
  // Step 2: professional info
  yearsOfExperience: z
    .number()
    .int("Years must be a whole number")
    .min(0, "Years cannot be negative")
    .max(80, "Years seems too high"),
  areasServed: z
    .array(z.string().min(2, "Each area should be at least 2 characters"))
    .min(1, "Add at least one area you serve")
    .max(20, "Too many areas"),
  agencyName: z.string().max(120).optional().or(z.literal("")),
  licenseNumber: z.string().max(80).optional().or(z.literal("")),
  licenseIssuingBody: z.string().max(120).optional().or(z.literal("")),
  // Step 3: online presence
  portfolioUrl: OPTIONAL_URL_SCHEMA,
  socialHandles: SOCIAL_HANDLES_SCHEMA,
});
export type AgentOnboardingInput = z.infer<typeof agentOnboardingSchema>;

export const companyOnboardingSchema = z.object({
  // Step 1: company basics
  companyName: z
    .string()
    .min(2, "Company name is required")
    .max(120, "Company name too long"),
  companyLogoUrl: z.string().optional().or(z.literal("")),
  companyDescription: z
    .string()
    .min(20, "Tell clients about your company (min 20 chars)")
    .max(2000, "Description too long"),
  // Step 2: office location + contact
  officeAddress: z
    .string()
    .min(2, "Office address is required")
    .max(200, "Address too long"),
  officeState: z
    .string()
    .min(2, "State is required")
    .max(60, "State too long"),
  officeLga: z.string().max(60).optional().or(z.literal("")),
  contactPhone: PHONE_SCHEMA,
  contactEmail: EMAIL_SCHEMA,
  website: OPTIONAL_URL_SCHEMA,
  // Step 3: business info
  cacRegistered: z.boolean(),
  cacRegistrationNumber: z.string().max(40).optional().or(z.literal("")),
  socialHandles: SOCIAL_HANDLES_SCHEMA,
});
export type CompanyOnboardingInput = z.infer<typeof companyOnboardingSchema>;
