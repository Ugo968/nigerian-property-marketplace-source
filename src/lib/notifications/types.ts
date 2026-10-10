/**
 * Notification type catalogue + preference rules.
 *
 * This module is the single source of truth for:
 *   - Which notification types exist (one row per type for documentation
 *     and type-safe lookup).
 *   - Which category each type belongs to (used to look up preferences).
 *   - Which categories are MANDATORY and cannot be disabled by users
 *     (security, verification, payment).
 *   - Which template id (slug) is used for the email rendering of each
 *     notification type.
 *   - Default priority per type (low / normal / high / critical).
 *
 * Per spec Section 3: the catalogue is intentionally NOT a closed enum
 * at the DB level — `notifications.type` is a free-text column. This
 * module adds application-layer discipline on top.
 *
 * Adding a new notification type = add a row to NOTIFICATION_TYPES below.
 * No DB migration required. No structural changes elsewhere.
 */

import type {
  NotificationCategory,
  NotificationPriority,
  NotificationLevel,
  EmailFrequency,
} from "@/types";

// ---------------------------------------------------------------------------
// NOTIFICATION TYPES
// ---------------------------------------------------------------------------
// Each type has:
//   - category: which preference group governs it
//   - level: in-app visual level (info/success/warning/error)
//   - priority: delivery priority (low/normal/high/critical)
//   - template: email template slug (or null if no email template)
//   - transactional: true = ignores user preference and ALWAYS sends
//     (security, verification result, payment receipt, application decision)
//   - defaultFrequency: ignored when transactional=true (always 'instant')
//   - description: human-readable explanation
//
// `defaultFrequency` is the fallback when the user has no preference row.
// For transactional types it is always 'instant'.
// ---------------------------------------------------------------------------

export interface NotificationTypeConfig {
  /** Stable id, e.g. "application.accepted". NEVER change once shipped. */
  readonly id: string;
  /** Category used to look up the user's preference. */
  readonly category: NotificationCategory;
  /** In-app visual level (info / success / warning / error). */
  readonly level: NotificationLevel;
  /** Delivery priority (low / normal / high / critical). */
  readonly priority: NotificationPriority;
  /** Email template slug, or null when no email should be sent. */
  readonly template: EmailTemplateSlug | null;
  /** True for legally/security-critical notifications — ignores preferences. */
  readonly transactional: boolean;
  /** Default email frequency (instant/daily/weekly/off). */
  readonly defaultFrequency: EmailFrequency;
  /** Human-readable description (docs / admin UI). */
  readonly description: string;
}

export const NOTIFICATION_TYPES = [
  // ---- Account & Security ----
  {
    id: "account.welcome",
    category: "account_security",
    level: "info",
    priority: "normal",
    template: "welcome",
    transactional: true,
    defaultFrequency: "instant",
    description: "Sent on successful signup. Welcomes the user to Shelty.",
  },
  {
    id: "account.email_verified",
    category: "account_security",
    level: "success",
    priority: "high",
    template: "email_verified",
    transactional: true,
    defaultFrequency: "instant",
    description: "Email address verified. Sent on first verification.",
  },
  {
    id: "account.password_changed",
    category: "account_security",
    level: "warning",
    priority: "critical",
    template: "security_event",
    transactional: true,
    defaultFrequency: "instant",
    description: "Password was changed. Always transactional.",
  },
  {
    id: "account.password_reset_requested",
    category: "account_security",
    level: "info",
    priority: "high",
    template: "password_reset",
    transactional: true,
    defaultFrequency: "instant",
    description: "Password reset link requested.",
  },
  {
    id: "account.security_event",
    category: "account_security",
    level: "warning",
    priority: "critical",
    template: "security_event",
    transactional: true,
    defaultFrequency: "instant",
    description: "Generic security-sensitive account event (suspicious login, etc.).",
  },
  {
    id: "account.suspended",
    category: "account_security",
    level: "error",
    priority: "critical",
    template: "security_event",
    transactional: true,
    defaultFrequency: "instant",
    description: "Account was suspended by moderation.",
  },
  {
    id: "account.reactivated",
    category: "account_security",
    level: "success",
    priority: "high",
    template: "security_event",
    transactional: true,
    defaultFrequency: "instant",
    description: "Account suspension was lifted.",
  },

  // ---- Verification ----
  {
    id: "verification.submitted",
    category: "verification",
    level: "info",
    priority: "normal",
    template: "verification_submitted",
    transactional: true,
    defaultFrequency: "instant",
    description: "Verification application submitted for review.",
  },
  {
    id: "verification.under_review",
    category: "verification",
    level: "info",
    priority: "normal",
    template: "verification_status",
    transactional: true,
    defaultFrequency: "instant",
    description: "Verification application is now under admin review.",
  },
  {
    id: "verification.approved",
    category: "verification",
    level: "success",
    priority: "high",
    template: "verification_approved",
    transactional: true,
    defaultFrequency: "instant",
    description: "Verification approved (Bronze / Blue tier).",
  },
  {
    id: "verification.rejected",
    category: "verification",
    level: "warning",
    priority: "high",
    template: "verification_rejected",
    transactional: true,
    defaultFrequency: "instant",
    description: "Verification was rejected.",
  },
  {
    id: "verification.revoked",
    category: "verification",
    level: "error",
    priority: "critical",
    template: "verification_revoked",
    transactional: true,
    defaultFrequency: "instant",
    description: "Previously-granted verification tier was revoked.",
  },

  // ---- Properties ----
  {
    id: "property.published",
    category: "properties",
    level: "success",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Property listing was published (visible to the public).",
  },
  {
    id: "property.updated",
    category: "properties",
    level: "info",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Property listing was updated.",
  },
  {
    id: "property.status_changed",
    category: "properties",
    level: "info",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Property lifecycle status changed (under_offer / rented / sold).",
  },
  {
    id: "property.under_offer",
    category: "properties",
    level: "info",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Property is now under offer.",
  },
  {
    id: "property.rented",
    category: "properties",
    level: "success",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Property was rented out.",
  },
  {
    id: "property.sold",
    category: "properties",
    level: "success",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Property was sold.",
  },
  {
    id: "property.unavailable",
    category: "properties",
    level: "warning",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Property was marked unavailable.",
  },
  {
    id: "property.removed",
    category: "properties",
    level: "warning",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Property was removed by the owner.",
  },
  {
    id: "property.reported",
    category: "properties",
    level: "warning",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Property was reported by a user (owner is notified).",
  },

  // ---- Saved Searches / Alerts ----
  {
    id: "saved_search.match",
    category: "property_alerts",
    level: "info",
    priority: "low",
    template: "saved_search_match",
    transactional: false,
    defaultFrequency: "instant",
    description: "A new property matches a saved search.",
  },
  {
    id: "property.alert",
    category: "property_alerts",
    level: "info",
    priority: "low",
    template: "saved_search_match",
    transactional: false,
    defaultFrequency: "daily",
    description: "Generic property alert (price change / availability).",
  },

  // ---- Applications ----
  {
    id: "application.received",
    category: "applications",
    level: "info",
    priority: "normal",
    template: "application_received",
    transactional: true,
    defaultFrequency: "instant",
    description: "Owner/company received a new agent application.",
  },
  {
    id: "application.submitted",
    category: "applications",
    level: "info",
    priority: "normal",
    template: null,
    transactional: true,
    defaultFrequency: "instant",
    description: "Agent submitted an application (confirmation).",
  },
  {
    id: "application.accepted",
    category: "applications",
    level: "success",
    priority: "high",
    template: "application_accepted",
    transactional: true,
    defaultFrequency: "instant",
    description: "Agent application was accepted by owner.",
  },
  {
    id: "application.declined",
    category: "applications",
    level: "warning",
    priority: "high",
    template: "application_declined",
    transactional: true,
    defaultFrequency: "instant",
    description: "Agent application was declined by owner.",
  },
  {
    id: "application.withdrawn",
    category: "applications",
    level: "info",
    priority: "normal",
    template: null,
    transactional: true,
    defaultFrequency: "instant",
    description: "Agent withdrew an application (owner notified).",
  },
  {
    id: "application.expired",
    category: "applications",
    level: "warning",
    priority: "normal",
    template: null,
    transactional: true,
    defaultFrequency: "instant",
    description: "Application expired (no decision within SLA).",
  },
  {
    id: "representation.established",
    category: "applications",
    level: "success",
    priority: "high",
    template: "representation_established",
    transactional: true,
    defaultFrequency: "instant",
    description: "Agent was granted representation on a property.",
  },

  // ---- Messaging ----
  {
    id: "message.new",
    category: "messaging",
    level: "info",
    priority: "normal",
    template: "new_message",
    transactional: false,
    defaultFrequency: "instant",
    description: "Recipient received a new message. Subject to grouping.",
  },
  {
    id: "conversation.started",
    category: "messaging",
    level: "info",
    priority: "low",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "A new conversation was started with the user.",
  },
  {
    id: "conversation.activity",
    category: "messaging",
    level: "info",
    priority: "low",
    template: null,
    transactional: false,
    defaultFrequency: "daily",
    description: "Grouped conversation activity summary (digest-style).",
  },

  // ---- Reviews ----
  {
    id: "review.received",
    category: "reviews",
    level: "info",
    priority: "normal",
    template: "review_received",
    transactional: false,
    defaultFrequency: "instant",
    description: "Reviewed party received a new review.",
  },
  {
    id: "review.published",
    category: "reviews",
    level: "info",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Review was published (reviewer confirmation).",
  },
  {
    id: "review.flagged",
    category: "reviews",
    level: "warning",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Review was flagged for moderation.",
  },
  {
    id: "review.removed",
    category: "reviews",
    level: "warning",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Review was removed by moderation.",
  },

  // ---- Subscriptions ----
  {
    id: "subscription.started",
    category: "subscriptions",
    level: "success",
    priority: "normal",
    template: "subscription_activated",
    transactional: true,
    defaultFrequency: "instant",
    description: "Subscription activated.",
  },
  {
    id: "subscription.renewed",
    category: "subscriptions",
    level: "info",
    priority: "normal",
    template: null,
    transactional: true,
    defaultFrequency: "instant",
    description: "Subscription was renewed.",
  },
  {
    id: "subscription.cancelled",
    category: "subscriptions",
    level: "warning",
    priority: "high",
    template: "subscription_cancelled",
    transactional: true,
    defaultFrequency: "instant",
    description: "Subscription was cancelled.",
  },
  {
    id: "subscription.expiring",
    category: "subscriptions",
    level: "info",
    priority: "normal",
    template: "subscription_expiring",
    transactional: true,
    defaultFrequency: "instant",
    description: "Subscription is about to expire (renewal reminder).",
  },
  {
    id: "subscription.expired",
    category: "subscriptions",
    level: "warning",
    priority: "high",
    template: null,
    transactional: true,
    defaultFrequency: "instant",
    description: "Subscription expired.",
  },
  {
    id: "subscription.payment_failed",
    category: "subscriptions",
    level: "error",
    priority: "high",
    template: "subscription_payment_failed",
    transactional: true,
    defaultFrequency: "instant",
    description: "Subscription renewal payment failed.",
  },
  {
    id: "subscription.downgraded",
    category: "subscriptions",
    level: "info",
    priority: "normal",
    template: null,
    transactional: true,
    defaultFrequency: "instant",
    description: "Subscription was downgraded (tier decreased).",
  },
  {
    id: "subscription.upgraded",
    category: "subscriptions",
    level: "success",
    priority: "normal",
    template: null,
    transactional: true,
    defaultFrequency: "instant",
    description: "Subscription was upgraded (tier increased).",
  },

  // ---- Payments ----
  {
    id: "payment.initiated",
    category: "payments",
    level: "info",
    priority: "normal",
    template: null,
    transactional: true,
    defaultFrequency: "instant",
    description: "Payment was initiated (pending provider verification).",
  },
  {
    id: "payment.successful",
    category: "payments",
    level: "success",
    priority: "high",
    template: "payment_successful",
    transactional: true,
    defaultFrequency: "instant",
    description: "Payment was verified successful by the provider webhook.",
  },
  {
    id: "payment.failed",
    category: "payments",
    level: "error",
    priority: "high",
    template: "payment_failed",
    transactional: true,
    defaultFrequency: "instant",
    description: "Payment failed (provider-declined or verification failed).",
  },
  {
    id: "payment.refunded",
    category: "payments",
    level: "info",
    priority: "high",
    template: "payment_refunded",
    transactional: true,
    defaultFrequency: "instant",
    description: "Payment was refunded.",
  },

  // ---- Featured Listings ----
  {
    id: "promotion.submitted",
    category: "featured",
    level: "info",
    priority: "normal",
    template: "promotion_submitted",
    transactional: false,
    defaultFrequency: "instant",
    description: "Featured-listing promotion was submitted.",
  },
  {
    id: "promotion.approved",
    category: "featured",
    level: "success",
    priority: "normal",
    template: "promotion_approved",
    transactional: false,
    defaultFrequency: "instant",
    description: "Promotion was approved and is now live.",
  },
  {
    id: "promotion.rejected",
    category: "featured",
    level: "warning",
    priority: "normal",
    template: "promotion_rejected",
    transactional: false,
    defaultFrequency: "instant",
    description: "Promotion was rejected.",
  },
  {
    id: "promotion.started",
    category: "featured",
    level: "info",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Promotion started (live on listings).",
  },
  {
    id: "promotion.expiring",
    category: "featured",
    level: "info",
    priority: "normal",
    template: "promotion_expiring",
    transactional: false,
    defaultFrequency: "instant",
    description: "Promotion is about to expire.",
  },
  {
    id: "promotion.completed",
    category: "featured",
    level: "info",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Promotion completed its run.",
  },
  {
    id: "promotion.paused",
    category: "featured",
    level: "warning",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Promotion was paused (admin or owner action).",
  },

  // ---- Advertising ----
  {
    id: "campaign.submitted",
    category: "advertising",
    level: "info",
    priority: "normal",
    template: "campaign_submitted",
    transactional: false,
    defaultFrequency: "instant",
    description: "Advertising campaign was submitted.",
  },
  {
    id: "campaign.payment_successful",
    category: "advertising",
    level: "success",
    priority: "normal",
    template: null,
    transactional: true,
    defaultFrequency: "instant",
    description: "Campaign budget payment was verified.",
  },
  {
    id: "campaign.pending_review",
    category: "advertising",
    level: "info",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Campaign is pending admin review.",
  },
  {
    id: "campaign.approved",
    category: "advertising",
    level: "success",
    priority: "normal",
    template: "campaign_approved",
    transactional: false,
    defaultFrequency: "instant",
    description: "Campaign was approved.",
  },
  {
    id: "campaign.rejected",
    category: "advertising",
    level: "warning",
    priority: "normal",
    template: "campaign_rejected",
    transactional: false,
    defaultFrequency: "instant",
    description: "Campaign was rejected.",
  },
  {
    id: "campaign.started",
    category: "advertising",
    level: "info",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Campaign started serving impressions.",
  },
  {
    id: "campaign.paused",
    category: "advertising",
    level: "warning",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Campaign was paused.",
  },
  {
    id: "campaign.expiring",
    category: "advertising",
    level: "info",
    priority: "normal",
    template: "campaign_expiring",
    transactional: false,
    defaultFrequency: "instant",
    description: "Campaign is about to exhaust its budget / end date.",
  },
  {
    id: "campaign.completed",
    category: "advertising",
    level: "info",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Campaign completed its run.",
  },

  // ---- Property transactions (Prompt 18 — workflow notifications) ----
  // These are NOT transactional in the security sense (user can opt
  // out via preferences), but the dispatcher treats them as high-
  // priority because they relate to a deal in progress.
  {
    id: "transaction.inquiry",
    category: "properties",
    level: "info",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "New transaction inquiry on a property you own/manage.",
  },
  {
    id: "transaction.inspection_proposed",
    category: "properties",
    level: "info",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "An inspection was proposed for a transaction.",
  },
  {
    id: "transaction.inspection_confirmed",
    category: "properties",
    level: "success",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "An inspection was confirmed by the other party.",
  },
  {
    id: "transaction.inspection_rescheduled",
    category: "properties",
    level: "info",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "A reschedule was requested.",
  },
  {
    id: "transaction.inspection_cancelled",
    category: "properties",
    level: "warning",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "An inspection was cancelled.",
  },
  {
    id: "transaction.inspection_completed",
    category: "properties",
    level: "success",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "An inspection was marked completed — negotiation can start.",
  },
  {
    id: "transaction.offer_submitted",
    category: "properties",
    level: "info",
    priority: "high",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "An offer was submitted on a transaction.",
  },
  {
    id: "transaction.offer_accepted",
    category: "properties",
    level: "success",
    priority: "high",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "An offer was accepted — transaction is in offer-accepted stage.",
  },
  {
    id: "transaction.offer_declined",
    category: "properties",
    level: "warning",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "An offer was declined (or superseded by an accepted offer).",
  },
  {
    id: "transaction.completed",
    category: "properties",
    level: "success",
    priority: "high",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Transaction completed (user-reported, not platform-verified).",
  },
  {
    id: "transaction.cancelled",
    category: "properties",
    level: "warning",
    priority: "normal",
    template: null,
    transactional: false,
    defaultFrequency: "instant",
    description: "Transaction was cancelled / withdrawn / declined.",
  },

  // ---- Marketing (NOT transactional — user can fully opt out) ----
  {
    id: "marketing.promotional",
    category: "marketing",
    level: "info",
    priority: "low",
    template: null,
    transactional: false,
    defaultFrequency: "weekly",
    description: "Promotional / marketing communication. Fully unsubscribe-able.",
  },
] as const satisfies readonly NotificationTypeConfig[];

export type NotificationTypeId = (typeof NOTIFICATION_TYPES)[number]["id"];

// ---------------------------------------------------------------------------
// Lookup map — O(1) access by type id.
// ---------------------------------------------------------------------------
const TYPE_MAP: ReadonlyMap<string, NotificationTypeConfig> = new Map(
  NOTIFICATION_TYPES.map((t) => [t.id, t] as const),
);

/**
 * Returns the config for a notification type, or null if unknown.
 * Use this to look up category / priority / template / transactional flag.
 */
export function getNotificationTypeConfig(
  typeId: string,
): NotificationTypeConfig | null {
  return TYPE_MAP.get(typeId) ?? null;
}

// ---------------------------------------------------------------------------
// MANDATORY categories — cannot be disabled by the user.
// Per spec Section 13: "Do not allow users to disable mandatory security
// notifications."
// ---------------------------------------------------------------------------
export const MANDATORY_CATEGORIES: ReadonlySet<NotificationCategory> = new Set([
  "account_security",
  "verification",
  "applications",
  "subscriptions",
  "payments",
]);

/**
 * Returns true if a category is mandatory (cannot be disabled).
 */
export function isMandatoryCategory(category: NotificationCategory): boolean {
  return MANDATORY_CATEGORIES.has(category);
}

// ---------------------------------------------------------------------------
// Email templates.
// ---------------------------------------------------------------------------
export const EMAIL_TEMPLATES = [
  "welcome",
  "email_verified",
  "security_event",
  "password_reset",
  "verification_submitted",
  "verification_status",
  "verification_approved",
  "verification_rejected",
  "verification_revoked",
  "application_received",
  "application_accepted",
  "application_declined",
  "representation_established",
  "new_message",
  "saved_search_match",
  "review_received",
  "subscription_activated",
  "subscription_cancelled",
  "subscription_expiring",
  "subscription_payment_failed",
  "payment_successful",
  "payment_failed",
  "payment_refunded",
  "promotion_submitted",
  "promotion_approved",
  "promotion_rejected",
  "promotion_expiring",
  "campaign_submitted",
  "campaign_approved",
  "campaign_rejected",
  "campaign_expiring",
] as const;

export type EmailTemplateSlug = (typeof EMAIL_TEMPLATES)[number];

/**
 * Categories that should NOT have a per-frequency preference (security,
 * payments, etc. are always 'instant'). Used by the preferences UI to
 * hide the frequency selector.
 */
export function categorySupportsFrequency(
  category: NotificationCategory,
): boolean {
  return !MANDATORY_CATEGORIES.has(category);
}

/**
 * Default preference row when a user has not explicitly configured one.
 */
export function defaultPreferenceFor(
  category: NotificationCategory,
): {
  in_app_enabled: boolean;
  email_enabled: boolean;
  email_frequency: EmailFrequency;
} {
  if (MANDATORY_CATEGORIES.has(category)) {
    // Mandatory = always on, instant.
    return {
      in_app_enabled: true,
      email_enabled: true,
      email_frequency: "instant",
    };
  }
  // Optional categories default to on (instant in-app + email) so users
  // see activity by default; they can opt down to digest / off later.
  if (category === "marketing") {
    return {
      in_app_enabled: false,
      email_enabled: true,
      email_frequency: "weekly",
    };
  }
  return {
    in_app_enabled: true,
    email_enabled: true,
    email_frequency: "instant",
  };
}
