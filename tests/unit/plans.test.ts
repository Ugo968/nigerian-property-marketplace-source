import { describe, it, expect } from "bun:test";
import {
  PLANS,
  plansForRole,
  getPlan,
  getDefaultPlan,
  formatNaira,
  isVariablePricePlan,
} from "@/lib/subscriptions/plans";
import type { UserRole, SubscriptionTier } from "@/types";

describe("subscription plans", () => {
  const roles: UserRole[] = ["landlord", "agent", "company", "tenant"];
  const tiers: SubscriptionTier[] = ["free", "pro", "premium"];

  it("defines a plan for every (role, tier) combination (tenants have free + pro only)", () => {
    const expectedPlans: Array<[UserRole, SubscriptionTier]> = [
      ["landlord", "free"], ["landlord", "pro"], ["landlord", "premium"],
      ["agent", "free"], ["agent", "pro"], ["agent", "premium"],
      ["company", "free"], ["company", "pro"], ["company", "premium"],
      ["tenant", "free"], ["tenant", "pro"],
    ];
    for (const [role, tier] of expectedPlans) {
      const plan = getPlan(role, tier);
      expect(plan).toBeDefined();
      expect(plan.role).toBe(role);
      expect(plan.tier).toBe(tier);
    }
  });

  it("has the exact prices from the master specification", () => {
    // Landlord
    expect(PLANS["landlord-free"].priceNaira).toBe(0);
    expect(PLANS["landlord-pro"].priceNaira).toBe(3500);
    expect(PLANS["landlord-premium"].priceNaira).toBe(9500);

    // Agent
    expect(PLANS["agent-free"].priceNaira).toBe(0);
    expect(PLANS["agent-pro"].priceNaira).toBe(5000);
    expect(PLANS["agent-premium"].priceNaira).toBe(12000);

    // Company
    expect(PLANS["company-free"].priceNaira).toBe(0);
    expect(PLANS["company-pro"].priceNaira).toBe(20000);
    expect(PLANS["company-premium"].priceNaira).toBe(35000);

    // Tenant (spec Section 2)
    expect(PLANS["tenant-free"].priceNaira).toBe(0);
    expect(PLANS["tenant-pro"].priceNaira).toBe(1500);
  });

  it("marks Free as the default plan for every role", () => {
    for (const role of roles) {
      expect(getDefaultPlan(role).tier).toBe("free");
      expect(getDefaultPlan(role).isDefault).toBe(true);
    }
  });

  it("returns plans for a role in tier order (free → pro → premium for non-tenant; free → pro for tenant)", () => {
    // Non-tenant roles have 3 tiers.
    for (const role of ["landlord", "agent", "company"] as UserRole[]) {
      const plans = plansForRole(role);
      expect(plans.map((p) => p.tier)).toEqual(["free", "pro", "premium"]);
    }
    // Tenant only has free + pro (no premium tier).
    const tenantPlans = plansForRole("tenant");
    expect(tenantPlans.map((p) => p.tier)).toEqual(["free", "pro"]);
  });

  it("formats Naira amounts with the currency prefix", () => {
    expect(formatNaira(0)).toMatch(/0/);
    expect(formatNaira(3500)).toMatch(/3,500/);
    // The "+" suffix is only for variable-price plans.
    expect(formatNaira(35000, true)).toContain("+");
  });

  it("only Company Premium is variable price", () => {
    expect(isVariablePricePlan("company", "premium")).toBe(true);
    expect(isVariablePricePlan("company", "pro")).toBe(false);
    expect(isVariablePricePlan("landlord", "premium")).toBe(false);
    expect(isVariablePricePlan("agent", "premium")).toBe(false);
  });

  it("every plan has a non-empty tagline and at least one highlight", () => {
    for (const role of roles) {
      const plans = plansForRole(role);
      for (const plan of plans) {
        expect(plan.tagline.length).toBeGreaterThan(0);
        expect(plan.highlights.length).toBeGreaterThan(0);
      }
    }
  });

  it("every plan except tenant-free is sellable (tenant-free is the trial — not purchasable)", () => {
    for (const role of roles) {
      const plans = plansForRole(role);
      for (const plan of plans) {
        if (plan.role === "tenant" && plan.tier === "free") {
          // The tenant free trial is NOT sellable — it starts automatically.
          expect(plan.sellable).toBe(false);
        } else {
          expect(plan.sellable).toBe(true);
        }
      }
    }
  });
});
