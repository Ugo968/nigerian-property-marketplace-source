/**
 * Nigerian phone number normalisation.
 *
 * Accepts:
 *   * 0803 123 4567     (local, with leading 0)
 *   * 08031234567       (local, no spaces)
 *   * +234 803 123 4567 (international, with +234)
 *   * 2348031234567     (international, no +)
 *
 * Returns the canonical E.164-ish form `+2348031234567` (13 chars total).
 * Returns null if the input cannot be parsed as a Nigerian mobile number.
 *
 * The platform doesn't pretend a phone is "verified" merely because the
 * user entered it — phone OTP verification is a separate, later step
 * (P1 follow-up once SMS provider credentials are configured).
 */

const NIGERIAN_MOBILE_PREFIXES = new Set([
  "701", "702", "703", "704", "705", "706", "707", "708", "709",
  "801", "802", "803", "804", "805", "806", "807", "808", "809",
  "810", "811", "812", "813", "814", "815", "816", "817", "818", "819",
  "901", "902", "903", "904", "905", "906", "907", "908", "909",
]);

/**
 * Strip whitespace, dashes, parentheses from a phone string.
 */
function stripPhone(input: string): string {
  return input.replace(/[\s\-()]/g, "");
}

/**
 * Normalise a Nigerian phone number to `+2348031234567` form.
 * Returns null if the number is not a valid Nigerian mobile number.
 */
export function normalizeNigerianPhone(input: string): string | null {
  if (!input) return null;
  const stripped = stripPhone(input);
  if (!stripped) return null;

  // Strip optional leading +
  let digits = stripped;
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  }

  // Normalise to 11-digit local form (08031234567) first
  let local: string;
  if (digits.startsWith("234")) {
    // 2348031234567 → 08031234567
    local = "0" + digits.slice(3);
  } else if (digits.startsWith("0")) {
    // 08031234567 → 08031234567
    local = digits;
  } else if (digits.length === 10) {
    // 8031234567 → 08031234567 (no leading 0)
    local = "0" + digits;
  } else {
    return null;
  }

  if (local.length !== 11) return null;

  // Validate prefix (e.g. 0803, 0810, 0701, 0901)
  const prefix = local.slice(1, 4); // e.g. "803"
  if (!NIGERIAN_MOBILE_PREFIXES.has(prefix)) return null;

  // Convert to +2348031234567 form
  return "+234" + local.slice(1);
}

/**
 * Returns true if the input is a valid Nigerian mobile number.
 */
export function isValidNigerianPhone(input: string): boolean {
  return normalizeNigerianPhone(input) !== null;
}

/**
 * Pretty-print a Nigerian number for UI display.
 * "+2348031234567" → "+234 803 123 4567"
 */
export function formatNigerianPhone(input: string): string {
  const normalised = normalizeNigerianPhone(input);
  if (!normalised) return input; // pass through if invalid
  // normalised = "+2348031234567"
  const cc = normalised.slice(0, 4); // +234
  const rest = normalised.slice(4); // 8031234567
  return `${cc} ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
}
