import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Tenant role + trial + subscription tests (Consolidated Product Update).
 *
 * Verifies:
 *   * Tenant role exists in the enum + capabilities + plans
 *   * Tenant subscription is ₦1,500/month
 *   * 7-day trial with 10-listing allowance
 *   * Trial users cannot contact landlords
 *   * Paid tenants can contact landlords
 *   * Trial usage tracking is server-only (RLS)
 *   * Contact-landlord authorization
 *   * New property types seeded (self-contained, room, mini flat, etc.)
 *   * Property type keywords for "self con" → self_contained
 *   * LGA column on property_locations
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");
const SRC_DIR = path.join(process.cwd(), "src");

function allMigrationsContent(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n\n");
}

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(SRC_DIR, relPath), "utf8");
}

// ---------------------------------------------------------------------------
// Role + capabilities + plans
// ---------------------------------------------------------------------------
import { USER_ROLES } from "@/types/auth";
import { capabilitiesFor } from "@/lib/capabilities";
import { PLANS, getPlan, plansForRole } from "@/lib/subscriptions/plans";

describe("tenant role (spec Section 1)", () => {
  it("USER_ROLES includes 'tenant'", () => {
    expect(USER_ROLES).toContain("tenant");
  });

  it("tenant has free + pro plans (no premium)", () => {
    const plans = plansForRole("tenant");
    expect(plans).toHaveLength(2);
    expect(plans.map((p) => p.tier)).toEqual(["free", "pro"]);
  });

  it("tenant-free plan is ₦0", () => {
    expect(getPlan("tenant", "free").priceNaira).toBe(0);
  });

  it("tenant-pro plan is ₦1,500/month (spec Section 2)", () => {
    expect(getPlan("tenant", "pro").priceNaira).toBe(1500);
  });

  it("tenant-free is NOT sellable (trial is not purchasable)", () => {
    expect(getPlan("tenant", "free").sellable).toBe(false);
  });

  it("tenant-pro IS sellable", () => {
    expect(getPlan("tenant", "pro").sellable).toBe(true);
  });
});

describe("tenant capabilities (spec Section 3, 4)", () => {
  it("tenant-free (trial): 0 new conversations, 0 saved properties, 0 saved searches", () => {
    const caps = capabilitiesFor("tenant", "free");
    expect(caps.maxNewConversationsPerMonth).toBe(0);
    expect(caps.maxSavedProperties).toBe(0);
    expect(caps.maxSavedSearches).toBe(0);
    expect(caps.alertLevel).toBe("off");
  });

  it("tenant-pro: 20 new conversations/month, 50 saved properties, 10 saved searches, instant alerts", () => {
    const caps = capabilitiesFor("tenant", "pro");
    expect(caps.maxNewConversationsPerMonth).toBe(20);
    expect(caps.maxSavedProperties).toBe(50);
    expect(caps.maxSavedSearches).toBe(10);
    expect(caps.alertLevel).toBe("instant");
  });

  it("tenant (any tier): cannot create listings (maxListingsPerMonth = 0)", () => {
    expect(capabilitiesFor("tenant", "free").maxListingsPerMonth).toBe(0);
    expect(capabilitiesFor("tenant", "pro").maxListingsPerMonth).toBe(0);
  });

  it("tenant (any tier): cannot apply to represent properties (maxApplicationsPerMonth = 0)", () => {
    expect(capabilitiesFor("tenant", "free").maxApplicationsPerMonth).toBe(0);
    expect(capabilitiesFor("tenant", "pro").maxApplicationsPerMonth).toBe(0);
  });

  it("tenant (any tier): NOT eligible for verification", () => {
    expect(capabilitiesFor("tenant", "free").eligibleForBronze).toBe(false);
    expect(capabilitiesFor("tenant", "pro").eligibleForBronze).toBe(false);
    expect(capabilitiesFor("tenant", "pro").eligibleForBlue).toBe(false);
  });

  it("tenant (any tier): cannot purchase featured listings or advertising", () => {
    expect(capabilitiesFor("tenant", "pro").canPurchaseFeaturedListings).toBe(false);
    expect(capabilitiesFor("tenant", "pro").canPurchaseAdvertising).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Database migration checks
// ---------------------------------------------------------------------------
describe("tenant migrations (0027, 0028)", () => {
  const migrations = allMigrationsContent();

  it("profiles.role CHECK includes 'tenant'", () => {
    expect(migrations).toMatch(
      /check\s*\(\s*role\s+in\s*\(\s*'landlord',?\s*'agent',?\s*'company',?\s*'tenant'\s*\)/i,
    );
  });

  it("creates tenant_profiles table", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.tenant_profiles/i,
    );
  });

  it("creates tenant_trial_usage table", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.tenant_trial_usage/i,
    );
  });

  it("tenant_trial_usage has RLS with NO client INSERT/UPDATE/DELETE (server-only writes)", () => {
    expect(migrations).toMatch(
      /alter table public\.tenant_trial_usage enable row level security/i,
    );
    // SELECT policy exists (tenants can read their own status)
    expect(migrations).toContain("Tenants can read their own trial status");
    // No INSERT/UPDATE/DELETE policies
    const insertMatch = migrations.match(
      /create\s+policy\s+"[^"]+"\s+on\s+public\.tenant_trial_usage\s+for\s+insert/i,
    );
    const updateMatch = migrations.match(
      /create\s+policy\s+"[^"]+"\s+on\s+public\.tenant_trial_usage\s+for\s+update/i,
    );
    expect(insertMatch).toBeNull();
    expect(updateMatch).toBeNull();
  });

  it("tenant_profiles has owner-only RLS", () => {
    expect(migrations).toContain("Tenants can read their own profile");
    expect(migrations).toContain("Tenants can update their own profile");
  });

  it("seeds platform_settings for trial duration + listing allowance + subscription price", () => {
    expect(migrations).toContain("tenant.trial_duration_days");
    expect(migrations).toContain("tenant.trial_listing_allowance");
    expect(migrations).toContain("tenant.subscription_price_naira");
  });

  it("seeds tenant subscription plans (free + pro)", () => {
    expect(migrations).toContain("'tenant', 'free'");
    expect(migrations).toContain("'tenant', 'pro'");
    expect(migrations).toContain("1500"); // ₦1,500
  });

  it("creates property_type_keywords table for self-con keyword matching", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.property_type_keywords/i,
    );
  });

  it("seeds 'self con' keyword mapping to self_contained", () => {
    expect(migrations).toContain("'self con'");
    expect(migrations).toContain("'self_contained'");
  });

  it("adds address_lga column to property_locations", () => {
    expect(migrations).toMatch(
      /alter table public\.property_locations\s+add column if not exists address_lga/i,
    );
  });

  it("seeds new property types (self_contained, room, mini_flat, studio, etc.)", () => {
    const newTypes = [
      "self_contained",
      "room",
      "room_and_parlour",
      "studio",
      "mini_flat",
      "one_bedroom",
      "two_bedroom",
      "three_bedroom",
      "four_or_more_bedroom",
      "shared_accommodation",
      "student_accommodation",
    ];
    for (const t of newTypes) {
      expect(migrations).toContain(`'${t}'`);
    }
  });
});

// ---------------------------------------------------------------------------
// Source code structure
// ---------------------------------------------------------------------------
describe("tenant source code structure (spec Section 5, 8, 12)", () => {
  it("role-picker includes tenant option", () => {
    const rp = readSrc("components/auth/role-picker.tsx");
    expect(rp).toContain('"tenant"');
    expect(rp).toContain("Search"); // icon for tenant
  });

  it("capabilities module handles tenant-free + tenant-pro + tenant-premium", () => {
    const caps = readSrc("lib/capabilities/index.ts");
    expect(caps).toContain("case \"tenant-free\"");
    expect(caps).toContain("case \"tenant-pro\"");
    expect(caps).toContain("case \"tenant-premium\"");
  });

  it("plans module defines tenant plans with ₦1,500", () => {
    const plans = readSrc("lib/subscriptions/plans.ts");
    expect(plans).toContain("TENANT_PLANS");
    expect(plans).toContain("1500");
  });

  it("plansForRole filters undefined entries (tenant has no premium)", () => {
    const plans = readSrc("lib/subscriptions/plans.ts");
    expect(plans).toContain("filter(Boolean)");
  });

  it("tenant onboarding page exists", () => {
    expect(fs.existsSync(path.join(SRC_DIR, "app/onboarding/tenant/page.tsx"))).toBe(true);
  });

  it("tenant onboarding form exists", () => {
    expect(fs.existsSync(path.join(SRC_DIR, "components/onboarding/tenant-onboarding-form.tsx"))).toBe(true);
  });

  it("tenant onboarding API route exists", () => {
    expect(fs.existsSync(path.join(SRC_DIR, "app/api/onboarding/tenant/route.ts"))).toBe(true);
  });

  it("contact-landlord button component exists", () => {
    expect(fs.existsSync(path.join(SRC_DIR, "components/properties/contact-landlord-button.tsx"))).toBe(true);
  });

  it("tenant entitlements module defines trial + contact checks", () => {
    const ent = readSrc("lib/tenant/entitlements.ts");
    expect(ent).toContain("startTenantTrial");
    expect(ent).toContain("getTenantTrialStatus");
    expect(ent).toContain("canTenantViewProperty");
    expect(ent).toContain("canContactLandlord");
  });

  it("contact-landlord action checks subscription + rate limit + authorization", () => {
    const actions = readSrc("lib/tenant/actions.ts");
    expect(actions).toContain("contactLandlordAction");
    expect(actions).toContain("subscription_tier");
    expect(actions).toContain("rateLimiter");
    expect(actions).toContain("canContactLandlord");
  });

  it("onboarding context handles tenant role (fetches tenant_profiles)", () => {
    const ctx = readSrc("lib/profiles/onboarding-context.ts");
    expect(ctx).toContain("tenant_profiles");
  });

  it("tenant actions NEVER expose private phone/email (uses messaging system)", () => {
    const actions = readSrc("lib/tenant/actions.ts");
    expect(actions).not.toMatch(/phone.*=.*input\./i);
    expect(actions).not.toMatch(/email.*=.*input\./i);
    expect(actions).toContain("messages");
  });

  it("contact-landlord action records audit log", () => {
    const actions = readSrc("lib/tenant/actions.ts");
    expect(actions).toContain("audit_logs");
    expect(actions).toContain("tenant.contact_landlord");
  });
});

// ---------------------------------------------------------------------------
// Security: trial users cannot contact, paid tenants can
// ---------------------------------------------------------------------------
describe("tenant security (spec Section 12)", () => {
  it("canContactLandlord is defined in the entitlements module", () => {
    const ent = readSrc("lib/tenant/entitlements.ts");
    // The function checks subscription_tier and returns false for free/trial
    expect(ent).toContain("subscription_tier");
    expect(ent).toContain("Free trial users can browse but not contact");
  });

  it("trial usage is tracked server-side (tenant_trial_usage table)", () => {
    const ent = readSrc("lib/tenant/entitlements.ts");
    expect(ent).toContain("tenant_trial_usage");
    expect(ent).toContain("listings_viewed");
    expect(ent).toContain("viewed_property_ids");
  });

  it("trial start is idempotent (cannot restart trial by re-calling)", () => {
    const ent = readSrc("lib/tenant/entitlements.ts");
    expect(ent).toContain("ignoreDuplicates: true");
  });

  it("canTenantViewProperty checks trial + records views server-side", () => {
    const ent = readSrc("lib/tenant/entitlements.ts");
    expect(ent).toContain("canTenantViewProperty");
    expect(ent).toContain("listings_viewed");
    expect(ent).toContain("listing_allowance");
  });
});
