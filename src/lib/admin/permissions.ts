/**
 * Admin permission catalogue + server-side authorization boundary.
 *
 * The three marketplace roles (landlord / agent / company) NEVER gain
 * admin access via this module. Admin authorization is a separate
 * axis derived from the `admin_users` table.
 *
 * Two admin tiers exist:
 *   * admin      — has only the permissions listed in their permissions[]
 *   * super_admin — has ALL permissions (effectively)
 *
 * Adding a new permission = add a string to ADMIN_PERMISSIONS + check
 * with requireAdminPermission("name"). No code changes elsewhere.
 *
 * SECURITY: This module is server-only. It reads the admin_users
 * table via the RLS-bound server client. The browser can NEVER
 * bypass this check by modifying cookies / JWTs / role values.
 */

import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/db/supabase";
import {
  getCurrentUser,
} from "@/lib/auth/server";
import { logger } from "@/lib/logging";

// ---------------------------------------------------------------------------
// Permission catalogue (spec Section 2).
// ---------------------------------------------------------------------------
export const ADMIN_PERMISSIONS = [
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
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export type AdminRole = "admin" | "super_admin";

// ---------------------------------------------------------------------------
// AdminIdentity — the resolved admin context, returned by requireAdmin*().
// ---------------------------------------------------------------------------
export interface AdminIdentity {
  user: User;
  adminUserId: string;
  role: AdminRole;
  permissions: AdminPermission[] | "*";
}

/**
 * Returns true if the admin has the given permission.
 * Super admins always return true.
 */
export function hasAdminPermission(
  admin: AdminIdentity,
  permission: AdminPermission,
): boolean {
  if (admin.role === "super_admin") return true;
  if (admin.permissions === "*") return true;
  return admin.permissions.includes(permission);
}

/**
 * Throws if the admin lacks the permission. Use in server actions + route
 * handlers before any privileged mutation.
 */
export function assertAdminPermission(
  admin: AdminIdentity,
  permission: AdminPermission,
): void {
  if (!hasAdminPermission(admin, permission)) {
    logger.warn("admin permission denied", {
      adminId: admin.user.id,
      role: admin.role,
      permission,
    });
    throw new Error("FORBIDDEN");
  }
}

// Alias for readability at call sites.
export const assertPermission = assertAdminPermission;

// ---------------------------------------------------------------------------
// Resolves the calling admin's identity from the session.
// ---------------------------------------------------------------------------
async function resolveAdminIdentity(): Promise<AdminIdentity | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createServerClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("admin_users")
    .select("id, role, permissions")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) {
    // Fall back to ADMIN_EMAILS env var — first-run seeding before the
    // admin_users table is populated. These users get super_admin.
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!adminEmails.includes(user.email ?? "")) {
      return null;
    }
    return {
      user,
      adminUserId: "env-seed",
      role: "super_admin" as const,
      permissions: "*",
    };
  }

  const row = data as {
    id: string;
    role: AdminRole;
    permissions: string[] | "*";
  };

  return {
    user,
    adminUserId: row.id,
    role: row.role,
    permissions: row.permissions as AdminPermission[] | "*",
  };
}

/**
 * requireAdmin — asserts the caller is an admin (any tier).
 * Returns the AdminIdentity for permission checks downstream.
 */
export async function requireAdmin(): Promise<AdminIdentity> {
  const admin = await resolveAdminIdentity();
  if (!admin) {
    throw new Error("FORBIDDEN");
  }
  return admin;
}

/**
 * requireAdminPermission — asserts the caller is an admin AND has the
 * specified permission. Throws FORBIDDEN otherwise.
 *
 * Use this at the top of every privileged server action / route handler.
 */
export async function requireAdminPermission(
  permission: AdminPermission,
): Promise<AdminIdentity> {
  const admin = await requireAdmin();
  assertPermission(admin, permission);
  return admin;
}

/**
 * Soft-check variant: returns the admin identity or null. Use in
 * Server Components for conditional rendering of admin-only UI elements.
 */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  return resolveAdminIdentity();
}
