/**
 * Server-side file validation.
 *
 * Per spec Section 13:
 *   * Check allowed MIME types
 *   * Check file size
 *   * Check file extension
 *   * Do NOT trust client-provided MIME type alone
 *   * Prevent obvious dangerous file uploads
 *   * Do not allow executable files as verification documents
 *
 * MIME sniffing: we read the first few bytes of the file and compare
 * against known magic-byte signatures. If the client says image/jpeg
 * but the bytes are actually application/zip, we reject.
 */

import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  ALLOWED_DOCUMENT_EXTENSIONS,
  FORBIDDEN_EXTENSIONS,
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_AVATAR_SIZE_BYTES,
  ALLOWED_AVATAR_MIME_TYPES,
  ALLOWED_AVATAR_EXTENSIONS,
} from "@/lib/verification/constants";
import { logger } from "@/lib/logging";

export interface FileValidationResult {
  ok: boolean;
  error?: string;
  /** The MIME type detected from magic bytes (more reliable than client-reported). */
  detectedMimeType?: string;
}

// ---------------------------------------------------------------------------
// Magic-byte signatures — first N bytes of common file formats
// ---------------------------------------------------------------------------

interface MagicSignature {
  type: string;
  /** Byte offsets + values to match. Each entry: [offset, bytes]. */
  matches: Array<{ offset: number; bytes: number[] }>;
}

const SIGNATURES: MagicSignature[] = [
  // JPEG: starts with FF D8 FF
  {
    type: "image/jpeg",
    matches: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  {
    type: "image/png",
    matches: [
      { offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    ],
  },
  // WebP: "RIFF"...."WEBP"
  {
    type: "image/webp",
    matches: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP
    ],
  },
  // PDF: %PDF
  {
    type: "application/pdf",
    matches: [
      { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
    ],
  },
];

/**
 * Detect MIME type from the first bytes of a file. Returns null if no
 * known signature matches.
 */
export function sniffMimeType(firstBytes: Uint8Array): string | null {
  for (const sig of SIGNATURES) {
    const allMatch = sig.matches.every(({ offset, bytes }) => {
      if (offset + bytes.length > firstBytes.length) return false;
      for (let i = 0; i < bytes.length; i++) {
        if (firstBytes[offset + i] !== bytes[i]) return false;
      }
      return true;
    });
    if (allMatch) return sig.type;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Extension parsing
// ---------------------------------------------------------------------------

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot < 0 || lastDot === filename.length - 1) return "";
  return filename.slice(lastDot + 1).toLowerCase();
}

// ---------------------------------------------------------------------------
// Validation entry points
// ---------------------------------------------------------------------------

export interface ValidateFileInput {
  fileName: string;
  /** Client-reported MIME type (NOT trusted alone). */
  clientMimeType: string;
  /** File size in bytes. */
  size: number;
  /** First 16 bytes of the file (for magic-byte sniffing). */
  firstBytes: Uint8Array;
  /** Validation context: "document" or "avatar". */
  context: "document" | "avatar";
}

export function validateFile(input: ValidateFileInput): FileValidationResult {
  const { fileName, clientMimeType, size, firstBytes, context } = input;

  // 1. Size check
  const maxSize = context === "avatar"
    ? MAX_AVATAR_SIZE_BYTES
    : MAX_DOCUMENT_SIZE_BYTES;
  if (size > maxSize) {
    const maxMB = Math.floor(maxSize / (1024 * 1024));
    return {
      ok: false,
      error: `File is too large. Maximum size is ${maxMB} MB.`,
    };
  }

  if (size === 0) {
    return { ok: false, error: "File is empty." };
  }

  // 2. Extension check
  const ext = getFileExtension(fileName);
  if (!ext) {
    return { ok: false, error: "File must have an extension." };
  }

  // Forbidden extensions (executables, archives, scripts)
  if (FORBIDDEN_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: `Files with extension ".${ext}" are not allowed.`,
    };
  }

  // Allowed extensions for context
  const allowedExt =
    context === "avatar"
      ? ALLOWED_AVATAR_EXTENSIONS
      : ALLOWED_DOCUMENT_EXTENSIONS;
  if (!allowedExt.has(ext)) {
    return {
      ok: false,
      error: `File type ".${ext}" is not supported. Allowed: ${[...allowedExt].map((e) => `.${e}`).join(", ")}.`,
    };
  }

  // 3. MIME sniff — most reliable check
  const detected = sniffMimeType(firstBytes);
  if (!detected) {
    return {
      ok: false,
      error: "Could not verify file type. The file may be corrupted or in an unsupported format.",
    };
  }

  // 4. Cross-check sniffed type against allowed types for context
  const allowedMime =
    context === "avatar"
      ? ALLOWED_AVATAR_MIME_TYPES
      : ALLOWED_DOCUMENT_MIME_TYPES;
  if (!allowedMime.has(detected)) {
    return {
      ok: false,
      error: `Detected file type ${detected} is not supported.`,
      detectedMimeType: detected,
    };
  }

  // 5. Client-reported MIME should match detected. If they disagree,
  //    trust the sniffed type — but log the mismatch for review.
  if (clientMimeType && clientMimeType !== detected) {
    // Don't reject — the sniffed type is what we use. But this is a
    // suspicious signal worth logging.
    logger.warn("file-validation: MIME mismatch", {
      clientMimeType,
      detectedMimeType: detected,
      fileName,
    });
  }

  return { ok: true, detectedMimeType: detected };
}
