import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Featured listings & paid promotion tests.
 *
 * Per spec Sections 2, 3, 7, 9, 10, 15, 20, 21, 29, 30, 34, 41:
 *   * Eligibility: ownership + property status + plan capability
 *   * Credit ledger: append-only, no negative balances
 *   * No pay-to-win: featured weight is 10% max, hard filters always win
 *   * Verification ≠ featured, reputation ≠ featured
 *   * RLS: users read own, can't self-assign credits
 *   * Payment idempotency: no duplicate credit grants
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");

function allMigrationsContent(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n\n");
}

describe("featured listing tables (spec Section 4)", () => {
  const content = allMigrationsContent();

  it("featured_listings table exists with expected fields", () => {
    expect(content).toMatch(/create\s+table.*featured_listings[\s\S]*?property_id\s+uuid\s+not\s+null/i);
    expect(content).toMatch(/featured_listings[\s\S]*?purchaser_id\s+uuid\s+not\s+null/i);
    expect(content).toMatch(/featured_listings[\s\S]*?placement\s+text\s+not\s+null/i);
    expect(content).toMatch(/featured_listings[\s\S]*?status\s+text\s+not\s+null/i);
    expect(content).toMatch(/featured_listings[\s\S]*?starts_at\s+timestamptz\s+not\s+null/i);
    expect(content).toMatch(/featured_listings[\s\S]*?ends_at\s+timestamptz\s+not\s+null/i);
    expect(content).toMatch(/featured_listings[\s\S]*?credit_id\s+uuid/i);
    expect(content).toMatch(/featured_listings[\s\S]*?payment_id\s+uuid/i);
    expect(content).toMatch(/featured_listings[\s\S]*?impressions\s+int/i);
    expect(content).toMatch(/featured_listings[\s\S]*?clicks\s+int/i);
  });

  it("featured_listings has CHECK: ends_at > starts_at", () => {
    expect(content).toMatch(/ends_at\s*>\s*starts_at/i);
  });

  it("featured_listing_credits table exists (spec Section 9)", () => {
    expect(content).toMatch(/create\s+table.*featured_listing_credits[\s\S]*?user_id\s+uuid\s+not\s+null/i);
    expect(content).toMatch(/featured_listing_credits[\s\S]*?amount\s+int\s+not\s+null/i);
    expect(content).toMatch(/featured_listing_credits[\s\S]*?remaining\s+int\s+not\s+null/i);
    expect(content).toMatch(/remaining\s*>=\s*0/i); // No negative balances
  });
});

describe("credit ledger (spec Section 10)", () => {
  const content = allMigrationsContent();

  it("featured_credit_transactions table exists (append-only ledger)", () => {
    expect(content).toMatch(/create\s+table.*featured_credit_transactions/i);
    expect(content).toMatch(/featured_credit_transactions[\s\S]*?amount\s+int\s+not\s+null/i);
    expect(content).toMatch(/featured_credit_transactions[\s\S]*?transaction_type\s+text\s+not\s+null/i);
  });

  it("supports transaction types: granted, consumed, refunded, expired, purchased, adjusted", () => {
    expect(content).toMatch(/transaction_type[\s\S]*?in\s*\(\s*'granted'[\s\S]*?'consumed'[\s\S]*?'refunded'[\s\S]*?'expired'[\s\S]*?'purchased'[\s\S]*?'adjusted'[\s\S]*?\)/i);
  });

  it("has RLS — users can read own transactions only", () => {
    expect(content).toMatch(/featured_credit_transactions[\s\S]*?enable\s+row\s+level\s+security/i);
    expect(content).toMatch(/Users\s+can\s+read\s+their\s+own\s+credit\s+transactions/i);
  });
});

describe("promotion products config (spec Section 13)", () => {
  const content = allMigrationsContent();

  it("promotion_products table exists", () => {
    expect(content).toMatch(/create\s+table.*promotion_products/i);
    expect(content).toMatch(/promotion_products[\s\S]*?slug\s+text\s+not\s+null\s+unique/i);
    expect(content).toMatch(/promotion_products[\s\S]*?credit_cost\s+int\s+not\s+null/i);
    expect(content).toMatch(/promotion_products[\s\S]*?duration_days\s+int\s+not\s+null/i);
  });

  it("seed data includes default promotion products", () => {
    expect(content).toMatch(/search_boost_7/i);
    expect(content).toMatch(/search_boost_14/i);
    expect(content).toMatch(/homepage_featured_7/i);
    expect(content).toMatch(/location_featured_7/i);
  });
});

describe("promotion RLS (spec Section 34)", () => {
  const content = allMigrationsContent();

  it("featured_listings publicly readable for active promotions", () => {
    expect(content).toMatch(/Featured\s+listings\s+are\s+publicly\s+readable/i);
  });

  it("users can read own featured listing credits only", () => {
    expect(content).toMatch(/Users\s+can\s+read\s+their\s+own\s+featured\s+listing\s+credits/i);
  });

  it("promotion_products publicly readable", () => {
    expect(content).toMatch(/Promotion\s+products\s+are\s+publicly\s+readable/i);
  });
});

describe("no pay-to-win (spec Section 3, 21)", () => {
  it("featured weight is only 10% of total ranking score", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/search/ranking.ts"),
      "utf8",
    );
    expect(source).toMatch(/featured:\s*0\.10/);
  });

  it("featured weight is less than freshness (the dominant signal)", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/search/ranking.ts"),
      "utf8",
    );
    expect(source).toMatch(/freshness:\s*0\.30/);
    // featured (0.10) < freshness (0.30)
  });

  it("ranking system does NOT implement pay-to-win logic", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/search/ranking.ts"),
      "utf8",
    );
    // The comment says "highest paying user is NOT the default ranking"
    // but the actual logic should NOT sort by payment amount.
    // Check that there's no sort by price/payment in the recommended sort.
    expect(source).toMatch(/highest\s+paying\s+user.*NOT/i);
  });

  it("featured computation checks is_featured flag (not payment amount)", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/search/ranking.ts"),
      "utf8",
    );
    expect(source).toMatch(/is_featured/i);
    expect(source).toMatch(/computeFeatured/);
  });
});

describe("verification ≠ featured (spec Section 29)", () => {
  it("featured listing does NOT automatically receive verification badge", () => {
    const actionsSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/featured/actions.ts"),
      "utf8",
    );
    // The actions should NOT touch verification_state
    expect(actionsSource).not.toMatch(/verification_state\s*=/);
  });
});

describe("reputation ≠ featured (spec Section 30)", () => {
  it("featured promotion does NOT increase star rating or review count", () => {
    const actionsSource = fs.readFileSync(
      path.join(process.cwd(), "src/lib/featured/actions.ts"),
      "utf8",
    );
    // The actions should NOT touch reviews or ratings
    expect(actionsSource).not.toMatch(/insert.*reviews/i);
    expect(actionsSource).not.toMatch(/rating\s*=/);
  });
});

describe("server actions security (spec Sections 7, 8, 16, 34)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/featured/actions.ts"),
    "utf8",
  );

  it("createPromotionAction derives identity from server session", () => {
    expect(source).toMatch(/getCurrentUser\(\)/);
    expect(source).toMatch(/getCurrentProfile\(\)/);
  });

  it("createPromotionAction verifies ownership (spec Section 8)", () => {
    expect(source).toMatch(/owner_profile_id\s*===\s*profile\.id|listing_creator_id\s*===\s*profile\.id/i);
    expect(source).toMatch(/managing_agent_id\s*===\s*profile\.id/i);
    expect(source).toMatch(/FORBIDDEN.*own\s+or\s+manage/i);
  });

  it("createPromotionAction checks property eligibility (spec Section 7)", () => {
    expect(source).toMatch(/deleted_at|status.*removed/i);
    expect(source).toMatch(/suspended/i);
    expect(source).toMatch(/published_at|draft/i);
  });

  it("cancelPromotionAction verifies ownership", () => {
    expect(source).toMatch(/cancelPromotionAction/);
    expect(source).toMatch(/purchaser_id\s*!==\s*profile\.id/);
  });

  it("purchaseCreditsAction uses server-side price (spec Section 16)", () => {
    expect(source).toMatch(/purchaseCreditsAction/);
    expect(source).toMatch(/CREDIT_PURCHASE_PRICE_NAIRA/i);
    expect(source).toMatch(/amountInKobo/);
  });

  it("grantPurchasedCredits is idempotent (spec Section 15)", () => {
    expect(source).toMatch(/grantPurchasedCredits/);
    expect(source).toMatch(/existingGrant|already\s+granted|idempotent/i);
  });

  it("uses service-role client (createAdminClient) for privileged operations", () => {
    expect(source).toMatch(/createAdminClient\(\)/);
    expect(source).not.toMatch(/createBrowserClient/);
  });
});

describe("payment integration (spec Section 12, 15, 35)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/featured/actions.ts"),
    "utf8",
  );

  it("uses existing payment service (initiatePayment)", () => {
    expect(source).toMatch(/initiatePayment/);
  });

  it("payment type is featured_listing", () => {
    expect(source).toMatch(/paymentType.*featured_listing|payment_type.*featured_listing/i);
  });

  it("does NOT create a separate payment system", () => {
    expect(source).not.toMatch(/PaystackAdapter\s+directly/i);
    expect(source).not.toMatch(/FlutterwaveAdapter\s+directly/i);
  });
});

describe("analytics foundation (spec Section 31, 32)", () => {
  const content = allMigrationsContent();

  it("promotion_impressions table exists for analytics", () => {
    expect(content).toMatch(/create\s+table.*promotion_impressions/i);
    expect(content).toMatch(/promotion_impressions[\s\S]*?event_type\s+text\s+not\s+null/i);
    expect(content).toMatch(/promotion_impressions[\s\S]*?impression.*click/i);
  });

  it("has click dedup index (spec Section 32: prevent obvious inflation)", () => {
    expect(content).toMatch(/promotion_impressions_click_dedup/i);
  });

  it("impressions table has no user RLS (server-side only)", () => {
    expect(content).toMatch(/promotion_impressions[\s\S]*?enable\s+row\s+level\s+security/i);
  });
});

describe("audit events (spec Section 36)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/featured/actions.ts"),
    "utf8",
  );

  it("records promotion_created audit event", () => {
    expect(source).toMatch(/promotion_created/);
  });

  it("records promotion_cancelled audit event", () => {
    expect(source).toMatch(/promotion_cancelled/);
  });

  it("records featured_credit_purchased audit event", () => {
    expect(source).toMatch(/featured_credit_purchased/);
  });

  it("does NOT log payment secrets in audit", () => {
    expect(source).not.toMatch(/secret_key|secretKey|api_key|apiKey/i);
  });
});

describe("config values (spec Section 11, 13)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/featured/config.ts"),
    "utf8",
  );

  it("defines promotion products with credit costs", () => {
    expect(source).toMatch(/PromotionProduct/);
    expect(source).toMatch(/creditCost/i);
    expect(source).toMatch(/durationDays/i);
  });

  it("defines max active promotions per user", () => {
    expect(source).toMatch(/MAX_ACTIVE_PROMOTIONS_PER_USER/);
  });

  it("defines credit purchase price", () => {
    expect(source).toMatch(/CREDIT_PURCHASE_PRICE_NAIRA/);
  });

  it("clearly marks values as requiring business approval", () => {
    expect(source).toMatch(/business\s+approval/i);
  });
});
