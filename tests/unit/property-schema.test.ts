import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Property schema migration tests.
 *
 * Verifies the migration 0019_property_extensions.sql adds the required
 * columns + constraints for the property listing system (Phase 6).
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");

function allMigrationsContent(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n\n");
}

function migrationContent(name: string): string {
  const filePath = path.join(MIGRATIONS_DIR, name);
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

describe("migration 0019_property_extensions.sql exists", () => {
  it("file exists", () => {
    const content = migrationContent("0019_property_extensions.sql");
    expect(content.length).toBeGreaterThan(0);
  });
});

describe("properties table has furnished_status column with CHECK", () => {
  const all = allMigrationsContent();

  it("adds furnished_status text column", () => {
    expect(all).toMatch(/add\s+column\s+if\s+not\s+exists\s+furnished_status\s+text/i);
  });

  it("has CHECK for the 4 valid furnished_status values", () => {
    expect(all).toMatch(
      /furnished_status\s+in\s*\(\s*'furnished',?\s*'semi_furnished',?\s*'unfurnished',?\s*'not_applicable'\s*\)/i,
    );
  });

  it("defaults furnished_status to 'not_applicable'", () => {
    expect(all).toMatch(/furnished_status\s+text\s+not\s+null\s+default\s+'not_applicable'/i);
  });
});

describe("properties table has year_built, parking_spaces, floors", () => {
  const all = allMigrationsContent();

  it("adds year_built smallint", () => {
    expect(all).toMatch(/add\s+column\s+if\s+not\s+exists\s+year_built\s+smallint/i);
  });

  it("adds parking_spaces smallint with default 0", () => {
    expect(all).toMatch(/add\s+column\s+if\s+not\s+exists\s+parking_spaces\s+smallint\s+not\s+null\s+default\s+0/i);
  });

  it("adds floors smallint", () => {
    expect(all).toMatch(/add\s+column\s+if\s+not\s+exists\s+floors\s+smallint/i);
  });

  it("year_built has CHECK with year range", () => {
    expect(all).toMatch(/year_built\s+is\s+null\s+or.*year_built\s*>=\s*1800/i);
  });

  it("parking_spaces has CHECK >= 0", () => {
    expect(all).toMatch(/parking_spaces\s*>=\s*0/i);
  });
});

describe("price_frequency CHECK includes per_night", () => {
  const all = allMigrationsContent();

  it("drops existing price_frequency CHECK constraint (idempotent)", () => {
    expect(all).toMatch(/drop\s+constraint\s+if\s+exists/i);
  });

  it("adds expanded price_frequency CHECK with per_night", () => {
    expect(all).toMatch(
      /price_frequency\s+is\s+null\s+or\s+price_frequency\s+in\s*\(\s*'one_off',?\s*'per_day',?\s*'per_week',?\s*'per_month',?\s*'per_year',?\s*'per_night'\s*\)/i,
    );
  });
});

describe("title_quality anti-spam column", () => {
  const all = allMigrationsContent();

  it("adds title_quality text column", () => {
    expect(all).toMatch(/add\s+column\s+if\s+not\s+exists\s+title_quality\s+text/i);
  });

  it("defaults title_quality to 'clean'", () => {
    expect(all).toMatch(/title_quality\s+text\s+not\s+null\s+default\s+'clean'/i);
  });

  it("has CHECK for the 6 valid title_quality values", () => {
    expect(all).toMatch(
      /title_quality\s+in\s*\(\s*'clean',?\s*'suspicious_caps',?\s*'excessive_punctuation',?\s*'spam_pattern',?\s*'too_short',?\s*'too_long'\s*\)/i,
    );
  });
});

describe("property RLS + storage policies (from earlier migrations)", () => {
  const all = allMigrationsContent();

  it("properties table has RLS enabled", () => {
    expect(all).toMatch(/alter\s+table\s+public\.properties\s+enable\s+row\s+level\s+security/i);
  });

  it("property_media table has RLS enabled", () => {
    expect(all).toMatch(/alter\s+table\s+public\.property_media\s+enable\s+row\s+level\s+security/i);
  });

  it("public can read only published (non-deleted, non-draft) properties", () => {
    expect(all).toMatch(
      /Active\s+properties\s+are\s+publicly\s+readable/i,
    );
  });

  it("only property managers can insert/update/delete media", () => {
    expect(all).toMatch(/Property\s+managers\s+can\s+manage\s+media/i);
  });

  it("property-media storage bucket has owner-write policy via can_manage_property", () => {
    expect(all).toMatch(/property_media_manager_write/);
    expect(all).toMatch(/public\.can_manage_property\(/);
  });
});

describe("property ownership model (3 distinct IDs)", () => {
  const all = allMigrationsContent();

  it("properties table has owner_profile_id", () => {
    expect(all).toMatch(/owner_profile_id\s+uuid/i);
  });

  it("properties table has listing_creator_id (NOT NULL)", () => {
    expect(all).toMatch(/listing_creator_id\s+uuid\s+not\s+null/i);
  });

  it("properties table has managing_agent_id", () => {
    expect(all).toMatch(/managing_agent_id\s+uuid/i);
  });

  it("owner_profile_id CHECK enforces landlord/company role only", () => {
    expect(all).toMatch(/owner_role_valid/i);
    expect(all).toMatch(
      /p\.role\s+in\s*\(\s*'landlord',?\s*'company'\s*\)/i,
    );
  });
});
