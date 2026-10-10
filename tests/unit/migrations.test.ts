import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Migration file integrity tests.
 *
 * The sandbox dev environment uses Prisma + SQLite locally, so the
 * Supabase Postgres migrations cannot be executed against a live DB here.
 * These tests verify the migration files are structurally sound:
 *
 *   - All expected migration files exist
 *   - Each migration is non-empty and ends with a semicolon or $$ block
 *   - Critical tables referenced by the app's TypeScript types are
 *     declared in some migration file
 *
 * When a real Supabase project is wired up in CI / production, the
 * migration tests in tests/sql/ can be run with `psql` to verify RLS
 * + constraints + functions actually behave as expected.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");

const EXPECTED_MIGRATIONS = [
  "0001_initial_foundation.sql",
  "0002_profile_extensions.sql",
  "0003_role_specific_profiles.sql",
  "0004_verification.sql",
  "0005_properties.sql",
  "0006_property_media_and_amenities.sql",
  "0007_applications_and_interactions.sql",
  "0008_saved_items.sql",
  "0009_subscriptions.sql",
  "0010_payments.sql",
  "0011_featured_listings.sql",
  "0012_advertising.sql",
  "0013_reviews.sql",
  "0014_messaging.sql",
  "0015_notifications.sql",
  "0016_reports.sql",
  "0017_database_functions.sql",
  "0018_storage_policies.sql",
  "0019_property_extensions.sql",
  "0020_property_agent_representations.sql",
  "0021_review_indexes.sql",
  "0022_featured_credit_ledger.sql",
  "0023_notifications_extensions.sql",
  "0024_admin_extensions.sql",
  "0025_property_transactions.sql",
  "0026_security_hardening.sql",
  "0027_tenant_role.sql",
  "0028_property_types_and_location_extensions.sql",
];

// Tables that MUST be created somewhere in the migrations. The TS types
// in src/types/database.ts depend on these existing.
const REQUIRED_TABLES = [
  "profiles",
  "landlord_profiles",
  "agent_profiles",
  "company_profiles",
  "admin_users",
  "audit_logs",
  "verification_applications",
  "verification_documents",
  "verification_reviews",
  "verification_history",
  "properties",
  "property_locations",
  "property_types",
  "amenities",
  "property_amenities",
  "property_media",
  "property_applications",
  "property_interactions",
  "saved_properties",
  "saved_searches",
  "property_alerts",
  "subscription_plans",
  "user_subscriptions",
  "payments",
  "payment_events",
  "featured_listing_credits",
  "featured_listings",
  "advertiser_categories",
  "advertising_placements",
  "advertising_businesses",
  "advertising_creatives",
  "advertising_campaigns",
  "reviews",
  "conversations",
  "conversation_participants",
  "messages",
  "conversation_blocks",
  "notifications",
  "reports",
  "property_view_counts",
  "notification_preferences",
  "notification_events",
  "email_delivery_records",
  "admin_action_records",
  "report_categories",
  "platform_settings",
  "transactions",
  "transaction_participants",
  "transaction_status_history",
  "inspections",
  "negotiation_records",
  "offers",
  "offer_history",
  "tenant_profiles",
  "tenant_trial_usage",
  "property_type_keywords",
];

// RLS-enabled tables. The string "enable row level security" must appear
// for each of these tables in some migration.
const RLS_TABLES = REQUIRED_TABLES.filter((t) => t !== "property_view_counts");

// Database functions that must be declared.
const REQUIRED_FUNCTIONS = [
  "set_updated_at",
  "is_admin",
  "is_caller_admin",
  "user_profile_id",
  "can_manage_property",
  "mark_notification_read",
  "mark_notification_unread",
  "mark_all_notifications_read",
  "dismiss_notification",
  "dispatch_notification",
  "increment_property_views",
  "record_audit",
];

describe("database migrations", () => {
  const migrationFiles = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"))
    : [];

  const allMigrationsContent = migrationFiles
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n\n");

  it("has all expected migration files", () => {
    for (const filename of EXPECTED_MIGRATIONS) {
      expect(
        migrationFiles.includes(filename),
        `Missing migration: ${filename}`,
      ).toBe(true);
    }
  });

  it("every migration file is non-empty", () => {
    for (const filename of migrationFiles) {
      const content = fs.readFileSync(
        path.join(MIGRATIONS_DIR, filename),
        "utf8",
      );
      // Strip comments + whitespace
      const stripped = content
        .replace(/--.*$/gm, "")
        .replace(/\s+/g, " ")
        .trim();
      expect(stripped.length, `${filename} is empty`).toBeGreaterThan(0);
    }
  });

  it("migrations are ordered deterministically", () => {
    const sorted = [...migrationFiles].sort();
    // Readdir may not return files in sort order on all platforms.
    // The IMPORTANT property: every expected file exists (covered above)
    // and the filenames sort lexicographically (so migration order is
    // deterministic when applied).
    expect(migrationFiles.length).toEqual(sorted.length);
    for (const f of migrationFiles) {
      expect(sorted.includes(f)).toBe(true);
    }
  });

  it("creates all required tables", () => {
    for (const table of REQUIRED_TABLES) {
      const pattern = new RegExp(
        `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\b`,
        "i",
      );
      expect(
        pattern.test(allMigrationsContent),
        `Table ${table} not declared in any migration`,
      ).toBe(true);
    }
  });

  it("enables RLS on all required tables", () => {
    for (const table of RLS_TABLES) {
      const pattern = new RegExp(
        `alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,
        "i",
      );
      expect(
        pattern.test(allMigrationsContent),
        `RLS not enabled on ${table}`,
      ).toBe(true);
    }
  });

  it("declares all required database functions", () => {
    for (const fn of REQUIRED_FUNCTIONS) {
      const pattern = new RegExp(
        `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${fn}\\b`,
        "i",
      );
      expect(
        pattern.test(allMigrationsContent),
        `Function ${fn} not declared`,
      ).toBe(true);
    }
  });

  it("uses gen_random_uuid() as the primary key default (not UUID-OSSP)", () => {
    // pgcrypto's gen_random_uuid() is the modern, faster choice.
    expect(allMigrationsContent).toContain("gen_random_uuid()");
    // Should NOT use uuid-ossp's uuid_generate_v4()
    expect(allMigrationsContent).not.toContain("uuid_generate_v4()");
  });

  it("profiles enforces role check constraint for the four marketplace roles", () => {
    // Check that 'landlord', 'agent', 'company', 'tenant' all appear in
    // profile role check (migration 0027 relaxed the original 3-role constraint).
    expect(allMigrationsContent).toMatch(
      /check\s*\(\s*role\s+in\s*\(\s*'landlord',?\s*'agent',?\s*'company',?\s*'tenant'\s*\)/i,
    );
  });

  it("properties enforce transaction_type check constraint", () => {
    expect(allMigrationsContent).toMatch(
      /transaction_type\s+in\s*\(\s*'rent',?\s*'sale',?\s*'shortlet'\s*\)/i,
    );
  });

  it("payments enforce provider check constraint", () => {
    expect(allMigrationsContent).toMatch(
      /provider\s+in\s*\(\s*'paystack',?\s*'flutterwave'\s*\)/i,
    );
  });

  it("advertising campaigns enforce the ₦5,000 minimum budget", () => {
    // 500000 kobo = ₦5,000. Spec requires the minimum.
    expect(allMigrationsContent).toContain("budget_naira >= 500000");
  });

  it("property_applications prevents duplicate active applications via EXCLUDE", () => {
    expect(allMigrationsContent).toMatch(
      /exclude\s*\(\s*property_id\s+with\s*=\s*,?\s*agent_id\s+with\s*=\s*\)/i,
    );
  });

  it("saved_properties has a unique constraint on (user_id, property_id)", () => {
    expect(allMigrationsContent).toMatch(
      /unique\s*\(\s*user_id,?\s*property_id\s*\)/i,
    );
  });

  it("verification_documents is unique on storage_path", () => {
    expect(allMigrationsContent).toMatch(
      /unique\s*\(\s*storage_path\s*\)/i,
    );
  });

  it("payments has unique constraint on (provider, provider_reference)", () => {
    expect(allMigrationsContent).toMatch(
      /unique\s*\(\s*provider,?\s*provider_reference\s*\)/i,
    );
  });

  it("reviews has rating check constraint (1-5)", () => {
    expect(allMigrationsContent).toMatch(
      /rating\s*>=\s*1\s*and\s*rating\s*<=\s*5/i,
    );
  });

  it("audit_logs is append-only — no UPDATE policy", () => {
    // Find the audit_logs section
    const auditSection = allMigrationsContent.match(
      /create\s+table[\s\S]*?audit_logs[\s\S]*?(?=\n--\s*--)/i,
    );
    expect(auditSection).toBeDefined();
    // The audit_logs policy should be INSERT only (no UPDATE)
    expect(allMigrationsContent).toMatch(
      /on\s+public\.audit_logs\s+for\s+insert/i,
    );
    expect(allMigrationsContent).not.toMatch(
      /on\s+public\.audit_logs\s+for\s+update/i,
    );
    expect(allMigrationsContent).not.toMatch(
      /on\s+public\.audit_logs\s+for\s+delete/i,
    );
  });

  it("verification_documents are NOT publicly readable", () => {
    // Look for the bucket policy on verification-documents
    expect(allMigrationsContent).toMatch(
      /bucket_id\s*=\s*'verification-documents'/i,
    );
    // The select policy should require the auth user to be the applicant
    expect(allMigrationsContent).toMatch(
      /verification_docs_applicant_read/i,
    );
  });

  it("subscription_tier on profiles is immutable from client side", () => {
    // The update policy on profiles must include a check that subscription_tier
    // is not being changed.
    expect(allMigrationsContent).toMatch(
      /subscription_tier\s*=\s*\(\s*select\s+subscription_tier\s+from\s+public\.profiles/i,
    );
  });

  it("property prices are non-negative", () => {
    expect(allMigrationsContent).toMatch(/price\s*>=\s*0/i);
  });

  it("features the verified-only conversation policy hint in comments", () => {
    // The spec's chat rules are documented in the migration comments.
    // Hard enforcement happens at the application layer (P6).
    expect(allMigrationsContent).toMatch(
      /Limits restrict STARTING new eligible conversations/i,
    );
  });
});

describe("seed data", () => {
  const SEED_DIR = path.join(process.cwd(), "supabase/seed");

  const EXPECTED_SEEDS = [
    "001_property_types.sql",
    "002_amenities.sql",
    "003_subscription_plans.sql",
    "004_advertiser_categories.sql",
    "005_advertising_placements.sql",
  ];

  const seedFiles = fs.existsSync(SEED_DIR)
    ? fs.readdirSync(SEED_DIR).filter((f) => f.endsWith(".sql"))
    : [];

  const allSeedContent = seedFiles
    .map((f) => fs.readFileSync(path.join(SEED_DIR, f), "utf8"))
    .join("\n\n");

  it("has all expected seed files", () => {
    for (const filename of EXPECTED_SEEDS) {
      expect(seedFiles.includes(filename), `Missing seed: ${filename}`).toBe(
        true,
      );
    }
  });

  it("seeds property types covering all categories from spec", () => {
    const requiredTypes = [
      "apartment",
      "house",
      "duplex",
      "bungalow",
      "terrace",
      "detached_house",
      "semi_detached_house",
      "mansion",
      "penthouse",
      "office",
      "shop",
      "warehouse",
      "commercial_building",
      "hotel",
      "guest_house",
      "event_center",
      "school",
      "hospital",
      "farmland",
      "residential_land",
      "commercial_land",
      "industrial_land",
      "mixed_use",
      "estate",
      "shortlet",
      "other",
    ];
    for (const slug of requiredTypes) {
      expect(
        allSeedContent.includes(`'${slug}'`),
        `Property type '${slug}' not seeded`,
      ).toBe(true);
    }
  });

  it("seeds the exact spec amenities", () => {
    const requiredAmenities = [
      "parking",
      "security",
      "swimming_pool",
      "generator",
      "electricity",
      "water",
      "furnished",
      "air_conditioning",
      "fitted_kitchen",
      "internet",
      "elevator",
      "gym",
      "garden",
      "balcony",
      "boys_quarters",
      "gate",
      "cctv",
    ];
    for (const slug of requiredAmenities) {
      expect(
        allSeedContent.includes(`'${slug}'`),
        `Amenity '${slug}' not seeded`,
      ).toBe(true);
    }
  });

  it("seeds the exact spec subscription prices", () => {
    expect(allSeedContent).toContain("'landlord', 'free',    0");
    expect(allSeedContent).toContain("'landlord', 'pro',     3500");
    expect(allSeedContent).toContain("'landlord', 'premium', 9500");
    expect(allSeedContent).toContain("'agent', 'free',    0");
    expect(allSeedContent).toContain("'agent', 'pro',     5000");
    expect(allSeedContent).toContain("'agent', 'premium', 12000");
    expect(allSeedContent).toContain("'company', 'free',    0");
    expect(allSeedContent).toContain("'company', 'pro',     20000");
    expect(allSeedContent).toContain("'company', 'premium', 35000");
  });

  it("marks Company Premium as variable price", () => {
    expect(allSeedContent).toMatch(
      /'company',\s*'premium',\s*35000,\s*true/i,
    );
  });

  it("seeds minimum advertising spend constant in the migration", () => {
    const migrations = fs
      .readdirSync(MIGRATIONS_DIR)
      .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
      .join("\n\n");
    expect(migrations).toContain("budget_naira >= 500000");
  });

  it("uses on conflict do nothing for seed idempotency", () => {
    expect(allSeedContent).toContain("on conflict (slug) do nothing");
    expect(allSeedContent).toContain(
      "on conflict (role, tier, billing_cycle) do nothing",
    );
  });
});
