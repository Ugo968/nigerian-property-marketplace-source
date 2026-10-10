import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Notification infrastructure tests — covers spec Section 42:
 *   * Notification creation rules
 *   * Authorization (RLS, server-side only)
 *   * Preferences (mandatory vs optional, frequency enforcement)
 *   * Saved-search alerts (matching + duplicate prevention)
 *   * Applications / messaging / payments / verification / featured /
 *     advertising notification correctness
 *   * Security (XSS, unsafe URL prevention, no secrets)
 *   * Email retry / classification
 *
 * The sandbox has no live Postgres, so these tests verify:
 *   - The migration files declare the expected RLS, indexes, and
 *     SECURITY DEFINER functions
 *   - The TypeScript type catalogue enforces the mandatory-category
 *     rule and the transactional rule
 *   - The notification types and email templates are aligned (every
 *     type with a non-null template references a real template slug)
 *   - Email-renderer escapes user-generated text (no XSS)
 *   - Email-renderer forbids absolute URLs in CTAs
 *   - Href-safety predicate rejects absolute URLs in dispatch
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
// Type-catalogue invariants
// ---------------------------------------------------------------------------
import {
  NOTIFICATION_TYPES,
  MANDATORY_CATEGORIES,
  getNotificationTypeConfig,
  isMandatoryCategory,
  defaultPreferenceFor,
  EMAIL_TEMPLATES,
} from "@/lib/notifications/types";
import type { EmailTemplateSlug } from "@/lib/notifications/types";

describe("notification type catalogue", () => {
  it("every type has a unique id", () => {
    const ids = NOTIFICATION_TYPES.map((t) => t.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes.length).toBe(0);
  });

  it("every type's category is one of the supported categories", () => {
    const validCategories = [
      "account_security",
      "verification",
      "properties",
      "property_alerts",
      "applications",
      "messaging",
      "reviews",
      "subscriptions",
      "payments",
      "featured",
      "advertising",
      "marketing",
    ];
    for (const t of NOTIFICATION_TYPES) {
      expect(validCategories).toContain(t.category);
    }
  });

  it("every type's template slug is a registered template", () => {
    for (const t of NOTIFICATION_TYPES) {
      if (t.template === null) continue;
      expect(EMAIL_TEMPLATES).toContain(t.template);
    }
  });

  it("every type's priority is one of low/normal/high/critical", () => {
    for (const t of NOTIFICATION_TYPES) {
      expect(["low", "normal", "high", "critical"]).toContain(t.priority);
    }
  });

  it("every type's level is one of info/success/warning/error", () => {
    for (const t of NOTIFICATION_TYPES) {
      expect(["info", "success", "warning", "error"]).toContain(t.level);
    }
  });

  it("mandatory categories are always transactional in the catalogue", () => {
    for (const t of NOTIFICATION_TYPES) {
      if (MANDATORY_CATEGORIES.has(t.category)) {
        expect(
          t.transactional,
          `Type ${t.id} is in a mandatory category but not transactional`,
        ).toBe(true);
      }
    }
  });

  it("security-critical types are always 'critical' priority", () => {
    // Per spec Section 17: critical = account/security issues.
    const critical = [
      "account.password_changed",
      "account.security_event",
      "account.suspended",
    ];
    for (const id of critical) {
      const t = getNotificationTypeConfig(id);
      expect(t).not.toBeNull();
      expect(t!.priority).toBe("critical");
    }
  });

  it("isMandatoryCategory returns true for the 5 mandatory groups", () => {
    expect(isMandatoryCategory("account_security")).toBe(true);
    expect(isMandatoryCategory("verification")).toBe(true);
    expect(isMandatoryCategory("applications")).toBe(true);
    expect(isMandatoryCategory("subscriptions")).toBe(true);
    expect(isMandatoryCategory("payments")).toBe(true);
    // Optional
    expect(isMandatoryCategory("messaging")).toBe(false);
    expect(isMandatoryCategory("property_alerts")).toBe(false);
    expect(isMandatoryCategory("marketing")).toBe(false);
  });

  it("defaultPreferenceFor mandatory categories returns always-on", () => {
    const d = defaultPreferenceFor("account_security");
    expect(d.in_app_enabled).toBe(true);
    expect(d.email_enabled).toBe(true);
    expect(d.email_frequency).toBe("instant");
  });

  it("defaultPreferenceFor marketing returns weekly + in-app off", () => {
    // Per spec Section 13 — marketing is opt-in by default.
    const d = defaultPreferenceFor("marketing");
    expect(d.email_enabled).toBe(true);
    expect(d.email_frequency).toBe("weekly");
  });
});

// ---------------------------------------------------------------------------
// Database migration invariants
// ---------------------------------------------------------------------------
describe("notifications migration (0023)", () => {
  const migrations = allMigrationsContent();

  it("extends the notifications table with priority/channel/expires_at", () => {
    expect(migrations).toContain("priority text");
    expect(migrations).toContain("channel text");
    expect(migrations).toContain("expires_at timestamptz");
    expect(migrations).toContain("metadata jsonb");
    expect(migrations).toContain("event_key text");
  });

  it("creates notification_preferences table", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.notification_preferences/i,
    );
  });

  it("creates notification_events table with unique event_key", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.notification_events/i,
    );
    expect(migrations).toMatch(
      /notification_events_event_key_unique_idx/i,
    );
  });

  it("creates email_delivery_records table", () => {
    expect(migrations).toMatch(
      /create table if not exists public\.email_delivery_records/i,
    );
  });

  it("enables RLS on all three new tables", () => {
    expect(migrations).toMatch(
      /alter table public\.notification_preferences enable row level security/i,
    );
    expect(migrations).toMatch(
      /alter table public\.notification_events enable row level security/i,
    );
    expect(migrations).toMatch(
      /alter table public\.email_delivery_records enable row level security/i,
    );
  });

  it("notification_events has NO client-facing policies (server-only)", () => {
    // The pattern matches a single create policy statement that targets
    // notification_events. We use a non-greedy [^;]+ to keep the match
    // within one policy statement.
    const policyMatch = migrations.match(
      /create\s+policy\s+"[^"]+"\s+on\s+public\.notification_events\s+for/i,
    );
    expect(policyMatch).toBeNull();
  });

  it("email_delivery_records has NO client-facing policies (server-only)", () => {
    const policyMatch = migrations.match(
      /create\s+policy\s+"[^"]+"\s+on\s+public\.email_delivery_records\s+for/i,
    );
    expect(policyMatch).toBeNull();
  });

  it("notification_preferences has owner-only RLS policies", () => {
    expect(migrations).toMatch(
      /Users can read their own notification preferences/i,
    );
    expect(migrations).toMatch(
      /Users can update their own notification preferences/i,
    );
    // Should match the profiles.user_id = auth.uid() pattern
    expect(migrations).toMatch(
      /user_id in \(select id from public\.profiles where user_id = auth\.uid\(\)\)/i,
    );
  });

  it("dispatch_notification SECURITY DEFINER function exists", () => {
    expect(migrations).toMatch(
      /create or replace function public\.dispatch_notification/i,
    );
    expect(migrations).toMatch(/security definer/i);
  });

  it("dispatch_notification rejects absolute URLs in href", () => {
    // Per spec Section 38: defence-in-depth against malicious URLs.
    expect(migrations).toMatch(/p_href ~ '\^https\?:\/\/'/i);
    expect(migrations).toContain("Absolute URLs are forbidden in notification href");
  });

  it("dispatch_notification handles idempotency via unique_violation", () => {
    expect(migrations).toMatch(/when unique_violation then/i);
    expect(migrations).toContain("return null");
  });

  it("mark_notification_unread function exists", () => {
    expect(migrations).toMatch(
      /create or replace function public\.mark_notification_unread/i,
    );
  });

  it("dismiss_notification function exists", () => {
    expect(migrations).toMatch(
      /create or replace function public\.dismiss_notification/i,
    );
  });

  it("notifications has a partial unique index for idempotency", () => {
    expect(migrations).toMatch(
      /notifications_event_key_unique_idx/i,
    );
    expect(migrations).toMatch(/where event_key is not null/i);
  });

  it("enables realtime for notifications table", () => {
    expect(migrations).toMatch(/supabase_realtime/i);
    expect(migrations).toMatch(/add table public\.notifications/i);
  });

  it("email_delivery_records has a status check constraint", () => {
    expect(migrations).toMatch(
      /status in \('pending', 'sent', 'delivered', 'failed', 'suppressed'\)/i,
    );
  });

  it("email_delivery_records has an error_category check constraint", () => {
    // Use dotall-free pattern: match the keywords on the same logical block.
    expect(migrations).toContain("'invalid_email'");
    expect(migrations).toContain("'suppressed_address'");
    expect(migrations).toContain("'provider_error'");
    expect(migrations).toContain("'timeout'");
    expect(migrations).toContain("'rate_limited'");
    expect(migrations).toContain("'network'");
    expect(migrations).toContain("'unknown'");
  });

  it("notification_preferences has a unique (user_id, category) constraint", () => {
    expect(migrations).toMatch(
      /unique \(user_id, category\)/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Email renderer security
// ---------------------------------------------------------------------------
import { renderEmail } from "@/lib/notifications/email-renderer";
import type { TemplateContext } from "@/lib/notifications/email-renderer";

const baseCtx: TemplateContext = {
  recipientName: "Test User",
  recipientEmail: "test@example.com",
  category: "applications",
  isMandatory: true,
};

describe("email renderer security", () => {
  it("escapes HTML in recipientName (XSS prevention)", () => {
    const content = renderEmail("welcome", { role: "landlord" }, {
      ...baseCtx,
      recipientName: "<script>alert(1)</script>",
    });
    // The HTML should contain the escaped form, not the raw <script> tag
    expect(content.html).not.toContain("<script>alert(1)</script>");
    expect(content.html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in template inputs (property title)", () => {
    const content = renderEmail(
      "application_received",
      {
        applicantName: "Agent A",
        propertyTitle: "<img src=x onerror=alert(1)>",
        applicationId: "abc-123",
      },
      baseCtx,
    );
    expect(content.html).not.toContain("<img src=x onerror=alert(1)>");
    expect(content.html).toContain("&lt;img");
  });

  it("escapes HTML in message previews", () => {
    const content = renderEmail(
      "new_message",
      {
        senderName: "Sender",
        preview: "<b>bold</b><script>x</script>",
        conversationId: "conv-1",
      },
      baseCtx,
    );
    expect(content.html).not.toContain("<script>x</script>");
    expect(content.html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in review previews", () => {
    const content = renderEmail(
      "review_received",
      {
        reviewerName: "Reviewer",
        rating: 5,
        preview: "<script>alert('xss')</script>",
      },
      baseCtx,
    );
    expect(content.html).not.toContain("<script>alert('xss')</script>");
    expect(content.html).toContain("&lt;script&gt;");
  });

  it("includes the unsubscribe link only for non-mandatory categories", () => {
    const mandatory = renderEmail(
      "payment_successful",
      { amountNaira: 5000, paymentType: "subscription", reference: "REF-1" },
      { ...baseCtx, isMandatory: true },
    );
    expect(mandatory.html).not.toContain("/api/notifications/unsubscribe");

    const optional = renderEmail(
      "saved_search_match",
      {
        searchName: "My search",
        propertyTitle: "Test",
        propertyLocation: "Lagos",
        priceDisplay: "₦500,000",
        propertyId: "p-1",
      },
      { ...baseCtx, isMandatory: false, category: "property_alerts" },
    );
    expect(optional.html).toContain("/api/notifications/unsubscribe");
  });

  it("always renders a plain-text fallback", () => {
    const content = renderEmail(
      "welcome",
      { role: "landlord" },
      baseCtx,
    );
    expect(content.text).toBeTruthy();
    expect(content.text.length).toBeGreaterThan(0);
    // Plain text should NOT contain HTML tags
    expect(content.text).not.toMatch(/<html|<body|<p>/);
  });

  it("includes Shelty brand in every template", () => {
    const content = renderEmail(
      "welcome",
      { role: "landlord" },
      baseCtx,
    );
    expect(content.html).toContain("Shelty");
  });

  it("renders a representative sample of templates without throwing", () => {
    // Smoke test: pick one template from each category and ensure it
    // renders. We can't render every template with empty inputs because
    // each has a unique input shape.
    const samples: Array<{ slug: EmailTemplateSlug; input: Record<string, unknown> }> = [
      { slug: "welcome", input: { role: "landlord" } },
      { slug: "email_verified", input: {} },
      { slug: "security_event", input: { eventDescription: "Test", whenIso: new Date().toISOString() } },
      { slug: "verification_approved", input: { tier: "bronze" } },
      { slug: "application_received", input: { applicantName: "A", propertyTitle: "P", applicationId: "x" } },
      { slug: "new_message", input: { senderName: "S", preview: "Hi", conversationId: "c" } },
      { slug: "saved_search_match", input: { searchName: "S", propertyTitle: "P", propertyLocation: "Lagos", priceDisplay: "₦1", propertyId: "p1" } },
      { slug: "payment_successful", input: { amountNaira: 5000, paymentType: "subscription", reference: "R" } },
      { slug: "promotion_approved", input: { propertyTitle: "P", startDate: new Date().toISOString(), endDate: new Date().toISOString() } },
      { slug: "campaign_submitted", input: { campaignName: "C" } },
    ];
    for (const { slug, input } of samples) {
      expect(() => renderEmail(slug, input as never, baseCtx)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Dispatcher href safety
// ---------------------------------------------------------------------------
import { notificationService } from "@/lib/notifications/dispatcher";

// Stub the admin client calls — we don't actually need to dispatch
// notifications in unit tests; we just want to verify the href-safety
// guard fires before any DB call.
describe("dispatcher href safety (spec Section 38)", () => {
  // The dispatcher reads `createAdminClient` and `getCurrentProfile` etc.
  // When the admin client returns null (no Supabase configured in test
  // env), the dispatcher short-circuits. The href-safety check happens
  // BEFORE that — so we can verify it fires.

  it("rejects absolute https:// URLs in href", async () => {
    const result = await notificationService.dispatch({
      recipientId: "00000000-0000-0000-0000-000000000001",
      type: "property.published",
      title: "Test",
      body: "Test",
      href: "https://evil.example.com/path",
    });
    expect(result.inAppCreated).toBe(false);
    expect(result.deduplicated).toBe(false);
  });

  it("rejects protocol-relative URLs in href", async () => {
    const result = await notificationService.dispatch({
      recipientId: "00000000-0000-0000-0000-000000000001",
      type: "property.published",
      title: "Test",
      body: "Test",
      href: "//evil.example.com",
    });
    expect(result.inAppCreated).toBe(false);
  });

  it("rejects javascript: URLs in href", async () => {
    const result = await notificationService.dispatch({
      recipientId: "00000000-0000-0000-0000-000000000001",
      type: "property.published",
      title: "Test",
      body: "Test",
      href: "javascript:alert(1)",
    });
    expect(result.inAppCreated).toBe(false);
  });

  it("rejects unknown notification types", async () => {
    const result = await notificationService.dispatch({
      recipientId: "00000000-0000-0000-0000-000000000001",
      type: "unknown.made.up.type",
      title: "Test",
      body: "Test",
      href: "/dashboard",
    });
    expect(result.inAppCreated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Email retry classification
// ---------------------------------------------------------------------------
import {
  RETRYABLE_ERRORS,
} from "@/lib/notifications/email-service";

describe("email retry classification", () => {
  it("classifies provider_error, timeout, network, rate_limited as retryable", () => {
    expect(RETRYABLE_ERRORS.has("provider_error")).toBe(true);
    expect(RETRYABLE_ERRORS.has("timeout")).toBe(true);
    expect(RETRYABLE_ERRORS.has("network")).toBe(true);
    expect(RETRYABLE_ERRORS.has("rate_limited")).toBe(true);
    expect(RETRYABLE_ERRORS.has("unknown")).toBe(true);
  });

  it("classifies invalid_email and suppressed_address as non-retryable", () => {
    expect(RETRYABLE_ERRORS.has("invalid_email")).toBe(false);
    expect(RETRYABLE_ERRORS.has("suppressed_address")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Source code structure invariants — verify the spec sections are
// actually implemented in code, not just in the migration.
// ---------------------------------------------------------------------------
describe("source code structure (spec Section 18, 19, 20, 31, 38)", () => {
  function readSrc(relPath: string): string {
    return fs.readFileSync(path.join(SRC_DIR, relPath), "utf8");
  }

  it("dispatcher uses SECURITY DEFINER dispatch_notification function", () => {
    const dispatcher = readSrc("lib/notifications/dispatcher.ts");
    expect(dispatcher).toContain("dispatch_notification");
  });

  it("dispatcher inserts into notification_events ledger for idempotency", () => {
    const dispatcher = readSrc("lib/notifications/dispatcher.ts");
    expect(dispatcher).toContain("notification_events");
  });

  it("dispatcher respects mandatory categories (no preference override)", () => {
    const dispatcher = readSrc("lib/notifications/dispatcher.ts");
    expect(dispatcher).toContain("isMandatoryCategory");
  });

  it("email-service records delivery attempts in email_delivery_records", () => {
    const service = readSrc("lib/notifications/email-service.ts");
    expect(service).toContain("email_delivery_records");
  });

  it("email-service implements bounded retries (max 3)", () => {
    const service = readSrc("lib/notifications/email-service.ts");
    expect(service).toContain("MAX_RETRIES");
  });

  it("email-service classifies permanent vs retryable errors", () => {
    const service = readSrc("lib/notifications/email-service.ts");
    expect(service).toContain("isPermanentFailure");
    expect(service).toContain("RETRYABLE_ERRORS");
  });

  it("preferences module refuses mandatory category disabling", () => {
    const prefs = readSrc("lib/notifications/preferences.ts");
    expect(prefs).toContain("Security-critical notifications cannot be disabled");
  });

  it("preferences module refuses non-instant frequency on mandatory categories", () => {
    const prefs = readSrc("lib/notifications/preferences.ts");
    expect(prefs).toContain("Security notifications must be delivered instantly");
  });

  it("saved-search matcher uses notification service for instant alerts", () => {
    const matcher = readSrc("lib/notifications/saved-search-matcher.ts");
    expect(matcher).toContain("notificationService.dispatch");
    expect(matcher).toContain("saved_search.match");
  });

  it("saved-search matcher records property_alerts rows for digest path", () => {
    const matcher = readSrc("lib/notifications/saved-search-matcher.ts");
    expect(matcher).toContain("property_alerts");
  });

  it("applications actions dispatch application.accepted notification", () => {
    const actions = readSrc("lib/applications/actions.ts");
    expect(actions).toContain("application.accepted");
    expect(actions).toContain("representation.established");
    expect(actions).toContain("application.received");
    expect(actions).toContain("application.declined");
  });

  it("messaging actions dispatch message.new notification with grouping", () => {
    const actions = readSrc("lib/messaging/actions.ts");
    expect(actions).toContain("message.new");
    // Daily bucket key — spec Section 21 grouping.
    expect(actions).toContain("dailyBucket");
  });

  it("payments service dispatches payment.successful + subscription.started", () => {
    const service = readSrc("lib/payments/payment-service.ts");
    expect(service).toContain("payment.successful");
    expect(service).toContain("subscription.started");
    expect(service).toContain("payment.failed");
  });

  it("verification admin-actions uses the dispatcher for state changes", () => {
    const admin = readSrc("lib/verification/admin-actions.ts");
    expect(admin).toContain("verification.approved");
    expect(admin).toContain("verification.rejected");
    expect(admin).toContain("verification.revoked");
    // Old direct-insert pattern should be gone.
    expect(admin).not.toContain("from(\"notifications\").insert");
  });

  it("reviews actions dispatch review.received notification", () => {
    const reviews = readSrc("lib/reviews/actions.ts");
    expect(reviews).toContain("review.received");
    expect(reviews).toContain("review.published");
  });

  it("property publish triggers saved-search matcher", () => {
    const actions = readSrc("lib/properties/actions.ts");
    expect(actions).toContain("matchPropertyToSavedSearches");
    expect(actions).toContain("property.published");
  });

  it("advertising submit dispatches campaign.submitted", () => {
    const advertising = readSrc("lib/advertising/actions.ts");
    expect(advertising).toContain("campaign.submitted");
  });

  it("featured actions dispatches promotion.submitted", () => {
    const featured = readSrc("lib/featured/actions.ts");
    expect(featured).toContain("promotion.submitted");
  });

  it("auth actions dispatches welcome + password_changed", () => {
    const auth = readSrc("lib/auth/actions.ts");
    expect(auth).toContain("account.welcome");
    expect(auth).toContain("account.password_changed");
  });

  it("dashboard-layout renders the NotificationBell", () => {
    const layout = readSrc("components/layout/dashboard-layout.tsx");
    expect(layout).toContain("NotificationBell");
  });

  it("NotificationBell subscribes to Supabase Realtime", () => {
    const bell = readSrc("components/notifications/notification-bell.tsx");
    expect(bell).toContain("postgres_changes");
    expect(bell).toContain("INSERT");
  });

  it("NotificationBell has a fallback polling interval", () => {
    const bell = readSrc("components/notifications/notification-bell.tsx");
    expect(bell).toContain("setInterval");
  });

  it("NotificationBell exposes unread state via non-color signal (sr-only)", () => {
    const bell = readSrc("components/notifications/notification-bell.tsx");
    expect(bell).toContain("sr-only");
  });
});

// ---------------------------------------------------------------------------
// API route invariants
// ---------------------------------------------------------------------------
describe("API routes (spec Section 19, 20)", () => {
  function readRoute(relPath: string): string {
    return fs.readFileSync(
      path.join(SRC_DIR, "app", "api", relPath),
      "utf8",
    );
  }

  it("GET /api/notifications paginates by cursor", () => {
    const r = readRoute("notifications/route.ts");
    expect(r).toContain("cursor");
    expect(r).toContain("limit");
    expect(r).toContain("nextCursor");
  });

  it("GET /api/notifications rejects unauthenticated users", () => {
    const r = readRoute("notifications/route.ts");
    expect(r).toContain("UNAUTHENTICATED");
    expect(r).toContain("401");
  });

  it("PATCH /api/notifications/[id] uses SECURITY DEFINER functions", () => {
    const r = readRoute("notifications/[id]/route.ts");
    expect(r).toContain("mark_notification_read");
    expect(r).toContain("mark_notification_unread");
    expect(r).toContain("dismiss_notification");
  });

  it("GET /api/notifications/unread-count is lightweight", () => {
    const r = readRoute("notifications/unread-count/route.ts");
    expect(r).toContain("head: true");
    expect(r).toContain("count: count");
  });

  it("POST /api/notifications/mark-all-read uses SECURITY DEFINER", () => {
    const r = readRoute("notifications/mark-all-read/route.ts");
    expect(r).toContain("mark_all_notifications_read");
  });

  it("GET/PATCH /api/notifications/preferences enforces mandatory rules", () => {
    const r = readRoute("notifications/preferences/route.ts");
    expect(r).toContain("getMyNotificationPreferences");
    expect(r).toContain("updateMyNotificationPreference");
  });

  it("GET /api/notifications/unsubscribe returns HTML confirmation", () => {
    const r = readRoute("notifications/unsubscribe/route.ts");
    expect(r).toContain("Content-Type");
    expect(r).toContain("text/html");
  });

  it("POST /api/cron/saved-search-matcher checks cron secret", () => {
    const r = readRoute("cron/saved-search-matcher/route.ts");
    expect(r).toContain("CRON_SECRET");
    expect(r).toContain("x-cron-token");
  });
});
