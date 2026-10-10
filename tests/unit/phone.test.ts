import { describe, it, expect } from "bun:test";
import {
  normalizeNigerianPhone,
  isValidNigerianPhone,
  formatNigerianPhone,
} from "@/lib/utils/phone";

describe("Nigerian phone normalisation", () => {
  describe("normalises valid inputs to +2348XXXXXXXXX", () => {
    const cases: Array<[string, string]> = [
      // Local with leading 0, with spaces
      ["0803 123 4567", "+2348031234567"],
      // Local with leading 0, no spaces
      ["08031234567", "+2348031234567"],
      // International with +
      ["+234 803 123 4567", "+2348031234567"],
      // International without +
      ["2348031234567", "+2348031234567"],
      // 10-digit (no leading 0)
      ["8031234567", "+2348031234567"],
      // MTN (0803, 0806, 0810, 0813, 0814, 0816, 0901, 0903, 0906, 0703, 0706)
      ["08061234567", "+2348061234567"],
      ["08131234567", "+2348131234567"],
      ["09011234567", "+2349011234567"],
      ["07031234567", "+2347031234567"],
      // With dashes
      ["0803-123-4567", "+2348031234567"],
      // With parentheses
      ["(0803) 123 4567", "+2348031234567"],
      // 9Mobile (0809, 0817, 0818, 0908, 0909)
      ["08091234567", "+2348091234567"],
      ["09091234567", "+2349091234567"],
      // Glo (0805, 0807, 0811, 0815, 0705, 0905)
      ["08051234567", "+2348051234567"],
      ["07051234567", "+2347051234567"],
    ];

    for (const [input, expected] of cases) {
      it(`"${input}" → ${expected}`, () => {
        expect(normalizeNigerianPhone(input)).toBe(expected);
      });
    }
  });

  describe("rejects invalid inputs", () => {
    const invalid: string[] = [
      "",
      "   ",
      "abc",
      "12345",
      "0803 123 456", // too few digits
      "0803 123 45678", // too many digits
      "+1 555 123 4567", // US number
      "07001234567", // 0700 is not a valid prefix
      "06001234567", // 0600 is not a valid prefix
      "+234 800 123 4567", // 0800 is not a valid prefix
    ];

    for (const input of invalid) {
      it(`rejects "${input}"`, () => {
        expect(normalizeNigerianPhone(input)).toBeNull();
        expect(isValidNigerianPhone(input)).toBe(false);
      });
    }
  });

  describe("isValidNigerianPhone", () => {
    it("returns true for valid numbers", () => {
      expect(isValidNigerianPhone("0803 123 4567")).toBe(true);
      expect(isValidNigerianPhone("+234 803 123 4567")).toBe(true);
    });

    it("returns false for invalid numbers", () => {
      expect(isValidNigerianPhone("garbage")).toBe(false);
      expect(isValidNigerianPhone("")).toBe(false);
    });
  });

  describe("formatNigerianPhone", () => {
    it("pretty-prints valid numbers as '+234 XXX XXX XXXX'", () => {
      expect(formatNigerianPhone("08031234567")).toBe("+234 803 123 4567");
      expect(formatNigerianPhone("+2348031234567")).toBe("+234 803 123 4567");
    });

    it("passes through invalid inputs unchanged", () => {
      expect(formatNigerianPhone("garbage")).toBe("garbage");
    });
  });
});
