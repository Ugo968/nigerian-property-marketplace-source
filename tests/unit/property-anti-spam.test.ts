import { describe, it, expect } from "bun:test";
import {
  checkTitleQuality,
  sanitizeDescription,
  descriptionContainsUrl,
} from "@/lib/properties/anti-spam";

describe("checkTitleQuality", () => {
  it("accepts a clean, descriptive title", () => {
    const result = checkTitleQuality("4-Bedroom Detached Duplex with BQ in Gwarinpa");
    expect(result.quality).toBe("clean");
    expect(result.reasons.length).toBe(0);
  });

  it("rejects titles shorter than 10 characters", () => {
    const result = checkTitleQuality("short");
    expect(result.quality).toBe("too_short");
  });

  it("rejects titles longer than 200 characters", () => {
    const result = checkTitleQuality("x".repeat(201));
    expect(result.quality).toBe("too_long");
  });

  it("flags titles with excessive uppercase (>50% of letters)", () => {
    const result = checkTitleQuality("THIS IS ALL CAPS TITLE FOR LAGOS DUPLEX");
    expect(result.quality).not.toBe("clean");
    expect(result.reasons.some((r) => r.includes("uppercase"))).toBe(true);
  });

  it("does not flag mixed-case titles", () => {
    const result = checkTitleQuality("Beautiful 4-bedroom house in Lekki Phase 1");
    expect(result.quality).toBe("clean");
  });

  it("flags excessive punctuation (5+ marks in a row)", () => {
    const result = checkTitleQuality("Great property in Lekki available now!!!!!");
    expect(result.quality).not.toBe("clean");
    expect(result.reasons.some((r) => r.includes("punctuation"))).toBe(true);
  });

  it("flags 'CHEAPEST!!!' style spam", () => {
    const result = checkTitleQuality("CHEAPEST apartment in Lagos — call now!!!");
    expect(result.quality).not.toBe("clean");
    // Should have multiple spam reasons
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("flags dollar-sign symbols", () => {
    const result = checkTitleQuality("Luxury apartment $$$ in Lekki Phase 1");
    expect(result.quality).toBe("spam_pattern");
  });

  it("flags 'investment opportunity' / 'crypto'", () => {
    const result = checkTitleQuality("Great investment opportunity — bitcoin accepted");
    expect(result.quality).toBe("spam_pattern");
  });

  it("flags 'call now' / 'whatsapp me' direct-contact language", () => {
    const result = checkTitleQuality("Beautiful house in Lekki, call now for viewings");
    expect(result.quality).toBe("spam_pattern");
  });

  it("flags 'free' / 'giveaway' / 'discount' hard-sell language", () => {
    const result = checkTitleQuality("Free giveaway on this Lekki apartment");
    expect(result.quality).toBe("spam_pattern");
  });

  it("flags 5+ repeated characters in a row", () => {
    const result = checkTitleQuality("Amazingggggg apartment in Lekki Phase 1");
    expect(result.quality).not.toBe("clean");
  });
});

describe("sanitizeDescription", () => {
  it("escapes angle brackets", () => {
    const result = sanitizeDescription("<script>alert(1)</script>");
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("escapes ampersands", () => {
    const result = sanitizeDescription("Tom & Jerry");
    expect(result).toBe("Tom &amp; Jerry");
  });

  it("escapes quotes", () => {
    const result = sanitizeDescription('She said "hello"');
    expect(result).toContain("&quot;");
  });

  it("strips 'script:' protocol patterns", () => {
    const result = sanitizeDescription("Click here: script:alert(1)");
    expect(result).not.toMatch(/script:/i);
  });

  it("trims leading/trailing whitespace", () => {
    const result = sanitizeDescription("  hello world  ");
    expect(result).toBe("hello world");
  });
});

describe("descriptionContainsUrl", () => {
  it("detects http URLs", () => {
    expect(descriptionContainsUrl("Visit http://example.com")).toBe(true);
  });

  it("detects https URLs", () => {
    expect(descriptionContainsUrl("Visit https://example.com")).toBe(true);
  });

  it("returns false for plain text without URLs", () => {
    expect(descriptionContainsUrl("This is a beautiful property in Lekki.")).toBe(false);
  });

  it("returns false for 'example.com' without protocol", () => {
    // The regex requires http:// or https://
    expect(descriptionContainsUrl("Visit example.com")).toBe(false);
  });
});
