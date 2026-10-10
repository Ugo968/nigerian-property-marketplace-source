import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { capabilitiesFor } from "@/lib/capabilities";
import { PLANS, plansForRole, getPlan, getDefaultPlan, formatNaira, isVariablePricePlan } from "@/lib/subscriptions/plans";

/**
 * Subscription & entitlement tests.
 *
 * Per spec Sections 2, 5, 7, 9, 10, 11, 12, 13, 22, 28, 30, 39:
 *   * Correct plans + prices for every role/tier
 *   * Free is first-class (every user has effective Free)
 *   * Role-plan compatibility enforced
 *   * One active plan per user (RLS on subscription_tier)
 *   * Verification NOT auto-granted on upgrade
 *   * Users cannot assign themselves Premium (RLS blocks)
 *   * Graceful downgrade (no content deletion)
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");

function allMigrationsContent(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Plan configuration (spec Sections 2, 4, 5)
// ---------------------------------------------------------------------------

describe("plan configuration — correct prices for every role/tier", () => {
  it("landlord Free: ₦0", () => {
    expect(PLANS["landlord-free"].priceNaira).toBe(0);
  });
  it("landlord Pro: ₦3,500", () => {
    expect(PLANS["landlord-pro"].priceNaira).toBe(3500);
  });
  it("landlord Premium: ₦9,500", () => {
    expect(PLANS["landlord-premium"].priceNaira).toBe(9500);
  });

  it("agent Free: ₦0", () => {
    expect(PLANS["agent-free"].priceNaira).toBe(0);
  });
  it("agent Pro: ₦5,000", () => {
    expect(PLANS["agent-pro"].priceNaira).toBe(5000);
  });
  it("agent Premium: ₦12,000", () => {
    expect(PLANS["agent-premium"].priceNaira).toBe(12000);
  });

  it("company Free: ₦0", () => {
    expect(PLANS["company-free"].priceNaira).toBe(0);
  });
  it("company Pro: ₦20,000", () => {
    expect(PLANS["company-pro"].priceNaira).toBe(20000);
  });
  it("company Premium: ₦35,000 (base, variable)", () => {
    expect(PLANS["company-premium"].priceNaira).toBe(35000);
    expect(isVariablePricePlan("company", "premium")).toBe(true);
  });
});

describe("plan configuration — Free is first-class (spec Section 12)", () => {
  it("every role has a Free plan marked as default", () => {
    for (const role of ["landlord", "agent", "company"] as const) {
      const plan = getPlan(role, "free");
      expect(plan.isDefault).toBe(true);
      expect(plan.priceNaira).toBe(0);
    }
  });
});

describe("plan configuration — role-plan compatibility (spec Section 11)", () => {
  it("plansForRole returns exactly 3 plans in free→pro→premium order", () => {
    for (const role of ["landlord", "agent", "company"] as const) {
      const plans = plansForRole(role);
      expect(plans.length).toBe(3);
      expect(plans[0].tier).toBe("free");
      expect(plans[1].tier).toBe("pro");
      expect(plans[2].tier).toBe("premium");
      // All plans must match the role
      for (const plan of plans) {
        expect(plan.role).toBe(role);
      }
    }
  });
});

describe("plan configuration — variable price (spec Section 4, Company Premium)", () => {
  it("only company-premium is variable price", () => {
    expect(isVariablePricePlan("company", "premium")).toBe(true);
    expect(isVariablePricePlan("company", "pro")).toBe(false);
    expect(isVariablePricePlan("landlord", "premium")).toBe(false);
    expect(isVariablePricePlan("agent", "premium")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Capabilities per plan (spec Section 6, 16-20)
// ---------------------------------------------------------------------------

describe("capabilities — landlord plans (spec Section 2)", () => {
  it("Free: 5 photos, 0 videos, no search boost, no social handles", () => {
    const caps = capabilitiesFor("landlord", "free");
    expect(caps.maxPhotosPerListing).toBe(5);
    expect(caps.maxVideosPerListing).toBe(0);
    expect(caps.searchRankingBoost).toBe(false);
    expect(caps.canShowSocialMediaHandles).toBe(false);
    expect(caps.eligibleForBronze).toBe(false);
    expect(caps.eligibleForBlue).toBe(false);
  });

  it("Pro: 25 photos, 2 videos, search boost, no social handles", () => {
    const caps = capabilitiesFor("landlord", "pro");
    expect(caps.maxPhotosPerListing).toBe(25);
    expect(caps.maxVideosPerListing).toBe(2);
    expect(caps.searchRankingBoost).toBe(true);
    expect(caps.canShowSocialMediaHandles).toBe(false); // Premium-only
    expect(caps.eligibleForBronze).toBe(true);
    expect(caps.eligibleForBlue).toBe(false);
    expect(caps.featuredListingCreditsPerMonth).toBe(1);
  });

  it("Premium: unlimited photos, videos, social handles, Blue eligible", () => {
    const caps = capabilitiesFor("landlord", "premium");
    expect(caps.maxPhotosPerListing).toBeGreaterThan(50); // fair-use
    expect(caps.maxVideosPerListing).toBeGreaterThan(5); // fair-use
    expect(caps.canShowSocialMediaHandles).toBe(true);
    expect(caps.eligibleForBlue).toBe(true);
    expect(caps.featuredListingCreditsPerMonth).toBe(3);
  });
});

describe("capabilities — agent plans (spec Section 3)", () => {
  it("Free: 10 applications, 10 conversations, 10 saved, 3 searches", () => {
    const caps = capabilitiesFor("agent", "free");
    expect(caps.maxApplicationsPerMonth).toBe(10);
    expect(caps.maxNewConversationsPerMonth).toBe(10);
    expect(caps.maxSavedProperties).toBe(10);
    expect(caps.maxSavedSearches).toBe(3);
    expect(caps.eligibleForBronze).toBe(false);
  });

  it("Pro: 25 applications, 25 conversations, 25 saved, 15 searches, Bronze eligible", () => {
    const caps = capabilitiesFor("agent", "pro");
    expect(caps.maxApplicationsPerMonth).toBe(25);
    expect(caps.maxNewConversationsPerMonth).toBe(25);
    expect(caps.maxSavedProperties).toBe(25);
    expect(caps.maxSavedSearches).toBe(15);
    expect(caps.eligibleForBronze).toBe(true);
    expect(caps.eligibleForBlue).toBe(false);
  });

  it("Premium: unlimited everything, Blue eligible, social handles", () => {
    const caps = capabilitiesFor("agent", "premium");
    expect(caps.maxApplicationsPerMonth).toBeGreaterThan(100);
    expect(caps.maxNewConversationsPerMonth).toBeGreaterThan(100);
    expect(caps.maxSavedProperties).toBeGreaterThan(100);
    expect(caps.maxSavedSearches).toBeGreaterThan(50);
    expect(caps.eligibleForBlue).toBe(true);
    expect(caps.canShowSocialMediaHandles).toBe(true);
  });
});

describe("capabilities — company plans (spec Section 4)", () => {
  it("Free: 10 listings, 3 photos, 0 videos, 1 team, 15 conversations", () => {
    const caps = capabilitiesFor("company", "free");
    expect(caps.maxListingsPerMonth).toBe(10);
    expect(caps.maxPhotosPerListing).toBe(3);
    expect(caps.maxVideosPerListing).toBe(0);
    expect(caps.maxTeamMembers).toBe(1);
    expect(caps.maxNewConversationsPerMonth).toBe(15);
  });

  it("Pro: 20 listings, 5 photos, 2 videos, 5 team, 25 conversations, Bronze", () => {
    const caps = capabilitiesFor("company", "pro");
    expect(caps.maxListingsPerMonth).toBe(20);
    expect(caps.maxPhotosPerListing).toBe(5);
    expect(caps.maxVideosPerListing).toBe(2);
    expect(caps.maxTeamMembers).toBe(5);
    expect(caps.maxNewConversationsPerMonth).toBe(25);
    expect(caps.eligibleForBronze).toBe(true);
    expect(caps.featuredListingCreditsPerMonth).toBe(2);
  });

  it("Premium: unlimited listings/photos/videos, unlimited team, Blue, social", () => {
    const caps = capabilitiesFor("company", "premium");
    expect(caps.maxListingsPerMonth).toBeGreaterThan(100);
    expect(caps.maxPhotosPerListing).toBeGreaterThan(50);
    expect(caps.maxTeamMembers).toBeGreaterThan(20);
    expect(caps.eligibleForBlue).toBe(true);
    expect(caps.canShowSocialMediaHandles).toBe(true);
    expect(caps.featuredListingCreditsPerMonth).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Verification separation (spec Section 22)
// ---------------------------------------------------------------------------

describe("verification ≠ subscription (spec Section 22)", () => {
  it("upgrade grants eligibility, NOT verification state", () => {
    // The capability system has `eligibleForBronze` / `eligibleForBlue`
    // — these are ELIGIBILITY flags, not auto-grant flags.
    // The verification_state on profiles is controlled by the
    // verification system (P5), not the subscription system.
    const caps = capabilitiesFor("agent", "pro");
    expect(caps.eligibleForBronze).toBe(true);
    // There is NO field like `verificationState` or `verificationStatus`
    // in the Capabilities interface — verification is separate.
    expect("verificationState" in caps).toBe(false);
    expect("verificationStatus" in caps).toBe(false);
  });

  it("changePlanAction does NOT touch verification_state", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/subscriptions/actions.ts"),
      "utf8",
    );
    // The action updates subscription_tier, NOT verification_state
    expect(source).toMatch(/subscription_tier/);
    expect(source).not.toMatch(/verification_state\s*=/);
  });
});

// ---------------------------------------------------------------------------
// RLS + security (spec Sections 10, 30, 32)
// ---------------------------------------------------------------------------

describe("subscription RLS + security (spec Sections 10, 30, 32)", () => {
  const content = allMigrationsContent();

  it("profiles.subscription_tier is immutable from client (RLS UPDATE policy)", () => {
    expect(content).toMatch(
      /subscription_tier\s*=\s*\(\s*select\s+subscription_tier\s+from\s+public\.profiles/i,
    );
  });

  it("subscription_plans publicly readable", () => {
    expect(content).toMatch(/Subscription\s+plans\s+are\s+publicly\s+readable/i);
  });

  it("user_subscriptions: users read own only (no INSERT/UPDATE/DELETE for users)", () => {
    const subsSection = content.match(
      /Users\s+can\s+read\s+their\s+own\s+subscriptions[\s\S]*?(?=\n--\s*---)/i,
    );
    expect(subsSection).toBeDefined();
    // Should NOT have INSERT/UPDATE/DELETE policies for authenticated
    const sectionText = subsSection?.[0] ?? "";
    expect(sectionText).not.toMatch(/for\s+insert/i);
    expect(sectionText).not.toMatch(/for\s+update/i);
    expect(sectionText).not.toMatch(/for\s+delete/i);
  });

  it("changePlanAction uses service-role client (not client-accessible)", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/subscriptions/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/createAdminClient\(\)/);
    // Should NOT use the browser client for privileged operations
    expect(source).not.toMatch(/createBrowserClient/);
  });

  it("changePlanAction derives identity from server session", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/subscriptions/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/getCurrentUser\(\)/);
    expect(source).toMatch(/getCurrentProfile\(\)/);
    // Should NOT accept a client-supplied userId
    expect(source).not.toMatch(/userId.*input/i);
  });

  it("cancelPlanAction uses service-role client", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/subscriptions/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/cancelPlanAction/);
    expect(source).toMatch(/createAdminClient\(\)/);
  });
});

// ---------------------------------------------------------------------------
// Graceful downgrade (spec Section 28)
// ---------------------------------------------------------------------------

describe("graceful downgrade (spec Section 28)", () => {
  it("cancelPlanAction does NOT delete user content", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/subscriptions/actions.ts"),
      "utf8",
    );
    // The action should NOT delete properties, saved items, conversations, etc.
    expect(source).not.toMatch(/\.delete\(\).*properties/i);
    expect(source).not.toMatch(/\.delete\(\).*saved_properties/i);
    expect(source).not.toMatch(/\.delete\(\).*conversations/i);
    expect(source).not.toMatch(/\.delete\(\).*saved_searches/i);
    // It should mention "graceful" or "preserve" or "not delete"
    expect(source).toMatch(/graceful|preserve|do NOT delete/i);
  });
});

// ---------------------------------------------------------------------------
// Audit events (spec Section 31)
// ---------------------------------------------------------------------------

describe("subscription audit events (spec Section 31)", () => {
  it("changePlanAction writes audit logs for upgrade/downgrade", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/subscriptions/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/subscription\.upgraded/);
    expect(source).toMatch(/subscription\.downgraded/);
    expect(source).toMatch(/audit_logs/);
  });

  it("cancelPlanAction writes audit log", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/subscriptions/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/subscription\.cancelled/);
  });

  it("audit logs do NOT contain payment secrets", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/subscriptions/actions.ts"),
      "utf8",
    );
    // Metadata should be tier/role info, NOT payment keys/secrets
    expect(source).not.toMatch(/secret_key|secretKey|api_key|apiKey/i);
  });
});

// ---------------------------------------------------------------------------
// Seed data (spec Section 41)
// ---------------------------------------------------------------------------

describe("subscription seed data (spec Section 41)", () => {
  it("all 9 plans are seeded", () => {
    const seedContent = fs.readFileSync(
      path.join(process.cwd(), "supabase/seed/003_subscription_plans.sql"),
      "utf8",
    );
    for (const role of ["landlord", "agent", "company"]) {
      for (const tier of ["free", "pro", "premium"]) {
        expect(seedContent).toContain(`'${role}', '${tier}'`);
      }
    }
  });

  it("seed prices match the spec exactly", () => {
    const seedContent = fs.readFileSync(
      path.join(process.cwd(), "supabase/seed/003_subscription_plans.sql"),
      "utf8",
    );
    // Landlord
    expect(seedContent).toContain("'landlord', 'free',    0");
    expect(seedContent).toContain("'landlord', 'pro',     3500");
    expect(seedContent).toContain("'landlord', 'premium', 9500");
    // Agent
    expect(seedContent).toContain("'agent', 'free',    0");
    expect(seedContent).toContain("'agent', 'pro',     5000");
    expect(seedContent).toContain("'agent', 'premium', 12000");
    // Company
    expect(seedContent).toContain("'company', 'free',    0");
    expect(seedContent).toContain("'company', 'pro',     20000");
    expect(seedContent).toContain("'company', 'premium', 35000");
  });

  it("company premium is marked as variable price in seed", () => {
    const seedContent = fs.readFileSync(
      path.join(process.cwd(), "supabase/seed/003_subscription_plans.sql"),
      "utf8",
    );
    expect(seedContent).toMatch(/'company',\s*'premium',\s*35000,\s*true/i);
  });

  it("seed does NOT create fake paid subscriptions", () => {
    // The seed file should only create plan records, NOT user_subscriptions
    // with status='active' for paid plans
    const seedContent = fs.readFileSync(
      path.join(process.cwd(), "supabase/seed/003_subscription_plans.sql"),
      "utf8",
    );
    expect(seedContent).not.toMatch(/insert\s+into\s+public\.user_subscriptions/i);
  });
});

// ---------------------------------------------------------------------------
// Entitlement resolver (spec Sections 6, 15, 29)
// ---------------------------------------------------------------------------

describe("entitlement resolver (spec Sections 6, 15, 29)", () => {
  it("getEffectivePlan exists and uses getCurrentProfile", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/subscriptions/entitlements.ts"),
      "utf8",
    );
    expect(source).toMatch(/export\s+async\s+function\s+getEffectivePlan/);
    expect(source).toMatch(/getCurrentProfile\(\)/);
  });

  it("getEntitlements returns capabilities from capability system", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/subscriptions/entitlements.ts"),
      "utf8",
    );
    expect(source).toMatch(/export\s+async\s+function\s+getEntitlements/);
    expect(source).toMatch(/capabilitiesFor\(/);
  });

  it("getUsage calculates from real server-side data (not client counters)", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/subscriptions/entitlements.ts"),
      "utf8",
    );
    expect(source).toMatch(/export\s+async\s+function\s+getUsage/);
    expect(source).toMatch(/createServerClient/);
    expect(source).toMatch(/count.*exact.*head.*true/i);
  });

  it("canConsume checks usage server-side", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/subscriptions/entitlements.ts"),
      "utf8",
    );
    expect(source).toMatch(/export\s+async\s+function\s+canConsume/);
    expect(source).toMatch(/getUsage\(\)/);
    expect(source).toMatch(/allowed/);
  });

  it("hasCapability checks via getEntitlements", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/subscriptions/entitlements.ts"),
      "utf8",
    );
    expect(source).toMatch(/export\s+async\s+function\s+hasCapability/);
    expect(source).toMatch(/getEntitlements\(\)/);
  });
});

// ---------------------------------------------------------------------------
// No payment processing (spec Section 43)
// ---------------------------------------------------------------------------

describe("no payment processing yet (spec Section 43)", () => {
  it("changePlanAction does NOT call Paystack or Flutterwave APIs", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/subscriptions/actions.ts"),
      "utf8",
    );
    // Should NOT import or call the payment provider adapters
    expect(source).not.toMatch(/import.*paystack/i);
    expect(source).not.toMatch(/import.*flutterwave/i);
    expect(source).not.toMatch(/PaystackAdapter|FlutterwaveAdapter/);
    expect(source).not.toMatch(/getPaymentProvider/);
    expect(source).not.toMatch(/\.initiate\(/);
    expect(source).not.toMatch(/\.verify\(/);
  });

  it("actions note that payment wiring comes in Prompt 13", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/subscriptions/actions.ts"),
      "utf8",
    );
    // Should have a comment noting payment is deferred
    expect(source).toMatch(/Prompt 13|P13|payment.*later|no.*payment.*yet/i);
  });
});
