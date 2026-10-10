import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { capabilitiesFor } from "@/lib/capabilities";

/**
 * Capability + privileged-field protection tests.
 *
 * Per spec Sections 23, 29, 31, 32, 33:
 *   * Social media handles are Premium-only (Section 23)
 *   * Users cannot modify role, verification_state, subscription_tier,
 *     account_status, audit records (Section 32)
 *   * Verification is NOT auto-granted on payment (Section 7)
 *   * Capability system is centralised (Section 31)
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");

function allMigrationsContent(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n\n");
}

describe("social media handles are Premium-only (spec Section 23)", () => {
  it("Free plan users cannot show social handles", () => {
    for (const role of ["landlord", "agent", "company", "tenant"] as const) {
      const caps = capabilitiesFor(role, "free");
      expect(caps.canShowSocialMediaHandles).toBe(false);
    }
  });

  it("Pro plan users cannot show social handles (per Phase 5 spec update)", () => {
    for (const role of ["landlord", "agent", "company", "tenant"] as const) {
      const caps = capabilitiesFor(role, "pro");
      expect(caps.canShowSocialMediaHandles).toBe(false);
    }
  });

  it("Premium plan users CAN show social handles (except tenants — no social handles)", () => {
    for (const role of ["landlord", "agent", "company"] as const) {
      const caps = capabilitiesFor(role, "premium");
      expect(caps.canShowSocialMediaHandles).toBe(true);
    }
    // Tenants never get social media handles (they're property seekers, not listers)
    expect(capabilitiesFor("tenant", "premium").canShowSocialMediaHandles).toBe(false);
  });
});

describe("verification is NOT auto-granted on payment (spec Section 7)", () => {
  it("Pro plans grant BRONZE ELIGIBILITY only (landlord/agent/company; tenants are not eligible)", () => {
    for (const role of ["landlord", "agent", "company"] as const) {
      const caps = capabilitiesFor(role, "pro");
      expect(caps.eligibleForBronze).toBe(true);
      expect(caps.eligibleForBlue).toBe(false);
    }
    // Tenants are NOT eligible for verification (they don't list properties)
    expect(capabilitiesFor("tenant", "pro").eligibleForBronze).toBe(false);
    expect(capabilitiesFor("tenant", "pro").eligibleForBlue).toBe(false);
  });

  it("Premium plans grant BLUE ELIGIBILITY only (landlord/agent/company; tenants not eligible)", () => {
    for (const role of ["landlord", "agent", "company"] as const) {
      const caps = capabilitiesFor(role, "premium");
      expect(caps.eligibleForBronze).toBe(true);
      expect(caps.eligibleForBlue).toBe(true);
    }
    // Tenants are NOT eligible for verification
    expect(capabilitiesFor("tenant", "premium").eligibleForBronze).toBe(false);
    expect(capabilitiesFor("tenant", "premium").eligibleForBlue).toBe(false);
  });

  it("no capability auto-grants verification_state", () => {
    // The Capabilities interface does NOT have a "verificationState" field.
    // Verification is always admin-controlled.
    for (const role of ["landlord", "agent", "company", "tenant"] as const) {
      for (const tier of ["free", "pro", "premium"] as const) {
        const caps = capabilitiesFor(role, tier);
        // No field that grants verification_state directly
        expect("verificationState" in caps).toBe(false);
        expect("verificationStatus" in caps).toBe(false);
      }
    }
  });
});

describe("verification_state cannot be modified by users (spec Section 32)", () => {
  const content = allMigrationsContent();

  it("profiles UPDATE policy does NOT allow changing verification_state", () => {
    // The RLS UPDATE policy on profiles only allows updates where
    // role and subscription_tier remain unchanged. verification_state
    // is not in the policy — meaning users CANNOT update it via the
    // authenticated role. Only the service role can.
    //
    // We verify by checking that the policy text does NOT contain
    // a verification_state change clause.
    const updatePolicyMatch = content.match(
      /create\s+policy\s+"Users\s+can\s+update\s+their\s+own\s+profile[^"]*"\s+on\s+public\.profiles\s+for\s+update[\s\S]*?(?=\n\s*create\s+policy|\n\s*--\s*----)/i,
    );
    expect(updatePolicyMatch).toBeDefined();
    const policyText = updatePolicyMatch![0];
    // The policy's WITH CHECK clause must NOT mention verification_state
    expect(policyText).not.toMatch(/verification_state\s*=/i);
  });

  it("profiles UPDATE policy does NOT allow changing account_status", () => {
    // Similar — the WITH CHECK clause must not mention account_status.
    // Account status changes only happen via:
    //   - onboarding finalizer (sets 'active' — allowed by RLS)
    //   - admin actions via service role (bypasses RLS)
    const updatePolicyMatch = content.match(
      /create\s+policy\s+"Users\s+can\s+update\s+their\s+own\s+profile[^"]*"\s+on\s+public\.profiles\s+for\s+update[\s\S]*?(?=\n\s*create\s+policy|\n\s*--\s*----)/i,
    );
    expect(updatePolicyMatch).toBeDefined();
    const policyText = updatePolicyMatch![0];
    // The policy MUST NOT have a clause that allows account_status changes
    // (i.e. no `account_status = new_account_status` or similar)
    expect(policyText).not.toMatch(/account_status\s*=\s*[^,)\s]+/i);
  });

  it("verification_reviews has no authenticated INSERT policy", () => {
    // Reviews (admin approval decisions) must only be writable by admins
    // via the service role.
    const reviewsSection = content.match(
      /create\s+table[\s\S]*?verification_reviews[\s\S]*?(?=\n--\s*---)/i,
    );
    expect(reviewsSection).toBeDefined();
    expect(reviewsSection?.[0]).toMatch(/enable\s+row\s+level\s+security/i);
    // Should NOT have any policy that allows authenticated users to INSERT
    expect(reviewsSection?.[0]).not.toMatch(
      /to\s+authenticated\s+for\s+insert/i,
    );
  });

  it("verification_history is append-only with no user UPDATE policy", () => {
    const historySection = content.match(
      /create\s+table[\s\S]*?verification_history[\s\S]*?(?=\n--\s*---)/i,
    );
    expect(historySection).toBeDefined();
    expect(historySection?.[0]).toMatch(/enable\s+row\s+level\s+security/i);
    // Should NOT have UPDATE or DELETE policies for authenticated
    expect(historySection?.[0]).not.toMatch(
      /to\s+(anon|authenticated)\s+for\s+(update|delete)/i,
    );
  });

  it("audit_logs has no UPDATE or DELETE policy for users", () => {
    const auditSection = content.match(
      /create\s+table[\s\S]*?audit_logs[\s\S]*?(?=\n--\s*---)/i,
    );
    expect(auditSection).toBeDefined();
    expect(auditSection?.[0]).toMatch(/enable\s+row\s+level\s+security/i);
    expect(auditSection?.[0]).not.toMatch(
      /to\s+(anon|authenticated)\s+for\s+(update|delete)/i,
    );
  });

  it("verification_documents can only be written by applicant + admin", () => {
    // The INSERT policy must check that the application_id belongs to the
    // calling user. Search the full content for the policy.
    expect(content).toMatch(
      /Applicants\s+can\s+upload\s+their\s+own\s+verification\s+documents/i,
    );
    // The insert policy must verify applicant ownership via subquery
    expect(content).toMatch(
      /Applicants\s+can\s+upload\s+their\s+own\s+verification\s+documents[\s\S]*?verification_applications\s+va[\s\S]*?join\s+public\.profiles\s+p\s+on\s+p\.id\s*=\s*va\.applicant_id[\s\S]*?p\.user_id\s*=\s*auth\.uid\(\)/i,
    );
  });
});

describe("admin authorisation is separate from marketplace role (spec Section 33)", () => {
  it("admin_users table is separate from profiles", () => {
    const content = allMigrationsContent();
    expect(content).toMatch(/create\s+table[\s\S]*?admin_users/i);
    expect(content).toMatch(
      /check\s*\(\s*role\s+in\s*\(\s*'landlord',?\s*'agent',?\s*'company'\s*\)/i,
    );
    // admin_users.role is a separate enum
    expect(content).toMatch(
      /check\s*\(\s*role\s+in\s*\(\s*'admin',?\s*'super_admin'\s*\)\)/i,
    );
  });

  it("admin_users has no INSERT/UPDATE policy for authenticated users", () => {
    const content = allMigrationsContent();
    const adminSection = content.match(
      /create\s+table[\s\S]*?admin_users[\s\S]*?(?=\n--\s*---)/i,
    );
    expect(adminSection).toBeDefined();
    // Only SELECT should be allowed for authenticated users (and only
    // because the policy checks that the calling user IS already an admin).
    expect(adminSection?.[0]).not.toMatch(
      /to\s+authenticated\s+for\s+(insert|update|delete)/i,
    );
  });
});
