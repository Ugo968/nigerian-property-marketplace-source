/**
 * Audit log helper for admin actions (spec Section 33).
 *
 * Every privileged mutation in the admin module MUST go through
 * recordAdminAction() so the moderation history is consistent
 * and queryable.
 *
 * Two records are written for each action:
 *   1. A row in `audit_logs` (the global append-only audit trail —
 *      already used by Prompts 1–16 for non-admin actions)
 *   2. A row in `admin_action_records` (the structured moderation
 *      history — separate table for efficient "show me all moderation
 *      actions on user X" queries without scanning the full audit log)
 *
 * Both are append-only. No UPDATE policy exists in RLS. No DELETE
 * policy exists in RLS. Admins cannot edit or delete these records
 * through the application.
 */

import { createAdminClient } from "@/lib/db/supabase";
import { logger } from "@/lib/logging";
import type { AdminIdentity } from "./permissions";

// ---------------------------------------------------------------------------
// Target types — matches the CHECK constraint on admin_action_records.
// ---------------------------------------------------------------------------
export type AdminTargetType =
  | "user"
  | "property"
  | "verification_application"
  | "review"
  | "report"
  | "conversation"
  | "message"
  | "advertising_business"
  | "advertising_campaign"
  | "featured_listing"
  | "subscription"
  | "payment"
  | "notification";

export interface RecordAdminActionInput {
  admin: AdminIdentity;
  /** Stable slug, e.g. "user.suspend", "property.remove". */
  action: string;
  targetType: AdminTargetType;
  targetId: string;
  /** Required for high-impact actions (ban, remove, revoke). */
  reason?: string | null;
  previousState?: string | null;
  newState?: string | null;
  /** Free-form metadata (sanitised — no secrets). */
  metadata?: Record<string, unknown>;
}

/**
 * Records an admin action in BOTH the global audit_logs table AND
 * the admin_action_records table. Best-effort: failures are logged
 * but never propagate to the caller — the moderation action itself
 * must not roll back because the audit write failed.
 */
export async function recordAdminAction(
  input: RecordAdminActionInput,
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) {
    logger.warn("recordAdminAction: admin client unavailable", {
      action: input.action,
      targetType: input.targetType,
    });
    return;
  }

  const metadata = {
    ...input.metadata,
    reason: input.reason ?? null,
    previousState: input.previousState ?? null,
    newState: input.newState ?? null,
    adminRole: input.admin.role,
  };

  // 1. Global audit log — uses the existing audit_logs table.
  try {
    await admin.from("audit_logs").insert({
      actor_id: input.admin.user.id,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      metadata,
    } as never);
  } catch (err) {
    logger.error("audit_logs insert failed", {
      action: input.action,
      error: err instanceof Error ? err.message : "unknown",
    });
  }

  // 2. Structured moderation history table.
  try {
    await admin.from("admin_action_records").insert({
      admin_user_id: input.admin.user.id,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      reason: input.reason ?? null,
      previous_state: input.previousState ?? null,
      new_state: input.newState ?? null,
      metadata: input.metadata ?? {},
    } as never);
  } catch (err) {
    logger.error("admin_action_records insert failed", {
      action: input.action,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}
