import { describe, it, expect } from "bun:test";
import {
  USER_ROLES,
  ROLE_LABELS,
  SUBSCRIPTION_TIERS,
  TIER_LABELS,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  VERIFICATION_STATES,
  VERIFICATION_STATE_LABELS,
  PRICE_FREQUENCIES,
  PRICE_FREQUENCY_LABELS,
  APPLICATION_STATUSES,
  APPLICATION_TRANSITIONS,
  DEAL_STAGES,
  DEAL_STAGE_LABELS,
  PAYMENT_TYPES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUSES,
  ADVERTISER_CATEGORIES,
  AD_PLACEMENTS,
  CAMPAIGN_STATUSES,
  MIN_ADVERTISING_SPEND_NAIRA,
  verificationBadgeToken,
  PUBLICLY_VISIBLE_BADGE_STATES,
} from "@/types";

describe("domain types are exhaustive and consistent", () => {
  it("USER_ROLES contains exactly the four marketplace roles", () => {
    expect(USER_ROLES).toEqual(["landlord", "agent", "company", "tenant"]);
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(
      ["agent", "company", "landlord", "tenant"],
    );
  });

  it("SUBSCRIPTION_TIERS are free → pro → premium", () => {
    expect(SUBSCRIPTION_TIERS).toEqual(["free", "pro", "premium"]);
    expect(Object.keys(TIER_LABELS).sort()).toEqual(
      ["free", "premium", "pro"],
    );
  });

  it("TRANSACTION_TYPES are rent / sale / shortlet", () => {
    expect(TRANSACTION_TYPES).toEqual(["rent", "sale", "shortlet"]);
    for (const t of TRANSACTION_TYPES) {
      expect(TRANSACTION_TYPE_LABELS[t]).toBeTruthy();
    }
  });

  it("PRICE_FREQUENCIES covers sale + rent + shortlet units", () => {
    expect(PRICE_FREQUENCIES).toContain("one_off");
    expect(PRICE_FREQUENCIES).toContain("per_year");
    expect(PRICE_FREQUENCIES).toContain("per_month");
    expect(PRICE_FREQUENCIES).toContain("per_week");
    expect(PRICE_FREQUENCIES).toContain("per_day");
    for (const f of PRICE_FREQUENCIES) {
      expect(PRICE_FREQUENCY_LABELS[f]).toBeDefined();
    }
  });

  it("VERIFICATION_STATES includes bronze + blue + the negative states", () => {
    expect(VERIFICATION_STATES).toContain("unverified");
    expect(VERIFICATION_STATES).toContain("pending");
    expect(VERIFICATION_STATES).toContain("bronze");
    expect(VERIFICATION_STATES).toContain("blue");
    expect(VERIFICATION_STATES).toContain("rejected");
    expect(VERIFICATION_STATES).toContain("suspended");
    expect(VERIFICATION_STATES).toContain("revoked");
    for (const s of VERIFICATION_STATES) {
      expect(VERIFICATION_STATE_LABELS[s]).toBeTruthy();
    }
  });

  it("only bronze + blue are publicly visible badge states", () => {
    expect(PUBLICLY_VISIBLE_BADGE_STATES).toEqual(["bronze", "blue"]);
  });

  it("verificationBadgeToken maps bronze → bronze and blue → blue, others → null", () => {
    expect(verificationBadgeToken("bronze")).toBe("bronze");
    expect(verificationBadgeToken("blue")).toBe("blue");
    expect(verificationBadgeToken("pending")).toBeNull();
    expect(verificationBadgeToken("unverified")).toBeNull();
    expect(verificationBadgeToken("rejected")).toBeNull();
  });

  it("APPLICATION_STATUSES cover the full state machine", () => {
    expect(APPLICATION_STATUSES).toEqual([
      "pending",
      "accepted",
      "declined",
      "withdrawn",
      "expired",
      "completed",
    ]);
  });

  it("application transitions respect the state machine", () => {
    // pending can move to accepted / declined / withdrawn / expired
    expect(APPLICATION_TRANSITIONS.pending).toContain("accepted");
    expect(APPLICATION_TRANSITIONS.pending).toContain("declined");
    // declined / withdrawn / expired / completed are terminal
    expect(APPLICATION_TRANSITIONS.declined).toEqual([]);
    expect(APPLICATION_TRANSITIONS.withdrawn).toEqual([]);
    expect(APPLICATION_TRANSITIONS.expired).toEqual([]);
    expect(APPLICATION_TRANSITIONS.completed).toEqual([]);
    // accepted can move to completed
    expect(APPLICATION_TRANSITIONS.accepted).toContain("completed");
  });

  it("DEAL_STAGES matches the V1 transaction workflow boundary", () => {
    expect(DEAL_STAGES[0]).toBe("inquiry");
    expect(DEAL_STAGES[DEAL_STAGES.length - 1]).toBe("transaction_completed");
    for (const s of DEAL_STAGES) {
      expect(DEAL_STAGE_LABELS[s]).toBeTruthy();
    }
  });

  it("PAYMENT_TYPES covers the monetisation surface", () => {
    expect(PAYMENT_TYPES).toContain("subscription");
    expect(PAYMENT_TYPES).toContain("featured_listing");
    expect(PAYMENT_TYPES).toContain("advertising");
  });

  it("PAYMENT_PROVIDERS exposes both supported providers", () => {
    expect(PAYMENT_PROVIDERS).toEqual(["paystack", "flutterwave"]);
  });

  it("PAYMENT_STATUSES covers the lifecycle including refunded", () => {
    expect(PAYMENT_STATUSES).toContain("pending");
    expect(PAYMENT_STATUSES).toContain("successful");
    expect(PAYMENT_STATUSES).toContain("failed");
    expect(PAYMENT_STATUSES).toContain("cancelled");
    expect(PAYMENT_STATUSES).toContain("refunded");
    expect(PAYMENT_STATUSES).toContain("expired");
  });

  it("ADVERTISER_CATEGORIES covers the spec list", () => {
    expect(ADVERTISER_CATEGORIES).toContain("carpenter");
    expect(ADVERTISER_CATEGORIES).toContain("plumber");
    expect(ADVERTISER_CATEGORIES).toContain("electrician");
    expect(ADVERTISER_CATEGORIES).toContain("architect");
    expect(ADVERTISER_CATEGORIES).toContain("interior_designer");
  });

  it("AD_PLACEMENTS covers the spec list", () => {
    expect(AD_PLACEMENTS).toContain("homepage");
    expect(AD_PLACEMENTS).toContain("banner");
    expect(AD_PLACEMENTS).toContain("sponsored_business_card");
  });

  it("CAMPAIGN_STATUSES is a sensible lifecycle", () => {
    expect(CAMPAIGN_STATUSES).toContain("draft");
    expect(CAMPAIGN_STATUSES).toContain("active");
    expect(CAMPAIGN_STATUSES).toContain("ended");
    expect(CAMPAIGN_STATUSES).toContain("rejected");
  });

  it("MIN_ADVERTISING_SPEND_NAIRA is exactly ₦5,000", () => {
    expect(MIN_ADVERTISING_SPEND_NAIRA).toBe(5000);
  });
});
