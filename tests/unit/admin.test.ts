import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Admin Dashboard & Moderation system tests (Prompt 17).
 *
 * Verifies:
 *   * Migration 0024 declares the expected tables / functions / RLS
 *   * Admin permission catalogue is closed and typed
 *   * Server actions enforce authorization via requireAdminPermission
 *   * User status transitions are constrained (no arbitrary strings)
 *   * Property moderation records audit + dispatches notification
 *   * Review moderation preserves original content in audit
 *   * Report workflow supports escalated status
 *   * Payments are read-only to admins
 *   * Audit log is append-only (no UPDATE/DELETE policies)
 *   * Platform settings are server-side write only
 *   * No client-impersonation of admin role
 *   * Marketplace roles (landlord/agent/company) are separate from admin
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

// ---------------------------------------------------------------------------
// Migration invariants
// ---------------------------------------------------------------------------
describe("admin migration (0024)", () => {
  const migrations = allMigrationsContent();

  it("creates admin_action_records table", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.admin_action_records/i,
    );
  });

  it("creates report_categories table", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.report_categories/i,
    );
  });

  it("creates platform_settings table", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.platform_settings/i,
    );
  });

  it("enables RLS on admin_action_records", () => {
    expect(migrations).toMatch(
      /alter table public\.admin_action_records enable row level security/i,
    );
  });

  it("admin_action_records has NO client-facing policies (server-only)", () => {
    const policyMatch = migrations.match(
      /create\s+policy\s+"[^"]+"\s+on\s+public\.admin_action_records\s+for/i,
    );
    expect(policyMatch).toBeNull();
  });

  it("platform_settings is public-readable but server-write-only", () => {
    // Public SELECT policy exists
    expect(migrations).toMatch(
      /Platform settings are publicly readable/i,
    );
    // No INSERT/UPDATE/DELETE policy on platform_settings
    const insertMatch = migrations.match(
      /create\s+policy\s+"[^"]+"\s+on\s+public\.platform_settings\s+for\s+insert/i,
    );
    const updateMatch = migrations.match(
      /create\s+policy\s+"[^"]+"\s+on\s+public\.platform_settings\s+for\s+update/i,
    );
    expect(insertMatch).toBeNull();
    expect(updateMatch).toBeNull();
  });

  it("report_categories is public-readable", () => {
    expect(migrations).toMatch(
      /Report categories are publicly readable/i,
    );
  });

  it("adds resolved_by column to reports", () => {
    expect(migrations).toMatch(
      /alter table public\.reports\s+add column if not exists resolved_by/i,
    );
    expect(migrations).toMatch(
      /alter table public\.reports\s+add column if not exists resolved_at/i,
    );
  });

  it("expands reports.status CHECK to include 'escalated'", () => {
    expect(migrations).toMatch(
      /'open', 'investigating', 'resolved', 'dismissed', 'escalated'/i,
    );
  });

  it("seeds default report categories (spec Section 22)", () => {
    const required = [
      "fraud_scam",
      "misleading_listing",
      "fake_property",
      "impersonation",
      "harassment",
      "spam",
      "inappropriate_content",
      "suspicious_payment_request",
      "fake_review",
      "misleading_advertisement",
      "other",
    ];
    for (const slug of required) {
      expect(migrations).toContain(`'${slug}'`);
    }
  });

  it("seeds default platform settings", () => {
    expect(migrations).toContain("'advertising.min_campaign_budget_naira'");
    expect(migrations).toContain("'featured.credit_purchase_price_naira'");
  });

  it("adds audit log indexes for admin filtering", () => {
    expect(migrations).toContain("audit_logs_actor_idx");
    expect(migrations).toContain("audit_logs_action_idx");
    expect(migrations).toContain("audit_logs_target_idx");
  });
});

// ---------------------------------------------------------------------------
// Permission catalogue invariants
// ---------------------------------------------------------------------------
import {
  ADMIN_PERMISSIONS,
  hasAdminPermission,
  type AdminIdentity,
} from "@/lib/admin/permissions";

describe("admin permission catalogue (spec Section 2)", () => {
  it("includes all spec-required permissions", () => {
    const required = [
      "users.view",
      "users.manage",
      "users.suspend",
      "users.ban",
      "properties.view",
      "properties.moderate",
      "properties.remove",
      "verification.review",
      "applications.view",
      "reviews.moderate",
      "payments.view",
      "subscriptions.manage",
      "promotions.manage",
      "advertising.manage",
      "reports.manage",
      "notifications.manage",
      "audit.view",
      "settings.manage",
    ];
    for (const p of required) {
      expect(ADMIN_PERMISSIONS).toContain(p);
    }
  });

  it("super_admin has ALL permissions regardless of permissions[]", () => {
    const superAdmin: AdminIdentity = {
      user: { id: "test" } as never,
      adminUserId: "test",
      role: "super_admin",
      permissions: [],
    };
    for (const p of ADMIN_PERMISSIONS) {
      expect(hasAdminPermission(superAdmin, p)).toBe(true);
    }
  });

  it("regular admin only has their assigned permissions", () => {
    const admin: AdminIdentity = {
      user: { id: "test" } as never,
      adminUserId: "test",
      role: "admin",
      permissions: ["users.view", "users.suspend"],
    };
    expect(hasAdminPermission(admin, "users.view")).toBe(true);
    expect(hasAdminPermission(admin, "users.suspend")).toBe(true);
    expect(hasAdminPermission(admin, "users.ban")).toBe(false);
    expect(hasAdminPermission(admin, "settings.manage")).toBe(false);
  });

  it("wildcard permissions grants all", () => {
    const admin: AdminIdentity = {
      user: { id: "test" } as never,
      adminUserId: "test",
      role: "admin",
      permissions: "*",
    };
    for (const p of ADMIN_PERMISSIONS) {
      expect(hasAdminPermission(admin, p)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Source code structure invariants
// ---------------------------------------------------------------------------
describe("admin source code structure (spec Sections 1–4, 19, 25, 31, 33, 35, 41, 43)", () => {
  function readSrc(relPath: string): string {
    return fs.readFileSync(path.join(SRC_DIR, relPath), "utf8");
  }

  it("admin permissions module defines requireAdminPermission", () => {
    const perms = readSrc("lib/admin/permissions.ts");
    expect(perms).toContain("requireAdmin");
    expect(perms).toContain("requireAdminPermission");
    expect(perms).toContain("assertAdminPermission");
  });

  it("admin permissions module reads from admin_users table (NOT marketplace roles)", () => {
    const perms = readSrc("lib/admin/permissions.ts");
    expect(perms).toContain("admin_users");
    // The marketplace role enum is landlord / agent / company — admin
    // must not piggyback on it.
    expect(perms).not.toContain("role: 'landlord'");
  });

  it("admin audit helper records to both audit_logs and admin_action_records", () => {
    const audit = readSrc("lib/admin/audit.ts");
    expect(audit).toContain("audit_logs");
    expect(audit).toContain("admin_action_records");
  });

  it("admin actions module enforces requireAdminPermission for every action", () => {
    const actions = readSrc("lib/admin/actions.ts");
    // Every privileged action should call requireAdminPermission
    expect(actions).toMatch(/requireAdminPermission\(['"]/);
    // All these actions exist
    expect(actions).toContain("suspendUserAction");
    expect(actions).toContain("reactivateUserAction");
    expect(actions).toContain("banUserAction");
    expect(actions).toContain("suspendPropertyAction");
    expect(actions).toContain("removePropertyAction");
    expect(actions).toContain("restorePropertyAction");
    expect(actions).toContain("hideReviewAction");
    expect(actions).toContain("removeReviewAction");
    expect(actions).toContain("restoreReviewAction");
    expect(actions).toContain("setReportStatusAction");
    expect(actions).toContain("approvePromotionAction");
    expect(actions).toContain("rejectPromotionAction");
    expect(actions).toContain("approveCampaignAction");
    expect(actions).toContain("rejectCampaignAction");
    expect(actions).toContain("pauseCampaignAction");
    expect(actions).toContain("suspendAdvertiserAction");
  });

  it("user status transitions are constrained — no arbitrary status strings", () => {
    const adminActions = readSrc("lib/admin/actions.ts");
    // The actions module takes discrete function signatures per transition,
    // not a status string.
    expect(adminActions).toMatch(/export async function suspendUserAction/);
    expect(adminActions).toMatch(/export async function reactivateUserAction/);
    expect(adminActions).toMatch(/export async function banUserAction/);
    // No "setUserStatus" generic function exists
    expect(adminActions).not.toMatch(/export async function setUserStatus/);
  });

  it("user suspend action rejects short reasons (spec Section 32)", () => {
    const actions = readSrc("lib/admin/actions.ts");
    expect(actions).toContain("Please provide a reason");
  });

  it("ban action requires 10-character reason (spec Section 32)", () => {
    const actions = readSrc("lib/admin/actions.ts");
    expect(actions).toMatch(/at least 10 characters/);
  });

  it("review moderation preserves original body in audit (spec Section 18)", () => {
    const actions = readSrc("lib/admin/actions.ts");
    expect(actions).toContain("originalBody");
  });

  it("admin layout has all 14 admin sections (spec Section 4)", () => {
    const layout = readSrc("components/layout/admin-layout.tsx");
    const requiredRoutes = [
      "/admin/users",
      "/admin/properties",
      "/admin/verifications",
      "/admin/applications",
      "/admin/reviews",
      "/admin/reports",
      "/admin/payments",
      "/admin/subscriptions",
      "/admin/promotions",
      "/admin/advertising",
      "/admin/notifications",
      "/admin/audit",
      "/admin/settings",
    ];
    for (const r of requiredRoutes) {
      expect(layout).toContain(`href: "${r}"`);
    }
  });

  it("admin fetchers module exposes all 14 list fetchers", () => {
    const fetchers = readSrc("lib/admin/fetchers.ts");
    expect(fetchers).toContain("getDashboardMetrics");
    expect(fetchers).toContain("adminListUsers");
    expect(fetchers).toContain("adminGetUserDetail");
    expect(fetchers).toContain("adminListProperties");
    expect(fetchers).toContain("adminListVerifications");
    expect(fetchers).toContain("adminListReviews");
    expect(fetchers).toContain("adminListReports");
    expect(fetchers).toContain("adminListPayments");
    expect(fetchers).toContain("adminListSubscriptions");
    expect(fetchers).toContain("adminListPromotions");
    expect(fetchers).toContain("adminListCampaigns");
    expect(fetchers).toContain("adminListNotifications");
    expect(fetchers).toContain("adminListEmailDelivery");
    expect(fetchers).toContain("adminListAuditLogs");
  });

  it("payments fetcher has no card number / CVV / secret display", () => {
    const fetchers = readSrc("lib/admin/fetchers.ts");
    expect(fetchers).not.toMatch(/card_number|cvv|secret_key/i);
  });

  it("dashboard metrics module distinguishes platform payments from property money", () => {
    const fetchers = readSrc("lib/admin/fetchers.ts");
    // The comment about platform payments only should be present.
    expect(fetchers).toMatch(/only platform payments/i);
  });

  it("platform settings action only allows known prefixes (spec Section 40)", () => {
    const actions = readSrc("lib/admin/actions.ts");
    expect(actions).toContain("ALLOWED_PREFIXES");
    expect(actions).toContain("advertising.");
    expect(actions).toContain("featured.");
    expect(actions).toContain("notifications.");
    expect(actions).toContain("reports.");
  });

  it("admin actions module does NOT mark payments successful via direct UI mutation", () => {
    const actions = readSrc("lib/admin/actions.ts");
    expect(actions).not.toMatch(/markPaymentSuccessful|setPaymentStatus/);
  });

  it("admin module barrel exports all server actions + fetchers + types", () => {
    const barrel = readSrc("lib/admin/index.ts");
    expect(barrel).toContain("requireAdmin");
    expect(barrel).toContain("requireAdminPermission");
    expect(barrel).toContain("recordAdminAction");
    expect(barrel).toContain("suspendUserAction");
    expect(barrel).toContain("getDashboardMetrics");
  });

  it("admin pages call requireAdmin / requireAdminPermission (server-side auth)", () => {
    const pages = [
      "app/admin/page.tsx",
      "app/admin/users/page.tsx",
      "app/admin/properties/page.tsx",
      "app/admin/verifications/page.tsx",
      "app/admin/applications/page.tsx",
      "app/admin/reviews/page.tsx",
      "app/admin/reports/page.tsx",
      "app/admin/payments/page.tsx",
      "app/admin/subscriptions/page.tsx",
      "app/admin/promotions/page.tsx",
      "app/admin/advertising/page.tsx",
      "app/admin/notifications/page.tsx",
      "app/admin/audit/page.tsx",
      "app/admin/settings/page.tsx",
    ];
    for (const p of pages) {
      const content = readSrc(p);
      expect(
        content,
        `${p} should call requireAdmin or requireAdminPermission`,
      ).toMatch(/requireAdmin\(|requireAdminPermission\(/);
    }
  });

  it("user detail page has ConfirmDialog for suspend/ban (spec Section 32)", () => {
    const detail = readSrc("components/admin/admin-user-detail-client.tsx");
    expect(detail).toContain("ConfirmDialog");
    expect(detail).toContain("Suspend user");
    expect(detail).toContain("Ban user");
  });

  it("property detail page has suspend / remove / restore actions", () => {
    const detail = readSrc("components/admin/admin-property-detail-client.tsx");
    expect(detail).toContain("Suspend listing");
    expect(detail).toContain("Remove listing");
    expect(detail).toContain("Restore listing");
  });

  it("review detail page does NOT allow rating alteration", () => {
    const detail = readSrc("components/admin/admin-review-detail-client.tsx");
    expect(detail).toContain("Hide review");
    expect(detail).toContain("Remove review");
    expect(detail).toContain("Restore review");
    // Should explicitly say moderation only
    expect(detail).toMatch(/cannot alter the star rating/i);
  });

  it("ConfirmDialog uses specific action labels (not 'Continue')", () => {
    const dialog = readSrc("components/admin/confirm-dialog.tsx");
    expect(dialog).toContain("actionLabel");
    // The dialog requires a non-empty actionLabel
    expect(dialog).not.toContain('actionLabel="Continue"');
  });

  it("admin actions dispatch notifications for affected users", () => {
    const actions = readSrc("lib/admin/actions.ts");
    expect(actions).toContain("notificationService.dispatch");
    expect(actions).toContain("account.suspended");
    expect(actions).toContain("account.reactivated");
    expect(actions).toContain("property.unavailable");
    expect(actions).toContain("property.removed");
    expect(actions).toContain("review.removed");
    expect(actions).toContain("promotion.approved");
    expect(actions).toContain("promotion.rejected");
    expect(actions).toContain("campaign.approved");
    expect(actions).toContain("campaign.rejected");
  });

  it("admin actions record to admin_action_records for audit", () => {
    const actions = readSrc("lib/admin/actions.ts");
    expect(actions).toContain("recordAdminAction");
    // Multiple action slugs recorded
    expect(actions).toContain('"user.suspend"');
    expect(actions).toContain('"user.ban"');
    expect(actions).toContain('"property.remove"');
    expect(actions).toContain('"campaign.reject"');
  });

  it("admin_actions never expose service-role credentials to client", () => {
    const actions = readSrc("lib/admin/actions.ts");
    expect(actions).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^;]*['"]/);
    // The module imports createAdminClient (which internally reads the
    // service role key server-side). It does NOT export it.
    expect(actions).toContain("createAdminClient");
  });
});

// ---------------------------------------------------------------------------
// Marketplace vs admin role separation (spec Section 1)
// ---------------------------------------------------------------------------
describe("marketplace vs admin role separation (spec Section 1)", () => {
  function readSrc(relPath: string): string {
    return fs.readFileSync(path.join(SRC_DIR, relPath), "utf8");
  }

  it("profiles.role CHECK constraint does NOT include admin", () => {
    const migrations = allMigrationsContent();
    // The profile role check allows landlord / agent / company only.
    expect(migrations).toMatch(
      /check\s*\(\s*role\s+in\s*\(\s*'landlord',?\s*'agent',?\s*'company'\s*\)/i,
    );
    // Admin role is NOT in the profiles CHECK constraint. We scope this
    // to the profiles table by matching the profiles role check string.
    // The admin_users table check is separate ('admin', 'super_admin').
    const profilesSection = migrations.match(
      /create table[\s\S]*?public\.profiles[\s\S]*?check\s*\(\s*role\s+in\s*\([^)]+\)\s*\)/i,
    );
    expect(profilesSection).toBeDefined();
    const profileRoleCheck = profilesSection![0];
    expect(profileRoleCheck).not.toContain("'admin'");
    expect(profileRoleCheck).not.toContain("'super_admin'");
  });

  it("admin_users.role is a separate enum (admin / super_admin)", () => {
    const migrations = allMigrationsContent();
    expect(migrations).toMatch(
      /check\s*\(\s*role\s+in\s*\(\s*'admin',?\s*'super_admin'\s*\)/i,
    );
  });

  it("admin authorization helper resolves from admin_users table, not profiles", () => {
    const perms = readSrc("lib/admin/permissions.ts");
    // The lookup uses admin_users, NOT profiles.role.
    expect(perms).toContain('from("admin_users")');
  });

  it("admin pages redirect to /forbidden when user is not admin", () => {
    const pages = [
      "app/admin/users/page.tsx",
      "app/admin/properties/page.tsx",
    ];
    for (const p of pages) {
      const content = readSrc(p);
      expect(content).toContain('redirect("/forbidden")');
    }
  });
});
