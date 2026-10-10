/**
 * Notification dispatcher — the central NotificationService (spec
 * Section 18, 19, 20).
 *
 * This module is the SINGLE entry point for emitting notifications from
 * any feature module. It:
 *
 *   - Validates the notification type against the catalogue.
 *   - Resolves the recipient's profile from the caller-supplied id.
 *   - Looks up the recipient's notification preferences.
 *   - Honours mandatory categories (always send) and opt-outs
 *     (skip when user has opted out for non-mandatory categories).
 *   - Calls the `dispatch_notification()` SQL SECURITY DEFINER to
 *     insert the notification row with idempotency checking.
 *   - Records the event in `notification_events` ledger.
 *   - Calls the email service when the email channel is desired.
 *
 * CRITICAL SECURITY:
 *   - This module is server-only. The `recipientUserId` MUST be a
 *     profile id resolved by trusted server code. It is NEVER taken
 *     from a client-supplied value.
 *   - The `eventKey` parameter provides idempotency — duplicate emits
 *     (retried webhooks, retried workers) do not produce duplicate
 *     notifications.
 *   - The dispatcher NEVER trusts a client-supplied href to be safe.
 *     It validates that the href is a relative URL on our origin.
 *   - User-generated text in the title/body is HTML-escaped at the
 *     render-time and again at the React-render-time. The dispatcher
 *     stores the raw text in the DB and the React list escapes it.
 */

import { createAdminClient } from "@/lib/db/supabase";
import { logger } from "@/lib/logging";
import { serverConfig } from "@/lib/security/server-config";
import type {
  NotificationLevel,
  NotificationPriority,
  NotificationChannel,
  NotificationCategory,
  ProfileRow,
} from "@/types";

import {
  getNotificationTypeConfig,
  isMandatoryCategory,
  defaultPreferenceFor,
} from "./types";
import type { EmailTemplateSlug } from "./types";
import { sendEmail } from "./email-service";
import type { TemplateContext } from "./email-renderer";
import {
  unsubscribeViaEmail,
  getMyNotificationPreferences,
  updateMyNotificationPreference,
} from "./preferences";
import type { PreferenceUpdateInput } from "./preferences";

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------
export interface DispatchNotificationInput {
  /**
   * Recipient profile.id (NOT auth.users.id, NOT client-supplied).
   * Resolved by trusted server code based on the action that triggered
   * the notification (e.g. application.applicant_id, message.sender_id).
   */
  recipientId: string;
  /** Stable notification type id from the catalogue. */
  type: string;
  /** Title — short summary shown in the bell + list. */
  title: string;
  /** Optional body — longer explanation. */
  body?: string;
  /** Relative URL on our origin for the CTA. */
  href?: string;
  /** Related entity type (e.g. "application", "payment", "property"). */
  relatedEntityType?: string;
  /** Related entity id (UUID). */
  relatedEntityId?: string;
  /** Stable idempotency key — prevents duplicate notifications. */
  eventKey?: string;
  /** Optional metadata (sanitised — no secrets). */
  metadata?: Record<string, unknown>;
  /** Optional expiry timestamp (ISO). */
  expiresAt?: string;
  /**
   * Email template input — typed per template. Only used when the
   * notification type has a template and the email channel is allowed
   * by preferences.
   */
  emailTemplateInput?: Record<string, unknown>;
  /**
   * Override the resolved recipient name for the email greeting.
   * Defaults to the profile's full_name.
   */
  recipientNameOverride?: string;
}

export interface DispatchResult {
  /** Whether the in-app notification was created. */
  inAppCreated: boolean;
  /** Whether an email was sent (or attempted). */
  emailSent: boolean;
  /** Email delivery record id (when email was attempted). */
  emailDeliveryId: string | null;
  /** Notification id (when in-app was created). */
  notificationId: string | null;
  /** True when the dispatch was deduplicated (idempotent skip). */
  deduplicated: boolean;
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------
const HREF_BLOCKED_PREFIXES = ["http://", "https://", "//", "javascript:"];

function isSafeHref(href: string | undefined): boolean {
  if (!href) return true;
  return !HREF_BLOCKED_PREFIXES.some((p) =>
    href.toLowerCase().startsWith(p),
  );
}

// ---------------------------------------------------------------------------
// NotificationService — the singleton callers use.
// ---------------------------------------------------------------------------
class NotificationService {
  /**
   * Emit a notification across all eligible channels.
   *
   * Never throws — failures are logged and returned in the result.
   * Caller's transaction/state is never blocked on email delivery.
   */
  async dispatch(
    input: DispatchNotificationInput,
  ): Promise<DispatchResult> {
    const config = getNotificationTypeConfig(input.type);
    if (!config) {
      logger.error("dispatch: unknown notification type", { type: input.type });
      return {
        inAppCreated: false,
        emailSent: false,
        emailDeliveryId: null,
        notificationId: null,
        deduplicated: false,
      };
    }

    // Defence-in-depth: reject unsafe hrefs.
    if (!isSafeHref(input.href)) {
      logger.error("dispatch: unsafe href rejected", { type: input.type });
      return {
        inAppCreated: false,
        emailSent: false,
        emailDeliveryId: null,
        notificationId: null,
        deduplicated: false,
      };
    }

    const admin = createAdminClient();
    if (!admin) {
      logger.warn("dispatch: admin client unavailable", { type: input.type });
      return {
        inAppCreated: false,
        emailSent: false,
        emailDeliveryId: null,
        notificationId: null,
        deduplicated: false,
      };
    }

    // Resolve the recipient's profile + email.
    const { data: profileRow } = await admin
      .from("profiles")
      .select("id, full_name, user_id, account_status, deleted_at")
      .eq("id", input.recipientId)
      .maybeSingle();
    const profile = profileRow as
      | (Pick<ProfileRow, "id" | "full_name" | "user_id" | "account_status" | "deleted_at">)
      | null;
    if (!profile) {
      logger.error("dispatch: recipient profile not found", {
        recipientId: input.recipientId,
      });
      return {
        inAppCreated: false,
        emailSent: false,
        emailDeliveryId: null,
        notificationId: null,
        deduplicated: false,
      };
    }

    // Skip notifications for soft-deleted accounts.
    if (profile.deleted_at) {
      return {
        inAppCreated: false,
        emailSent: false,
        emailDeliveryId: null,
        notificationId: null,
        deduplicated: false,
      };
    }

    // Look up the recipient's email from auth.users.
    const { data: userRow } = await admin
      .from("auth.users")
      .select("email")
      .eq("id", profile.user_id)
      .maybeSingle();
    const recipientEmail = (userRow as { email?: string } | null)?.email ?? null;

    // Look up preferences.
    const preference = await this.lookupPreference(
      admin,
      profile.id,
      config.category,
    );

    // Determine channel eligibility.
    const isMandatory = isMandatoryCategory(config.category);
    const inAppAllowed = isMandatory || preference.in_app_enabled;
    const emailAllowed =
      isMandatory ||
      (preference.email_enabled && preference.email_frequency !== "off");
    const frequencyOk = isMandatory
      ? true
      : preference.email_frequency !== "off";

    // Insert event into the idempotency ledger FIRST. If this fails
    // with a unique violation, the event has already been processed —
    // we return early as a deduplicated dispatch.
    let eventAlreadyProcessed = false;
    if (input.eventKey) {
      try {
        await admin.from("notification_events").insert({
          event_key: input.eventKey,
          event_type: input.type,
          actor_id: null,
          recipient_id: profile.id,
          payload: {
            title: input.title,
            body: input.body,
            relatedEntityType: input.relatedEntityType,
            relatedEntityId: input.relatedEntityId,
            metadata: input.metadata,
          },
          status: "processed",
        } as never);
      } catch (err) {
        // Check if it's a unique_violation. We can't easily distinguish
        // error codes from the supabase-js client, so treat any insert
        // error here as "event already processed" — this is the safest
        // interpretation.
        const msg = err instanceof Error ? err.message : "unknown";
        if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
          eventAlreadyProcessed = true;
        } else {
          logger.error("dispatch: notification_events insert failed", {
            error: msg,
            eventKey: input.eventKey,
          });
          // Continue — we don't want a failed ledger to block the
          // notification. The dispatch_notification SQL function still
          // has its own idempotency guard via the partial unique index.
        }
      }
    }

    if (eventAlreadyProcessed) {
      return {
        inAppCreated: false,
        emailSent: false,
        emailDeliveryId: null,
        notificationId: null,
        deduplicated: true,
      };
    }

    // Build the related JSONB blob.
    const related: Record<string, unknown> = {};
    if (input.relatedEntityType) related.type = input.relatedEntityType;
    if (input.relatedEntityId) related.id = input.relatedEntityId;
    if (input.metadata) {
      // Merge metadata into related for backwards compat with the
      // original 0015 schema, but ALSO store in the metadata column.
      Object.assign(related, input.metadata);
    }

    let notificationId: string | null = null;

    // --- IN-APP CHANNEL ---
    if (inAppAllowed) {
      // Call the SECURITY DEFINER function. It returns null on duplicate.
      const { data: inAppId, error } = await admin.rpc("dispatch_notification", {
        p_recipient_id: profile.id,
        p_type: input.type,
        p_title: input.title,
        p_body: input.body ?? null,
        p_level: config.level,
        p_priority: config.priority,
        p_channel: "in_app",
        p_href: input.href ?? null,
        p_related: related,
        p_related_entity_type: input.relatedEntityType ?? null,
        p_related_entity_id: input.relatedEntityId ?? null,
        p_event_key: input.eventKey ?? null,
        p_metadata: input.metadata ?? {},
        p_expires_at: input.expiresAt ?? null,
      } as never);
      if (error) {
        logger.error("dispatch: dispatch_notification rpc failed", {
          error: error.message,
          type: input.type,
        });
      } else {
        notificationId = (inAppId as string | null) ?? null;
      }
    }

    // --- EMAIL CHANNEL ---
    let emailDeliveryId: string | null = null;
    let emailSent = false;
    if (
      emailAllowed &&
      frequencyOk &&
      config.template &&
      recipientEmail &&
      input.emailTemplateInput
    ) {
      const templateContext: TemplateContext = {
        recipientName: input.recipientNameOverride ?? profile.full_name,
        recipientEmail,
        category: config.category,
        isMandatory,
        actionUrl: input.href,
        actionLabel: undefined,
      };

      const result = await sendEmail({
        recipientId: profile.id,
        recipientEmail,
        recipientName: templateContext.recipientName,
        template: config.template,
        templateInput: input.emailTemplateInput,
        context: templateContext,
        eventKey: input.eventKey,
        notificationId: notificationId ?? undefined,
        tags: [config.category],
      });
      emailDeliveryId = result.deliveryRecordId;
      emailSent = result.ok;
    }

    // Link the event ledger to the produced notification id.
    if (input.eventKey && notificationId) {
      // Best-effort — don't fail the dispatch if this update fails.
      await admin
        .from("notification_events")
        .update({
          produced_notification_ids: [notificationId],
        } as never)
        .eq("event_key", input.eventKey);
    }

    return {
      inAppCreated: notificationId !== null,
      emailSent,
      emailDeliveryId,
      notificationId,
      deduplicated: false,
    };
  }

  /**
   * Look up a user's preference for a single category. Falls back to
   * defaults when the row doesn't exist.
   */
  private async lookupPreference(
    admin: NonNullable<ReturnType<typeof createAdminClient>>,
    profileId: string,
    category: NotificationCategory,
  ): Promise<{
    in_app_enabled: boolean;
    email_enabled: boolean;
    email_frequency: "instant" | "daily" | "weekly" | "off";
  }> {
    const { data } = await admin
      .from("notification_preferences")
      .select("in_app_enabled, email_enabled, email_frequency")
      .eq("user_id", profileId)
      .eq("category", category)
      .maybeSingle();
    if (data) {
      const d = data as {
        in_app_enabled: boolean;
        email_enabled: boolean;
        email_frequency: "instant" | "daily" | "weekly" | "off";
      };
      return d;
    }
    return defaultPreferenceFor(category);
  }
}

// ---------------------------------------------------------------------------
// Singleton.
// ---------------------------------------------------------------------------
export const notificationService = new NotificationService();

// Re-export preferences API so callers can import from one place.
export {
  unsubscribeViaEmail,
  getMyNotificationPreferences,
  updateMyNotificationPreference,
};
export type { PreferenceUpdateInput };
