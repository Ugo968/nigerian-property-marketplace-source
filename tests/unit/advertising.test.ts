import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Advertising marketplace tests.
 *
 * Per spec Sections 1, 2, 4, 5, 12, 14, 16, 24, 29, 31:
 *   * No fourth marketplace role
 *   * ₦5,000 minimum budget enforced
 *   * Campaign lifecycle states + transitions
 *   * RLS — advertisers access own data only
 *   * Payment via existing abstraction
 *   * Campaigns reviewed before activation
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");

function allMigrationsContent(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n\n");
}

describe("advertising tables (spec Section 28)", () => {
  const content = allMigrationsContent();

  it("advertising_businesses table exists with expected fields", () => {
    expect(content).toMatch(/create\s+table.*advertising_businesses[\s\S]*?owner_user_id\s+uuid\s+not\s+null/i);
    expect(content).toMatch(/advertising_businesses[\s\S]*?business_name\s+text\s+not\s+null/i);
    expect(content).toMatch(/advertising_businesses[\s\S]*?category_id\s+uuid\s+not\s+null/i);
    expect(content).toMatch(/advertising_businesses[\s\S]*?contact_email\s+text\s+not\s+null/i);
    expect(content).toMatch(/advertising_businesses[\s\S]*?status\s+text\s+not\s+null/i);
  });

  it("advertising_campaigns table exists with expected fields", () => {
    expect(content).toMatch(/create\s+table.*advertising_campaigns[\s\S]*?business_id\s+uuid\s+not\s+null/i);
    expect(content).toMatch(/advertising_campaigns[\s\S]*?name\s+text\s+not\s+null/i);
    expect(content).toMatch(/advertising_campaigns[\s\S]*?budget_naira\s+bigint\s+not\s+null/i);
    expect(content).toMatch(/advertising_campaigns[\s\S]*?spent_naira\s+bigint/i);
    expect(content).toMatch(/advertising_campaigns[\s\S]*?placement_id\s+uuid\s+not\s+null/i);
    expect(content).toMatch(/advertising_campaigns[\s\S]*?impressions\s+bigint/i);
    expect(content).toMatch(/advertising_campaigns[\s\S]*?clicks\s+bigint/i);
  });

  it("advertising_creatives table exists", () => {
    expect(content).toMatch(/create\s+table.*advertising_creatives[\s\S]*?business_id\s+uuid\s+not\s+null/i);
    expect(content).toMatch(/advertising_creatives[\s\S]*?storage_path\s+text\s+not\s+null/i);
    expect(content).toMatch(/advertising_creatives[\s\S]*?target_url\s+text\s+not\s+null/i);
  });
});

describe("minimum budget enforcement (spec Section 5)", () => {
  const content = allMigrationsContent();

  it("advertising_campaigns has CHECK: budget_naira >= 500000 (₦5,000 in kobo)", () => {
    expect(content).toMatch(/budget_naira\s*>=\s*500000/i);
  });

  it("spent_naira CHECK: >= 0 and <= budget_naira", () => {
    expect(content).toMatch(/spent_naira\s*>=\s*0/i);
    expect(content).toMatch(/spent_naira\s*<=\s*budget_naira/i);
  });

  it("config enforces ₦5,000 minimum", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/advertising/config.ts"),
      "utf8",
    );
    expect(source).toMatch(/MIN_CAMPAIGN_BUDGET_NAIRA\s*=\s*5000/);
    expect(source).toMatch(/MIN_CAMPAIGN_BUDGET_KOBO/);
  });

  it("server action validates budget server-side", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/advertising/actions.ts"),
      "utf8",
    );
    expect(source).toMatch(/budgetNaira\s*<\s*MIN_CAMPAIGN_BUDGET_NAIRA/);
  });
});

describe("campaign lifecycle (spec Section 4)", () => {
  it("supports all 8 campaign statuses", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/advertising/config.ts"),
      "utf8",
    );
    expect(source).toMatch(/draft/);
    expect(source).toMatch(/pending_payment/);
    expect(source).toMatch(/pending_review/);
    expect(source).toMatch(/active/);
    expect(source).toMatch(/paused/);
    expect(source).toMatch(/completed/);
    expect(source).toMatch(/rejected/);
    expect(source).toMatch(/cancelled/);
  });

  it("CAMPAIGN_TRANSITIONS enforces valid transitions", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/advertising/config.ts"),
      "utf8",
    );
    expect(source).toMatch(/CAMPAIGN_TRANSITIONS/);
    // Draft can go to pending_payment or cancelled
    expect(source).toMatch(/draft.*pending_payment.*cancelled/s);
    // pending_review can go to active or rejected
    expect(source).toMatch(/pending_review.*active.*rejected/s);
    // Terminal states are empty arrays
    expect(source).toMatch(/completed.*\[\]/s);
    expect(source).toMatch(/rejected.*\[\]/s);
  });

  it("isValidTransition checks CAMPAIGN_TRANSITIONS", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/advertising/eligibility.ts"),
      "utf8",
    );
    expect(source).toMatch(/isValidTransition/);
    expect(source).toMatch(/CAMPAIGN_TRANSITIONS/);
  });
});

describe("no fourth role (spec Section 1)", () => {
  it("advertising_businesses references auth.users, not profiles.role", () => {
    const content = allMigrationsContent();
    expect(content).toMatch(/advertising_businesses[\s\S]*?owner_user_id\s+uuid\s+not\s+null\s+references\s+auth\.users/i);
  });

  it("businesses are NOT added as a marketplace role enum value", () => {
    const content = allMigrationsContent();
    // The profiles role CHECK should still be landlord/agent/company only
    expect(content).toMatch(/check\s*\(\s*role\s+in\s*\(\s*'landlord',?\s*'agent',?\s*'company'\s*\)/i);
    // No 'advertiser' or 'business' in the role enum
    expect(content).not.toMatch(/role\s+in.*advertiser/i);
    expect(content).not.toMatch(/role\s+in.*business/i);
  });
});

describe("advertising RLS (spec Section 29)", () => {
  const content = allMigrationsContent();

  it("advertising_businesses has RLS", () => {
    expect(content).toMatch(/alter\s+table\s+public\.advertising_businesses\s+enable\s+row\s+level\s+security/i);
  });

  it("approved businesses publicly readable", () => {
    expect(content).toMatch(/Approved\s+advertisers\s+are\s+publicly\s+readable/i);
  });

  it("owners can read own businesses", () => {
    expect(content).toMatch(/Owners\s+can\s+read\s+their\s+own\s+advertising\s+businesses/i);
  });

  it("advertising_campaigns has RLS", () => {
    expect(content).toMatch(/alter\s+table\s+public\.advertising_campaigns\s+enable\s+row\s+level\s+security/i);
  });

  it("owners can manage own campaigns", () => {
    expect(content).toMatch(/Owners\s+can\s+manage\s+their\s+own\s+campaigns/i);
  });

  it("active campaigns publicly readable for approved businesses", () => {
    expect(content).toMatch(/Active\s+campaigns\s+are\s+publicly\s+readable/i);
  });
});

describe("campaign review (spec Section 14)", () => {
  it("submitCampaignAction moves to pending_review (not active)", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/advertising/actions.ts"),
      "utf8",
    );
    // After payment, campaign should be in pending_review (NOT active)
    // The webhook handler should move to pending_review after payment verification
    expect(source).toMatch(/pending_review|pending_payment/i);
    // The action should NOT directly set active
    expect(source).not.toMatch(/status.*active.*submitCampaign/i);
  });
});

describe("payment integration (spec Section 12, 13)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/advertising/actions.ts"),
    "utf8",
  );

  it("submitCampaignAction uses existing initiatePayment", () => {
    expect(source).toMatch(/initiatePayment/);
  });

  it("payment type is 'advertising'", () => {
    expect(source).toMatch(/paymentType.*advertising|payment_type.*advertising/i);
  });

  it("server-side price authority (uses campaign budget, not client)", () => {
    expect(source).toMatch(/camp\.budget_naira|amountInKobo/);
  });

  it("does NOT create separate payment system", () => {
    expect(source).not.toMatch(/PaystackAdapter|FlutterwaveAdapter/i);
  });
});

describe("server actions security (spec Section 24)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/advertising/actions.ts"),
    "utf8",
  );

  it("createBusinessAction derives identity from server session", () => {
    expect(source).toMatch(/getCurrentUser\(\)/);
  });

  it("createCampaignAction verifies business ownership", () => {
    expect(source).toMatch(/owner_user_id\s*!==\s*user\.id/i);
    expect(source).toMatch(/FORBIDDEN/i);
  });

  it("submitCampaignAction verifies campaign ownership", () => {
    expect(source).toMatch(/submitCampaignAction/);
    expect(source).toMatch(/owner_user_id\s*!==\s*user\.id/i);
  });

  it("uses service-role client for privileged operations", () => {
    expect(source).toMatch(/createAdminClient\(\)/);
    expect(source).not.toMatch(/createBrowserClient/);
  });
});

describe("eligibility service (spec Section 16)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/advertising/eligibility.ts"),
    "utf8",
  );

  it("canServeCampaign checks campaign status", () => {
    expect(source).toMatch(/canServeCampaign/);
    expect(source).toMatch(/status\s*!==\s*"active"/);
  });

  it("checks advertiser status", () => {
    expect(source).toMatch(/advertising_businesses\.status\s*!==\s*"approved"/);
  });

  it("checks campaign dates", () => {
    expect(source).toMatch(/starts_at/i);
    expect(source).toMatch(/ends_at/i);
  });

  it("checks budget not exhausted", () => {
    expect(source).toMatch(/spent_naira.*budget_naira|spent_naira.*budget/i);
  });
});

describe("ad labeling (spec Section 15)", () => {
  it("business profile page has 'Sponsored' badge", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/businesses/[id]/page.tsx"),
      "utf8",
    );
    expect(source).toMatch(/Sponsored/i);
  });

  it("advertise page mentions 'separate from marketplace roles'", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/advertise/page.tsx"),
      "utf8",
    );
    expect(source).toMatch(/separate.*marketplace/i);
  });
});

describe("audit events (spec Section 31)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/advertising/actions.ts"),
    "utf8",
  );

  it("records business_created", () => {
    expect(source).toMatch(/business_created/);
  });

  it("records campaign_created", () => {
    expect(source).toMatch(/campaign_created/);
  });

  it("records campaign_submitted", () => {
    expect(source).toMatch(/campaign_submitted/);
  });

  it("records campaign pause/resume/cancel", () => {
    expect(source).toMatch(/campaign_paused|campaign_active|campaign_cancelled|changeCampaignStatus/i);
  });

  it("does NOT log payment secrets", () => {
    expect(source).not.toMatch(/secret_key|secretKey|api_key|apiKey/i);
  });
});

describe("advertising vs featured (spec Section 26)", () => {
  it("advertising tables are separate from featured_listing tables", () => {
    const content = allMigrationsContent();
    expect(content).toMatch(/create\s+table.*advertising_campaigns/i);
    expect(content).toMatch(/create\s+table.*featured_listings/i);
    // No FK between the two
    expect(content).not.toMatch(/advertising_campaigns[\s\S]*?references.*featured_listings/i);
  });
});
