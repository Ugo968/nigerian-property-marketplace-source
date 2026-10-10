import { describe, it, expect } from "bun:test";
import {
  capabilitiesFor,
  canCreateListing,
  canApplyToProperty,
  canSaveSearch,
  canReceiveRealTimeAlerts,
  canUseAnalytics,
  canAccessFeaturedCredits,
  canUseBulkManagement,
  canHaveTeamMembers,
  FAIR_USE_CEILINGS,
} from "@/lib/capabilities";
import type { UserRole, SubscriptionTier } from "@/types";

describe("capability system", () => {
  const roles: UserRole[] = ["landlord", "agent", "company", "tenant"];
  const tiers: SubscriptionTier[] = ["free", "pro", "premium"];

  it("returns a Capabilities object for every (role, tier) pair", () => {
    for (const role of roles) {
      for (const tier of tiers) {
        const caps = capabilitiesFor(role, tier);
        expect(caps).toBeDefined();
        expect(typeof caps.maxListingsPerMonth).toBe("number");
      }
    }
  });

  it("throws for unknown (role, tier) combinations", () => {
    expect(() =>
      capabilitiesFor("invalid" as UserRole, "free"),
    ).toThrow();
  });

  describe("role-specific capabilities", () => {
    it("agents cannot create listings at any tier", () => {
      for (const tier of tiers) {
        expect(canCreateListing("agent", tier)).toBe(false);
      }
    });

    it("only agents can apply to properties", () => {
      expect(canApplyToProperty("agent", "free")).toBe(true);
      expect(canApplyToProperty("landlord", "free")).toBe(false);
      expect(canApplyToProperty("company", "free")).toBe(false);
    });

    it("agents free tier is limited to 10 applications/month", () => {
      expect(capabilitiesFor("agent", "free").maxApplicationsPerMonth).toBe(10);
    });

    it("agent premium is unlimited applications (fair-use ceiling)", () => {
      expect(capabilitiesFor("agent", "premium").maxApplicationsPerMonth).toBe(
        FAIR_USE_CEILINGS.maxApplicationsPerMonth,
      );
    });

    it("landlord free cannot have team members", () => {
      expect(canHaveTeamMembers("landlord", "free")).toBe(false);
      expect(canHaveTeamMembers("landlord", "premium")).toBe(false);
    });

    it("company team member counts match the spec (1 / 5 / unlimited)", () => {
      expect(capabilitiesFor("company", "free").maxTeamMembers).toBe(1);
      expect(capabilitiesFor("company", "pro").maxTeamMembers).toBe(5);
      expect(capabilitiesFor("company", "premium").maxTeamMembers).toBe(
        FAIR_USE_CEILINGS.maxTeamMembers,
      );
    });

    it("verification eligibility matches spec", () => {
      // Landlord Free: no verification
      expect(capabilitiesFor("landlord", "free").eligibleForBronze).toBe(false);
      expect(capabilitiesFor("landlord", "free").eligibleForBlue).toBe(false);
      // Landlord Pro: eligible (we interpret as Bronze-eligible)
      expect(capabilitiesFor("landlord", "pro").eligibleForBronze).toBe(true);
      expect(capabilitiesFor("landlord", "pro").eligibleForBlue).toBe(false);
      // Landlord Premium: eligible for both
      expect(capabilitiesFor("landlord", "premium").eligibleForBronze).toBe(
        true,
      );
      expect(capabilitiesFor("landlord", "premium").eligibleForBlue).toBe(true);

      // Agent: Free no badge, Pro Bronze, Premium Blue
      expect(capabilitiesFor("agent", "free").eligibleForBronze).toBe(false);
      expect(capabilitiesFor("agent", "pro").eligibleForBronze).toBe(true);
      expect(capabilitiesFor("agent", "pro").eligibleForBlue).toBe(false);
      expect(capabilitiesFor("agent", "premium").eligibleForBlue).toBe(true);

      // Company: Free can apply, Pro Bronze, Premium Blue
      expect(capabilitiesFor("company", "free").eligibleForBronze).toBe(false);
      expect(capabilitiesFor("company", "pro").eligibleForBronze).toBe(true);
      expect(capabilitiesFor("company", "premium").eligibleForBlue).toBe(true);
    });

    it("featured listing credits match spec", () => {
      expect(
        capabilitiesFor("landlord", "pro").featuredListingCreditsPerMonth,
      ).toBe(1);
      expect(
        capabilitiesFor("landlord", "premium").featuredListingCreditsPerMonth,
      ).toBe(3);
      expect(
        capabilitiesFor("company", "pro").featuredListingCreditsPerMonth,
      ).toBe(2);
      expect(
        capabilitiesFor("company", "premium").featuredListingCreditsPerMonth,
      ).toBe(5);
    });

    it("real-time alerts only on premium (or pro for agents)", () => {
      // Agent Pro has instant alerts
      expect(canReceiveRealTimeAlerts("agent", "pro")).toBe(true);
      // Agent Free has basic only
      expect(canReceiveRealTimeAlerts("agent", "free")).toBe(false);
      // Landlord Premium has priority alerts
      expect(canReceiveRealTimeAlerts("landlord", "premium")).toBe(true);
      // Landlord Free has basic only
      expect(canReceiveRealTimeAlerts("landlord", "free")).toBe(false);
    });

    it("bulk management only on premium tiers", () => {
      expect(canUseBulkManagement("landlord", "free")).toBe(false);
      expect(canUseBulkManagement("landlord", "pro")).toBe(false);
      expect(canUseBulkManagement("landlord", "premium")).toBe(true);
      expect(canUseBulkManagement("company", "pro")).toBe(true);
      expect(canUseBulkManagement("company", "premium")).toBe(true);
    });

    it("free tier never has analytics beyond basic", () => {
      for (const role of roles) {
        expect(canUseAnalytics(role, "free")).toBe(false);
      }
    });

    it("fair-use ceilings are sane upper bounds", () => {
      expect(FAIR_USE_CEILINGS.maxListingsPerMonth).toBeGreaterThan(50);
      expect(FAIR_USE_CEILINGS.maxSavedProperties).toBeGreaterThan(100);
      expect(FAIR_USE_CEILINGS.maxTeamMembers).toBeGreaterThanOrEqual(20);
    });
  });
});
