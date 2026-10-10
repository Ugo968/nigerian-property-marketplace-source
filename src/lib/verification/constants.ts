/**
 * Verification constants — allowed MIME types, file size limits,
 * document categories, and tier names. Centralised so the rules
 * are auditable in one place.
 *
 * Per spec Sections 11, 12, 13:
 *   * Documents live in Supabase Storage (private bucket
 *     `verification-documents`); the DB stores metadata only.
 *   * Server-side validation enforces MIME + size + extension.
 *   * Client-provided MIME is NEVER trusted alone.
 *   * Executable files are forbidden.
 */

import type { UserRole, VerificationTier } from "@/types";

// ---------------------------------------------------------------------------
// Document MIME types
// ---------------------------------------------------------------------------

/** Allowed MIME types for verification documents. */
export const ALLOWED_DOCUMENT_MIME_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/** Allowed file extensions (case-insensitive). Used as a second check
    alongside MIME sniffing — both must pass. */
export const ALLOWED_DOCUMENT_EXTENSIONS = new Set<string>([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "pdf",
]);

/** Forbidden extensions — explicit blocklist of dangerous file types. */
export const FORBIDDEN_EXTENSIONS = new Set<string>([
  "exe",
  "bat",
  "cmd",
  "sh",
  "bin",
  "msi",
  "dmg",
  "app",
  "deb",
  "rpm",
  "apk",
  "jar",
  "js",
  "ts",
  "html",
  "svg", // SVG can carry JavaScript; forbid in verification docs
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
]);

// ---------------------------------------------------------------------------
// File size limits
// ---------------------------------------------------------------------------

/** Maximum size per verification document: 10 MB. */
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum number of documents per verification application. */
export const MAX_DOCUMENTS_PER_APPLICATION = 10;

/** Maximum size per profile photo / company logo: 5 MB. */
export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

/** Allowed MIME types for profile photos / logos. */
export const ALLOWED_AVATAR_MIME_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** Allowed extensions for profile photos / logos. */
export const ALLOWED_AVATAR_EXTENSIONS = new Set<string>([
  "jpg",
  "jpeg",
  "png",
  "webp",
]);

// ---------------------------------------------------------------------------
// Document categories
// ---------------------------------------------------------------------------

export const DOCUMENT_TYPES = [
  "government_id",
  "utility_bill",
  "proof_of_address",
  "cac_certificate",
  "business_license",
  "professional_certification",
  "agent_license",
  "office_lease",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  government_id: "Government-issued ID",
  utility_bill: "Utility bill (proof of address)",
  proof_of_address: "Proof of address",
  cac_certificate: "CAC registration certificate",
  business_license: "Business license",
  professional_certification: "Professional certification",
  agent_license: "Real-estate agent license",
  office_lease: "Office lease / proof of office",
  other: "Other supporting document",
};

// ---------------------------------------------------------------------------
// Bucket names — single source of truth
// ---------------------------------------------------------------------------

export const STORAGE_BUCKETS = {
  avatars: "avatars",
  propertyMedia: "property-media",
  verificationDocuments: "verification-documents",
  advertisingCreatives: "advertising-creatives",
  messageAttachments: "message-attachments",
  reportEvidence: "report-evidence",
} as const;

// ---------------------------------------------------------------------------
// Verification application expiry
// ---------------------------------------------------------------------------

/** How long a verification application stays in 'submitted' before
    auto-expiring if not reviewed. 30 days. */
export const APPLICATION_EXPIRY_DAYS = 30;

// ---------------------------------------------------------------------------
// Tier labels
// ---------------------------------------------------------------------------

export const TIER_LABELS: Record<VerificationTier, string> = {
  bronze: "Bronze Verified",
  blue: "Blue Verified",
};

export const TIER_DESCRIPTIONS: Record<VerificationTier, string> = {
  bronze:
    "Basic professional / account verification. Confirms the user has provided identity information and required documentation.",
  blue: "Higher-level professional / business verification. For agents, this includes professional information and additional documentation. For companies, this requires CAC registration and business verification.",
};
