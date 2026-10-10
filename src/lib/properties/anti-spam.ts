/**
 * Anti-spam / quality checks for property titles + descriptions.
 *
 * Per spec Section 8 + 39:
 *   * Titles should be descriptive, readable, not spam
 *   * No "CHEAPEST!!! BEST!!! MUST SEE!!! CALL NOW!!! $$$"
 *   * No excessive repeated punctuation
 *   * No suspicious contact-info spam patterns
 *   * No impossible prices (validation lives in the schema)
 *   * No excessive identical listings (DB check at publish time)
 *
 * These checks are deterministic — no AI moderation. They produce a
 * `title_quality` field stored on the property for admin moderation
 * queue filtering.
 */

export type TitleQuality =
  | "clean"
  | "suspicious_caps"
  | "excessive_punctuation"
  | "spam_pattern"
  | "too_short"
  | "too_long";

export interface QualityCheckResult {
  quality: TitleQuality;
  reasons: string[];
}

// Common spam patterns (case-insensitive). Matches if any of these
// appear in the title.
const SPAM_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\b(chapest|cheapest|best price|best deal|urgently|urgent sale|must sell|quick sale)\b/i,
    reason: "Contains urgency / hard-sell language",
  },
  {
    pattern: /\b(call now|call me|whatsapp me|dm me|inbox me|contact me directly)\b/i,
    reason: "Contains direct-contact solicitation",
  },
  {
    pattern: /\$\$\$|\b\$\d/i,
    reason: "Contains dollar-sign symbols",
  },
  {
    pattern: /\b(crypto|bitcoin|btc|usdt|investment opportunity|double your money)\b/i,
    reason: "Contains investment / crypto language",
  },
  {
    pattern: /\b(free|giveaway|bonus|promo|discount)\b/i,
    reason: "Contains giveaway / promo language",
  },
  {
    pattern: /(.)\1{4,}/, // 5+ of the same character in a row (e.g. "!!!!!")
    reason: "Contains excessive repeated characters",
  },
];

// Suspicious URL pattern in description
const URL_PATTERN = /https?:\/\/\S+/i;

/**
 * Check a title for spam / quality issues.
 */
export function checkTitleQuality(title: string): QualityCheckResult {
  const reasons: string[] = [];

  if (title.trim().length < 10) {
    return {
      quality: "too_short",
      reasons: ["Title is too short (must be at least 10 characters)"],
    };
  }

  if (title.length > 200) {
    return {
      quality: "too_long",
      reasons: ["Title is too long (max 200 characters)"],
    };
  }

  // Excessive caps: more than 50% of alphabetic chars are uppercase
  // AND the title has more than 10 alphabetic chars
  const alpha = title.replace(/[^a-zA-Z]/g, "");
  if (alpha.length > 10) {
    const upperCount = alpha.replace(/[^A-Z]/g, "").length;
    if (upperCount / alpha.length > 0.5) {
      reasons.push("Excessive use of uppercase letters");
    }
  }

  // Excessive punctuation: more than 5 punctuation marks in a row
  if (/[!?.,;:]{5,}/.test(title)) {
    reasons.push("Excessive repeated punctuation (5+ marks in a row)");
  }

  // Spam pattern check
  for (const { pattern, reason } of SPAM_PATTERNS) {
    if (pattern.test(title)) {
      reasons.push(reason);
    }
  }

  if (reasons.length === 0) {
    return { quality: "clean", reasons: [] };
  }

  // Determine the most severe quality issue
  if (reasons.some((r) => r.includes("urgency") || r.includes("crypto") || r.includes("investment") || r.includes("giveaway") || r.includes("contact solicitation") || r.includes("dollar-sign"))) {
    return { quality: "spam_pattern", reasons };
  }
  if (reasons.some((r) => r.includes("punctuation"))) {
    return { quality: "excessive_punctuation", reasons };
  }
  if (reasons.some((r) => r.includes("uppercase"))) {
    return { quality: "suspicious_caps", reasons };
  }
  return { quality: "spam_pattern", reasons };
}

/**
 * Sanitise a description — strip URLs if suspicious, escape HTML.
 *
 * Per spec Section 9: do not trust HTML submitted by clients. We treat
 * the description as plain text (no markdown / HTML rendering) — the
 * frontend renders it as `<p>` with line breaks.
 */
export function sanitizeDescription(description: string): string {
  // Replace `&` FIRST (before angle brackets), otherwise the `&` in
  // `&lt;` would be re-escaped into `&amp;lt;`.
  const escaped = description
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // Strip script-related patterns even though we escaped
  const noScripts = escaped.replace(/script:/gi, "");

  return noScripts.trim();
}

/**
 * Returns true if the description contains a URL (suspicious for spam).
 * The URL itself is not stripped — just flagged for moderation review.
 */
export function descriptionContainsUrl(description: string): boolean {
  return URL_PATTERN.test(description);
}
