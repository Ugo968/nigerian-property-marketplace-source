/**
 * Admin fetchers — read queries for the admin dashboard.
 *
 * All fetchers:
 *   1. Call requireAdmin() or requireAdminPermission() at the top —
 *      authorization is enforced server-side, never via RLS.
 *   2. Use the service-role admin client (bypasses RLS) — admin
 *      authorization was verified at step 1.
 *   3. Return typed rows. Never leak secrets (no password hashes,
 *      payment card data, or auth tokens).
 *
 * These fetchers are read-only. Mutations go through the actions.ts
 * module which uses recordAdminAction() for audit logging.
 */

import { createAdminClient } from "@/lib/db/supabase";
import { logger } from "@/lib/logging";
import type {
  ProfileRow,
  PropertyRow,
  PaymentRow,
  ReviewRow,
  ReportRow,
  AuditLogRow,
  NotificationRow,
  EmailDeliveryRecordRow,
  AdminActionRecordRow,
  ReportCategoryRow,
  PlatformSettingRow,
} from "@/types";
import {
  requireAdmin,
  requireAdminPermission,
  type AdminIdentity,
} from "./permissions";

// ---------------------------------------------------------------------------
// Dashboard metrics (spec Section 5, 38)
// ---------------------------------------------------------------------------

export interface DashboardMetrics {
  users: {
    total: number;
    active: number;
    suspended: number;
    banned: number;
    pending: number;
    today: number;
    last7d: number;
    last30d: number;
    byRole: { role: string; count: number }[];
  };
  properties: {
    total: number;
    available: number;
    rented: number;
    sold: number;
    suspended: number;
    removed: number;
    today: number;
    last7d: number;
    last30d: number;
  };
  verifications: {
    pending: number;
    underReview: number;
  };
  reports: {
    open: number;
    investigating: number;
    escalated: number;
    today: number;
    last7d: number;
  };
  reviews: {
    total: number;
    published: number;
    hidden: number;
    removed: number;
  };
  subscriptions: {
    active: number;
    cancelled: number;
    expired: number;
    pastDue: number;
  };
  payments: {
    successfulVolume7dNaira: number;
    successfulVolume30dNaira: number;
    failedCount7d: number;
    refundedVolume30dNaira: number;
    today: number;
  };
  featured: {
    activePromotions: number;
    scheduledPromotions: number;
  };
  advertising: {
    activeCampaigns: number;
    pendingReview: number;
  };
}

export async function getDashboardMetrics(): Promise<DashboardMetrics | null> {
  // Require any admin — the dashboard is gated behind admin auth.
  await requireAdmin();
  const admin = createAdminClient();
  if (!admin) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Users
  const { count: totalUsers } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  const { count: activeUsers } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("account_status", "active")
    .is("deleted_at", null);

  const { count: suspendedUsers } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("account_status", "suspended")
    .is("deleted_at", null);

  const { count: bannedUsers } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("account_status", "banned")
    .is("deleted_at", null);

  const { count: pendingUsers } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("account_status", "pending")
    .is("deleted_at", null);

  const { count: usersToday } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .gte("created_at", todayStart);

  const { count: users7d } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .gte("created_at", last7d);

  const { count: users30d } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .gte("created_at", last30d);

  // Users by role
  const { data: roleData } = await admin
    .from("profiles")
    .select("role")
    .is("deleted_at", null);
  const roleMap = new Map<string, number>();
  for (const r of (roleData ?? []) as { role: string }[]) {
    roleMap.set(r.role, (roleMap.get(r.role) ?? 0) + 1);
  }

  // Properties
  const { count: totalProps } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true });

  const { count: availableProps } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("status", "available")
    .is("deleted_at", null);

  const { count: rentedProps } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("status", "rented")
    .is("deleted_at", null);

  const { count: soldProps } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("status", "sold")
    .is("deleted_at", null);

  const { count: suspendedProps } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("status", "suspended");

  const { count: removedProps } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .not("deleted_at", "is", null);

  const { count: propsToday } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .gte("created_at", todayStart);

  const { count: props7d } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .gte("created_at", last7d);

  const { count: props30d } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .gte("created_at", last30d);

  // Verifications pending
  const { count: verPending } = await admin
    .from("verification_applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted");

  const { count: verReview } = await admin
    .from("verification_applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "in_review");

  // Reports
  const { count: reportsOpen } = await admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  const { count: reportsInvestigating } = await admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "investigating");

  const { count: reportsEscalated } = await admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "escalated");

  const { count: reportsToday } = await admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .gte("created_at", todayStart);

  const { count: reports7d } = await admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .gte("created_at", last7d);

  // Reviews
  const { count: reviewsTotal } = await admin
    .from("reviews")
    .select("id", { count: "exact", head: true });

  const { count: reviewsPublished } = await admin
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("status", "published");

  const { count: reviewsHidden } = await admin
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("status", "hidden");

  const { count: reviewsRemoved } = await admin
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("status", "removed");

  // Subscriptions
  const { count: subsActive } = await admin
    .from("user_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const { count: subsCancelled } = await admin
    .from("user_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "cancelled");

  const { count: subsExpired } = await admin
    .from("user_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "expired");

  const { count: subsPastDue } = await admin
    .from("user_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "past_due");

  // Payments (spec Section 24, 25) — only platform payments, never
  // property rent/sale money.
  const { data: payments7d } = await admin
    .from("payments")
    .select("amount")
    .eq("status", "successful")
    .gte("verified_at", last7d);
  const volume7d = (payments7d ?? []).reduce(
    (sum, p) => sum + ((p as { amount: number }).amount ?? 0),
    0,
  ) / 100;

  const { data: payments30d } = await admin
    .from("payments")
    .select("amount")
    .eq("status", "successful")
    .gte("verified_at", last30d);
  const volume30d = (payments30d ?? []).reduce(
    (sum, p) => sum + ((p as { amount: number }).amount ?? 0),
    0,
  ) / 100;

  const { count: failed7d } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("verified_at", last7d);

  const { data: refunds30d } = await admin
    .from("payments")
    .select("amount")
    .eq("status", "refunded")
    .gte("verified_at", last30d);
  const refunds30dNaira = (refunds30d ?? []).reduce(
    (sum, p) => sum + ((p as { amount: number }).amount ?? 0),
    0,
  ) / 100;

  const { count: paymentsToday } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .gte("initiated_at", todayStart);

  // Featured promotions
  const { count: featuredActive } = await admin
    .from("featured_listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const { count: featuredScheduled } = await admin
    .from("featured_listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "scheduled");

  // Advertising
  const { count: adsActive } = await admin
    .from("advertising_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const { count: adsPending } = await admin
    .from("advertising_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review");

  return {
    users: {
      total: totalUsers ?? 0,
      active: activeUsers ?? 0,
      suspended: suspendedUsers ?? 0,
      banned: bannedUsers ?? 0,
      pending: pendingUsers ?? 0,
      today: usersToday ?? 0,
      last7d: users7d ?? 0,
      last30d: users30d ?? 0,
      byRole: Array.from(roleMap.entries()).map(([role, count]) => ({ role, count })),
    },
    properties: {
      total: totalProps ?? 0,
      available: availableProps ?? 0,
      rented: rentedProps ?? 0,
      sold: soldProps ?? 0,
      suspended: suspendedProps ?? 0,
      removed: removedProps ?? 0,
      today: propsToday ?? 0,
      last7d: props7d ?? 0,
      last30d: props30d ?? 0,
    },
    verifications: {
      pending: verPending ?? 0,
      underReview: verReview ?? 0,
    },
    reports: {
      open: reportsOpen ?? 0,
      investigating: reportsInvestigating ?? 0,
      escalated: reportsEscalated ?? 0,
      today: reportsToday ?? 0,
      last7d: reports7d ?? 0,
    },
    reviews: {
      total: reviewsTotal ?? 0,
      published: reviewsPublished ?? 0,
      hidden: reviewsHidden ?? 0,
      removed: reviewsRemoved ?? 0,
    },
    subscriptions: {
      active: subsActive ?? 0,
      cancelled: subsCancelled ?? 0,
      expired: subsExpired ?? 0,
      pastDue: subsPastDue ?? 0,
    },
    payments: {
      successfulVolume7dNaira: volume7d,
      successfulVolume30dNaira: volume30d,
      failedCount7d: failed7d ?? 0,
      refundedVolume30dNaira: refunds30dNaira,
      today: paymentsToday ?? 0,
    },
    featured: {
      activePromotions: featuredActive ?? 0,
      scheduledPromotions: featuredScheduled ?? 0,
    },
    advertising: {
      activeCampaigns: adsActive ?? 0,
      pendingReview: adsPending ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// User search + filters (spec Section 7)
// ---------------------------------------------------------------------------

export interface AdminUserListFilters {
  q?: string;
  role?: "landlord" | "agent" | "company";
  accountStatus?: "active" | "suspended" | "banned" | "pending" | "deactivated";
  verificationState?: string;
  subscriptionTier?: "free" | "pro" | "premium";
  page?: number;
  pageSize?: number;
}

export interface AdminUserListResult {
  users: ProfileRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function adminListUsers(
  filters: AdminUserListFilters,
): Promise<AdminUserListResult | null> {
  await requireAdminPermission("users.view");
  const admin = createAdminClient();
  if (!admin) return null;

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 25, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from("profiles").select("*", { count: "exact" });
  if (filters.q) {
    query = query.or(`full_name.ilike.%${filters.q}%,phone.ilike.%${filters.q}%`);
  }
  if (filters.role) query = query.eq("role", filters.role);
  if (filters.accountStatus) query = query.eq("account_status", filters.accountStatus);
  if (filters.verificationState) query = query.eq("verification_state", filters.verificationState);
  if (filters.subscriptionTier) query = query.eq("subscription_tier", filters.subscriptionTier);
  query = query.is("deleted_at", null);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count } = await query;
  return {
    users: (data ?? []) as ProfileRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// User detail (spec Section 11)
// ---------------------------------------------------------------------------

export interface AdminUserDetail {
  profile: ProfileRow;
  email: string | null;
  propertyCount: number;
  applicationCount: number;
  reviewCount: number;
  reportCount: number;
  subscriptionStatus: string | null;
  moderationHistory: AdminActionRecordRow[];
}

export async function adminGetUserDetail(
  profileId: string,
): Promise<AdminUserDetail | null> {
  await requireAdminPermission("users.view");
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: profileRow } = await admin
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();
  const profile = profileRow as ProfileRow | null;
  if (!profile) return null;

  // Email is in auth.users — fetch via service role.
  const { data: userRow } = await admin
    .from("auth.users")
    .select("email")
    .eq("id", profile.user_id)
    .maybeSingle();
  const email = (userRow as { email?: string } | null)?.email ?? null;

  const { count: propertyCount } = await admin
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("listing_creator_id", profileId);

  const { count: applicationCount } = await admin
    .from("property_applications")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", profileId);

  const { count: reviewCount } = await admin
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("reviewer_id", profileId);

  const { count: reportCount } = await admin
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("reporter_id", profileId);

  const { data: subRow } = await admin
    .from("user_subscriptions")
    .select("status")
    .eq("user_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const subscriptionStatus = (subRow as { status?: string } | null)?.status ?? null;

  // Moderation history — admin_action_records
  const { data: modHistory } = await admin
    .from("admin_action_records")
    .select("*")
    .eq("target_type", "user")
    .eq("target_id", profileId)
    .order("created_at", { ascending: false })
    .limit(20);

  return {
    profile,
    email,
    propertyCount: propertyCount ?? 0,
    applicationCount: applicationCount ?? 0,
    reviewCount: reviewCount ?? 0,
    reportCount: reportCount ?? 0,
    subscriptionStatus,
    moderationHistory: (modHistory ?? []) as AdminActionRecordRow[],
  };
}

// ---------------------------------------------------------------------------
// Property search + filters (spec Section 12)
// ---------------------------------------------------------------------------

export interface AdminPropertyListFilters {
  q?: string;
  status?: string;
  transactionType?: string;
  propertyTypeId?: string;
  state?: string;
  city?: string;
  ownerProfileId?: string;
  page?: number;
  pageSize?: number;
}

export async function adminListProperties(
  filters: AdminPropertyListFilters,
): Promise<{ properties: PropertyRow[]; total: number; page: number; pageSize: number } | null> {
  await requireAdminPermission("properties.view");
  const admin = createAdminClient();
  if (!admin) return null;

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 25, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from("properties").select("*", { count: "exact" });
  if (filters.q) query = query.ilike("title", `%${filters.q}%`);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.transactionType) query = query.eq("transaction_type", filters.transactionType);
  if (filters.propertyTypeId) query = query.eq("property_type_id", filters.propertyTypeId);
  if (filters.ownerProfileId) query = query.eq("owner_profile_id", filters.ownerProfileId);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count } = await query;
  return {
    properties: (data ?? []) as PropertyRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Verification applications list (spec Section 15)
// ---------------------------------------------------------------------------

export async function adminListVerifications(filters: {
  status?: string;
  tier?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ applications: unknown[]; total: number; page: number; pageSize: number } | null> {
  await requireAdminPermission("verification.review");
  const admin = createAdminClient();
  if (!admin) return null;

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 25, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from("verification_applications").select("*", { count: "exact" });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.tier) query = query.eq("tier", filters.tier);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count } = await query;
  return {
    applications: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Reviews list (spec Section 18)
// ---------------------------------------------------------------------------

export async function adminListReviews(filters: {
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ reviews: ReviewRow[]; total: number; page: number; pageSize: number } | null> {
  await requireAdminPermission("reviews.moderate");
  const admin = createAdminClient();
  if (!admin) return null;

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 25, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from("reviews").select("*", { count: "exact" });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.q) query = query.ilike("body", `%${filters.q}%`);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count } = await query;
  return {
    reviews: (data ?? []) as ReviewRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Reports list (spec Section 20)
// ---------------------------------------------------------------------------

export async function adminListReports(filters: {
  status?: string;
  entityType?: string;
  reason?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ reports: ReportRow[]; total: number; page: number; pageSize: number } | null> {
  await requireAdminPermission("reports.manage");
  const admin = createAdminClient();
  if (!admin) return null;

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 25, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from("reports").select("*", { count: "exact" });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters.reason) query = query.eq("reason", filters.reason);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count } = await query;
  return {
    reports: (data ?? []) as ReportRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function adminGetReport(
  reportId: string,
): Promise<{ report: ReportRow; moderationHistory: AdminActionRecordRow[] } | null> {
  await requireAdminPermission("reports.manage");
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: reportRow } = await admin
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();
  const report = reportRow as ReportRow | null;
  if (!report) return null;

  const { data: modHistory } = await admin
    .from("admin_action_records")
    .select("*")
    .eq("target_type", "report")
    .eq("target_id", reportId)
    .order("created_at", { ascending: false })
    .limit(20);

  return {
    report,
    moderationHistory: (modHistory ?? []) as AdminActionRecordRow[],
  };
}

// ---------------------------------------------------------------------------
// Payments list (spec Section 24, 25) — read-only.
// ---------------------------------------------------------------------------

export async function adminListPayments(filters: {
  provider?: string;
  paymentType?: string;
  status?: string;
  userId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ payments: PaymentRow[]; total: number; page: number; pageSize: number } | null> {
  await requireAdminPermission("payments.view");
  const admin = createAdminClient();
  if (!admin) return null;

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 25, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from("payments").select("*", { count: "exact" });
  if (filters.provider) query = query.eq("provider", filters.provider);
  if (filters.paymentType) query = query.eq("payment_type", filters.paymentType);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.userId) query = query.eq("user_id", filters.userId);
  if (filters.q) query = query.ilike("provider_reference", `%${filters.q}%`);
  query = query.order("initiated_at", { ascending: false }).range(from, to);

  const { data, count } = await query;
  // Note: PaymentRow doesn't include card data — never stored.
  return {
    payments: (data ?? []) as PaymentRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Subscriptions list (spec Section 26)
// ---------------------------------------------------------------------------

export async function adminListSubscriptions(filters: {
  status?: string;
  tier?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ subscriptions: unknown[]; total: number; page: number; pageSize: number } | null> {
  await requireAdminPermission("subscriptions.manage");
  const admin = createAdminClient();
  if (!admin) return null;

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 25, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from("user_subscriptions").select("*", { count: "exact" });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.tier) query = query.eq("tier", filters.tier);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count } = await query;
  return {
    subscriptions: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Promotions list (spec Section 27)
// ---------------------------------------------------------------------------

export async function adminListPromotions(filters: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ promotions: unknown[]; total: number; page: number; pageSize: number } | null> {
  await requireAdminPermission("promotions.manage");
  const admin = createAdminClient();
  if (!admin) return null;

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 25, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from("featured_listings").select("*", { count: "exact" });
  if (filters.status) query = query.eq("status", filters.status);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count } = await query;
  return {
    promotions: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Advertising campaigns list (spec Section 28)
// ---------------------------------------------------------------------------

export async function adminListCampaigns(filters: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ campaigns: unknown[]; total: number; page: number; pageSize: number } | null> {
  await requireAdminPermission("advertising.manage");
  const admin = createAdminClient();
  if (!admin) return null;

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 25, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from("advertising_campaigns").select("*", { count: "exact" });
  if (filters.status) query = query.eq("status", filters.status);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count } = await query;
  return {
    campaigns: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Notifications + email delivery (spec Section 30) — operational visibility
// only. The admin can see delivery status / failure category, NOT
// arbitrary user notification impersonation.
// ---------------------------------------------------------------------------

export async function adminListNotifications(filters: {
  type?: string;
  channel?: string;
  recipientId?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ notifications: NotificationRow[]; total: number; page: number; pageSize: number } | null> {
  await requireAdminPermission("notifications.manage");
  const admin = createAdminClient();
  if (!admin) return null;

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 25, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from("notifications").select("*", { count: "exact" });
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.channel) query = query.eq("channel", filters.channel);
  if (filters.recipientId) query = query.eq("recipient_id", filters.recipientId);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count } = await query;
  return {
    notifications: (data ?? []) as NotificationRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function adminListEmailDelivery(filters: {
  status?: string;
  template?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ records: EmailDeliveryRecordRow[]; total: number; page: number; pageSize: number } | null> {
  await requireAdminPermission("notifications.manage");
  const admin = createAdminClient();
  if (!admin) return null;

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 25, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from("email_delivery_records").select("*", { count: "exact" });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.template) query = query.eq("template", filters.template);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count } = await query;
  return {
    records: (data ?? []) as EmailDeliveryRecordRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// Audit log (spec Section 31) — append-only.
// ---------------------------------------------------------------------------

export async function adminListAuditLogs(filters: {
  actorId?: string;
  action?: string;
  targetType?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ logs: AuditLogRow[]; total: number; page: number; pageSize: number } | null> {
  await requireAdminPermission("audit.view");
  const admin = createAdminClient();
  if (!admin) return null;

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 50, 200);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from("audit_logs").select("*", { count: "exact" });
  if (filters.actorId) query = query.eq("actor_id", filters.actorId);
  if (filters.action) query = query.ilike("action", `%${filters.action}%`);
  if (filters.targetType) query = query.eq("target_type", filters.targetType);
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count } = await query;
  return {
    logs: (data ?? []) as AuditLogRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function adminListModerationHistory(targetType: string, targetId: string): Promise<AdminActionRecordRow[]> {
  await requireAdmin();
  const admin = createAdminClient();
  if (!admin) return [];

  const { data } = await admin
    .from("admin_action_records")
    .select("*")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []) as AdminActionRecordRow[];
}

// ---------------------------------------------------------------------------
// Report categories (spec Section 22)
// ---------------------------------------------------------------------------

export async function adminListReportCategories(): Promise<ReportCategoryRow[]> {
  await requireAdmin();
  const admin = createAdminClient();
  if (!admin) return [];
  const { data } = await admin
    .from("report_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data ?? []) as ReportCategoryRow[];
}

// ---------------------------------------------------------------------------
// Platform settings (spec Section 39, 40)
// ---------------------------------------------------------------------------

export async function adminListPlatformSettings(): Promise<PlatformSettingRow[]> {
  await requireAdminPermission("settings.manage");
  const admin = createAdminClient();
  if (!admin) return [];
  const { data } = await admin
    .from("platform_settings")
    .select("*")
    .order("key", { ascending: true });
  return (data ?? []) as PlatformSettingRow[];
}

// Re-export AdminIdentity type for convenience.
export type { AdminIdentity };
