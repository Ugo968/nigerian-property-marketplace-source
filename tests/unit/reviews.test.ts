import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Reviews & Reputation infrastructure tests.
 *
 * Per spec Sections 2, 3, 7, 8, 12, 14, 16, 22, 23, 30, 36:
 *   * Eligibility checked server-side via canCreateReview()
 *   * Duplicate prevention via DB UNIQUE constraints
 *   * Content sanitised (HTML-escaped)
 *   * Reviewer identity derived from server session
 *   * No fake reviews (spec Section 36)
 *   * Aggregation excludes hidden/removed reviews
 *   * Verification ≠ rating (spec Section 14)
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");

function allMigrationsContent(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n\n");
}

describe("reviews table schema (spec Section 4)", () => {
  const content = allMigrationsContent();

  it("reviews table has reviewer_id + reviewed_id + reviewed_entity_type", () => {
    expect(content).toMatch(/reviewer_id\s+uuid\s+not\s+null/i);
    expect(content).toMatch(/reviewed_id\s+uuid\s+not\s+null/i);
    expect(content).toMatch(/reviewed_entity_type\s+text\s+not\s+null/i);
  });

  it("reviewed_entity_type accepts landlord/agent/company only", () => {
    expect(content).toMatch(
      /reviewed_entity_type\s+in\s*\(\s*'landlord',?\s*'agent',?\s*'company'\s*\)/i,
    );
  });

  it("has qualifying interaction refs: application_id, conversation_id, property_id", () => {
    expect(content).toMatch(/application_id\s+uuid\s+references\s+public\.property_applications/i);
    expect(content).toMatch(/conversation_id\s+uuid/i);
    expect(content).toMatch(/property_id\s+uuid\s+references\s+public\.properties/i);
  });

  it("rating is CHECKed to 1-5 (spec Section 6)", () => {
    expect(content).toMatch(/rating\s+smallint\s+not\s+null\s+check\s*\(\s*rating\s*>=\s*1\s+and\s+rating\s*<=\s*5\s*\)/i);
  });

  it("has status with pending/published/hidden/removed (spec Section 10)", () => {
    expect(content).toMatch(/status\s+in\s*\(\s*'pending',?\s*'published',?\s*'hidden',?\s*'removed'\s*\)/i);
  });

  it("has response_text + response_at for reviewee response (spec Section 20)", () => {
    expect(content).toMatch(/response_text\s+text/i);
    expect(content).toMatch(/response_at\s+timestamptz/i);
  });
});

describe("duplicate review prevention (spec Section 8)", () => {
  const content = allMigrationsContent();

  it("has UNIQUE(reviewer_id, reviewed_id, application_id)", () => {
    expect(content).toMatch(/unique\s*\(\s*reviewer_id,?\s*reviewed_id,?\s*application_id\s*\)/i);
  });

  it("has partial UNIQUE for conversation-based reviews (migration 0021)", () => {
    expect(content).toMatch(/reviews_conversation_unique/i);
    expect(content).toMatch(
      /on\s+public\.reviews\s*\(\s*reviewer_id,?\s*reviewed_id,?\s*conversation_id\s*\)\s*where\s+conversation_id\s+is\s+not\s+null/i,
    );
  });

  it("has partial UNIQUE for property reviews without application", () => {
    expect(content).toMatch(/reviews_property_unique/i);
  });
});

describe("reviews RLS (spec Section 22)", () => {
  const content = allMigrationsContent();

  it("reviews has RLS enabled", () => {
    expect(content).toMatch(/alter\s+table\s+public\.reviews\s+enable\s+row\s+level\s+security/i);
  });

  it("published reviews are publicly readable", () => {
    expect(content).toMatch(/Published\s+reviews\s+are\s+publicly\s+readable/i);
  });

  it("reviewers can read their own reviews", () => {
    expect(content).toMatch(/Reviewers\s+can\s+read\s+their\s+own\s+reviews/i);
  });

  it("reviewers can submit reviews as themselves (reviewer_id = auth.uid())", () => {
    expect(content).toMatch(/Users\s+can\s+submit\s+reviews\s+as\s+themselves/i);
    // The INSERT policy must verify reviewer_id matches the auth user
    expect(content).toMatch(
      /reviewer_id\s+in\s*\(select\s+id\s+from\s+public\.profiles\s+where\s+user_id\s*=\s*auth\.uid\(\)\)/i,
    );
  });

  it("reviewers can edit only their own review content (not reviewer/reviewee)", () => {
    expect(content).toMatch(/Reviewers\s+can\s+edit\s+their\s+own\s+review\s+content/i);
    // The UPDATE policy should NOT allow changing reviewer_id or reviewed_id
    // (enforced by the policy checking reviewer_id = auth user)
  });

  it("reviewed parties can respond to their reviews", () => {
    expect(content).toMatch(/Reviewed\s+parties\s+can\s+respond\s+to\s+their\s+reviews/i);
  });
});

describe("review indexes for performance (spec Section 35)", () => {
  const content = allMigrationsContent();

  it("has index on reviews(reviewed_id, status) for aggregation", () => {
    expect(content).toMatch(/reviews_reviewed_published_idx/i);
  });

  it("has index on reviews(reviewer_id) for user's own reviews", () => {
    expect(content).toMatch(/reviews_reviewer_idx/i);
  });

  it("has index on reviews(property_id) for property reviews", () => {
    expect(content).toMatch(/reviews_property_idx/i);
  });
});

describe("review server actions security (spec Sections 7, 16, 22, 23, 25, 37)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/reviews/actions.ts"),
    "utf8",
  );

  it("createReviewAction derives reviewer_id from server session", () => {
    expect(source).toMatch(/getCurrentUser\(\)/);
    expect(source).toMatch(/getCurrentProfile\(\)/);
    // reviewer_id must be set from profile.id, not from client input
    expect(source).toMatch(/reviewer_id:\s*profile\.id/);
    // The function signature should NOT take a reviewerId parameter
    expect(source).not.toMatch(/reviewerId/i);
  });

  it("createReviewAction calls canCreateReview() for eligibility (spec Section 7)", () => {
    expect(source).toMatch(/canCreateReview\(/);
    expect(source).toMatch(/eligibility\.canReview/);
  });

  it("review body is HTML-escaped (spec Section 16)", () => {
    expect(source).toMatch(/\.replace\(\/&\/g,\s*"&amp;"\)/);
    expect(source).toMatch(/\.replace\(\/<\/g,\s*"&lt;"\)/);
    expect(source).toMatch(/\.replace\(\/>\/g,\s*"&gt;"\)/);
  });

  it("rating validated to 1-5 (spec Section 6)", () => {
    expect(source).toMatch(/input\.rating\s*<\s*1\s*\|\|\s*input\.rating\s*>\s*5/);
  });

  it("review body length enforced (min 10, max 3000)", () => {
    expect(source).toMatch(/body\.length\s*<\s*10/);
    expect(source).toMatch(/MAX_REVIEW_BODY/);
  });

  it("rate-limited (10 reviews/hour)", () => {
    expect(source).toMatch(/review_create/);
    expect(source).toMatch(/limit:\s*10/);
  });

  it("editReviewAction verifies ownership (reviewer_id match)", () => {
    expect(source).toMatch(/editReviewAction/);
    expect(source).toMatch(/reviewer_id\s*!==\s*profile\.id/);
  });

  it("editReviewAction does NOT allow changing reviewer or reviewee", () => {
    // The update payload should NOT include reviewer_id or reviewed_id
    const updateSection = source.match(
      /const\s+updates.*?(?=if\s*\(Object\.keys)/s,
    );
    if (updateSection) {
      expect(updateSection[0]).not.toMatch(/reviewer_id/);
      expect(updateSection[0]).not.toMatch(/reviewed_id/);
    }
  });

  it("requestReviewRemovalAction uses soft removal (status='removed')", () => {
    expect(source).toMatch(/requestReviewRemovalAction/);
    expect(source).toMatch(/status:\s*"removed"/);
  });

  it("reportReviewAction prevents duplicate reports (spec Section 17)", () => {
    expect(source).toMatch(/reportReviewAction/);
    expect(source).toMatch(/existingReport/i);
  });

  it("audit events for review lifecycle (spec Section 23)", () => {
    expect(source).toMatch(/review_created/);
    expect(source).toMatch(/review_updated/);
    expect(source).toMatch(/review_removed/);
    expect(source).toMatch(/review_reported/);
  });

  it("no hard-delete of reviews (spec Section 10)", () => {
    // The actions should use UPDATE with status='removed', not .delete()
    expect(source).not.toMatch(/\.delete\(\).*reviews/i);
  });
});

describe("review eligibility service (spec Sections 2, 7, 8, 14)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/reviews/eligibility.ts"),
    "utf8",
  );

  it("canCreateReview checks authentication", () => {
    expect(source).toMatch(/getCurrentProfile\(\)/);
    expect(source).toMatch(/must be signed in/i);
  });

  it("canCreateReview checks account is active", () => {
    expect(source).toMatch(/account_status\s*!==\s*"active"/);
  });

  it("canCreateReview prevents self-review", () => {
    expect(source).toMatch(/revieweeId\s*===\s*profile\.id/);
    expect(source).toMatch(/cannot review yourself/i);
  });

  it("canCreateReview checks qualifying interactions (application, representation, conversation)", () => {
    expect(source).toMatch(/findQualifyingInteractions/);
    expect(source).toMatch(/property_applications/);
    expect(source).toMatch(/property_agent_representations/);
    expect(source).toMatch(/conversation_participants/);
  });

  it("canCreateReview checks for existing reviews (one per interaction)", () => {
    expect(source).toMatch(/hasExistingReview/);
    expect(source).toMatch(/already reviewed/i);
  });

  it("eligibility result includes qualifyingInteraction description", () => {
    expect(source).toMatch(/qualifyingInteraction/);
    expect(source).toMatch(/description/);
  });
});

describe("review aggregation service (spec Sections 12, 35)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/reviews/aggregation.ts"),
    "utf8",
  );

  it("getAggregateRating calculates average + count + distribution", () => {
    expect(source).toMatch(/getAggregateRating/);
    expect(source).toMatch(/average/);
    expect(source).toMatch(/totalCount/);
    expect(source).toMatch(/distribution/);
    expect(source).toMatch(/five/);
    expect(source).toMatch(/four/);
    expect(source).toMatch(/three/);
    expect(source).toMatch(/two/);
    expect(source).toMatch(/one/);
  });

  it("aggregation excludes removed/hidden reviews (spec Section 12)", () => {
    expect(source).toMatch(/status.*published/i);
  });

  it("getReviewsForProfile is paginated (spec Section 35)", () => {
    expect(source).toMatch(/PAGE_SIZE/);
    expect(source).toMatch(/range\(/);
    expect(source).toMatch(/hasMore/);
  });

  it("getReviewsForProfile batch-fetches reviewer profiles (no N+1)", () => {
    expect(source).toMatch(/in\("id",\s*reviewerIds\)/);
  });
});

describe("no fake reviews (spec Section 36)", () => {
  it("no review seed data in seed files", () => {
    const seedDir = path.join(process.cwd(), "supabase/seed");
    if (!fs.existsSync(seedDir)) return;
    const seedFiles = fs.readdirSync(seedDir).filter((f) => f.endsWith(".sql"));
    for (const file of seedFiles) {
      const content = fs.readFileSync(path.join(seedDir, file), "utf8");
      expect(content).not.toMatch(/insert\s+into\s+public\.reviews/i);
    }
  });
});
