import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { capabilitiesFor } from "@/lib/capabilities";

/**
 * Agent application infrastructure tests.
 *
 * Per spec Sections 4, 6, 7, 11, 17, 18, 35, 36, 41:
 *   * Only agents can submit (role derived from server session)
 *   * Monthly application limits enforced via capability system
 *   * Duplicate active applications prevented by DB EXCLUDE constraint
 *   * Accepted applications create representation relationships
 *   * RLS: agents see own, owners see received, public sees nothing
 *   * Audit logging for all status changes
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");

function allMigrationsContent(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n\n");
}

describe("agent application monthly limits (spec Section 7)", () => {
  it("agent Free: 10 applications per month", () => {
    expect(capabilitiesFor("agent", "free").maxApplicationsPerMonth).toBe(10);
  });

  it("agent Pro: 25 applications per month", () => {
    expect(capabilitiesFor("agent", "pro").maxApplicationsPerMonth).toBe(25);
  });

  it("agent Premium: unlimited (fair-use ceiling)", () => {
    const caps = capabilitiesFor("agent", "premium");
    expect(caps.maxApplicationsPerMonth).toBeGreaterThan(100);
  });

  it("landlords have unlimited (they receive, not submit)", () => {
    expect(capabilitiesFor("landlord", "free").maxApplicationsPerMonth).toBeNull();
    expect(capabilitiesFor("landlord", "pro").maxApplicationsPerMonth).toBeNull();
  });

  it("companies have unlimited (they receive, not submit)", () => {
    expect(capabilitiesFor("company", "free").maxApplicationsPerMonth).toBeNull();
    expect(capabilitiesFor("company", "premium").maxApplicationsPerMonth).toBeNull();
  });
});

describe("duplicate application prevention (spec Section 11)", () => {
  const content = allMigrationsContent();

  it("property_applications has EXCLUDE constraint for active applications", () => {
    expect(content).toMatch(/exclude\s*\(\s*property_id\s+with\s*=\s*,?\s*agent_id\s+with\s*=\s*\)/i);
  });

  it("EXCLUDE constraint applies only to pending + accepted statuses", () => {
    expect(content).toMatch(/where\s*\(\s*status\s+in\s*\(\s*'pending',?\s*'accepted'\s*\)\)/i);
  });
});

describe("application status machine (spec Section 2)", () => {
  it("all 6 statuses are defined in types", async () => {
    const typesContent = fs.readFileSync(
      path.join(process.cwd(), "src/types/applications.ts"),
      "utf8",
    );
    expect(typesContent).toMatch(/pending.*accepted.*declined.*withdrawn.*expired.*completed/s);
  });

  it("APPLICATION_TRANSITIONS defines valid transitions", async () => {
    const typesContent = fs.readFileSync(
      path.join(process.cwd(), "src/types/applications.ts"),
      "utf8",
    );
    // pending → accepted/declined/withdrawn/expired
    expect(typesContent).toMatch(/pending.*accepted.*declined.*withdrawn.*expired/s);
    // accepted → completed/withdrawn
    expect(typesContent).toMatch(/accepted.*completed.*withdrawn/s);
    // declined/withdrawn/expired/completed are terminal (empty arrays)
    expect(typesContent).toMatch(/declined:\s*\[\]/);
    expect(typesContent).toMatch(/withdrawn:\s*\[\]/);
    expect(typesContent).toMatch(/expired:\s*\[\]/);
    expect(typesContent).toMatch(/completed:\s*\[\]/);
  });
});

describe("property_applications RLS (spec Section 35)", () => {
  const content = allMigrationsContent();

  it("property_applications has RLS enabled", () => {
    expect(content).toMatch(/alter\s+table\s+public\.property_applications\s+enable\s+row\s+level\s+security/i);
  });

  it("agents can read their own applications", () => {
    expect(content).toMatch(/Agents\s+can\s+read\s+their\s+own\s+applications/i);
  });

  it("agents can submit applications", () => {
    expect(content).toMatch(/Agents\s+can\s+submit\s+applications/i);
  });

  it("decision makers can update application status", () => {
    expect(content).toMatch(/Decision\s+makers\s+can\s+update\s+application\s+status/i);
  });
});

describe("representation table (spec Section 18, 34)", () => {
  const content = allMigrationsContent();

  it("property_agent_representations table exists", () => {
    expect(content).toMatch(/create\s+table.*property_agent_representations/i);
  });

  it("has property_id, agent_id, owner_id, source_application_id", () => {
    expect(content).toMatch(/property_id\s+uuid\s+not\s+null/i);
    expect(content).toMatch(/agent_id\s+uuid\s+not\s+null/i);
    expect(content).toMatch(/owner_id\s+uuid\s+not\s+null/i);
    expect(content).toMatch(/source_application_id\s+uuid/i);
  });

  it("has status with active/ended/suspended", () => {
    expect(content).toMatch(/status.*in\s*\(\s*'active',?\s*'ended',?\s*'suspended'\s*\)/i);
  });

  it("has starts_at + ends_at + end_reason", () => {
    expect(content).toMatch(/starts_at\s+timestamptz/i);
    expect(content).toMatch(/ends_at\s+timestamptz/i);
    expect(content).toMatch(/end_reason\s+text/i);
  });

  it("has UNIQUE on (property_id, agent_id) to prevent duplicate representations", () => {
    expect(content).toMatch(/unique\s*\(\s*property_id,?\s*agent_id\s*\)/i);
  });

  it("has RLS enabled", () => {
    expect(content).toMatch(/alter\s+table\s+public\.property_agent_representations\s+enable\s+row\s+level\s+security/i);
  });

  it("public can read active representations for visible properties", () => {
    expect(content).toMatch(/Public\s+can\s+read\s+active\s+representations\s+for\s+visible\s+properties/i);
  });

  it("agents can read their own representations", () => {
    expect(content).toMatch(/Agents\s+can\s+read\s+their\s+own\s+representations/i);
  });

  it("property owners can manage representations", () => {
    expect(content).toMatch(/Property\s+owners\s+can\s+manage\s+representations/i);
  });
});

describe("server-side authorization (spec Section 36)", () => {
  it("submitApplication derives identity from server session, not client", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/applications/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/getCurrentUser\(\)/);
    expect(source).toMatch(/getCurrentProfile\(\)/);
    // The function signature takes propertyId + message, NOT a userId
    expect(source).not.toMatch(/export\s+async\s+function\s+submitApplication\s*\(\s*input\s*:\s*\{[^}]*userId/i);
  });

  it("acceptApplication verifies the caller is the decision_maker", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/applications/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/decision_maker_id\s*!==\s*profile\.id/);
  });

  it("withdrawApplication verifies the caller is the agent", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/applications/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/agent_id\s*!==\s*profile\.id/);
  });

  it("all actions include capability check for agent application limits", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/applications/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/capabilitiesFor\(/);
    expect(source).toMatch(/maxApplicationsPerMonth/);
  });

  it("acceptApplication creates a representation relationship", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/applications/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/property_agent_representations/);
    expect(source).toMatch(/source_application_id/);
  });

  it("all actions write audit logs", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/applications/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/audit_logs/);
    expect(source).toMatch(/application\.submit/);
    expect(source).toMatch(/application\.withdraw/);
    expect(source).toMatch(/application\.accept/);
    expect(source).toMatch(/application\.decline/);
  });
});

describe("application data privacy (spec Section 37)", () => {
  it("application fetchers use authenticated session, not client-supplied IDs", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/applications/fetchers.ts"),
      "utf8",
    );
    expect(source).toMatch(/getCurrentProfile\(\)/);
    // getAgentApplications filters by profile.id (server-derived)
    expect(source).toMatch(/\.eq\("agent_id",\s*profile\.id\)/);
    // getOwnerApplications filters by profile.id (server-derived)
    expect(source).toMatch(/\.eq\("decision_maker_id",\s*profile\.id\)/);
  });

  it("getApplicationById verifies the caller is agent OR decision_maker", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/applications/fetchers.ts"),
      "utf8",
    );
    expect(source).toMatch(/agent_id\s*!==\s*profile\.id\s*&&\s*app\.decision_maker_id\s*!==\s*profile\.id/);
  });
});
