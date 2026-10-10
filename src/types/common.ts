/**
 * General-purpose status / lifecycle types shared across the platform.
 * Strongly typed — never use arbitrary strings.
 */

/**
 * Generic moderation status — used for reports, reviews, listings, etc.
 */
export const MODERATION_STATUSES = [
  "active",
  "flagged",
  "under_review",
  "actioned",
  "dismissed",
  "removed",
] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

/**
 * Generic publishable status for any user-generated content.
 */
export const PUBLISH_STATUSES = [
  "draft",
  "pending_review",
  "published",
  "archived",
] as const;
export type PublishStatus = (typeof PUBLISH_STATUSES)[number];

/**
 * Notification levels for the in-app notification center.
 */
export const NOTIFICATION_LEVELS = [
  "info",
  "success",
  "warning",
  "error",
] as const;
export type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number];

/**
 * Notification priority — influences presentation order and delivery.
 * Security-critical events are always 'critical' and cannot be muted.
 */
export const NOTIFICATION_PRIORITIES = [
  "low",
  "normal",
  "high",
  "critical",
] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

/**
 * Notification channels supported by the dispatcher. Future channels
 * (sms, push) can be added without restructuring existing flows.
 */
export const NOTIFICATION_CHANNELS = [
  "in_app",
  "email",
  "sms",
  "push",
] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * Notification category groups — used for preference management. Each
 * notification type maps to exactly one category. The category drives
 * which preference row controls it.
 */
export const NOTIFICATION_CATEGORIES = [
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
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * Email frequency for digest-style categories. Categories that are
 * 'transactional' (security, payment, verification) ignore this and
 * always send instantly.
 */
export const EMAIL_FREQUENCIES = [
  "instant",
  "daily",
  "weekly",
  "off",
] as const;
export type EmailFrequency = (typeof EMAIL_FREQUENCIES)[number];

/**
 * Email delivery record statuses. Matches the SQL CHECK constraint on
 * `email_delivery_records.status`.
 */
export const EMAIL_DELIVERY_STATUSES = [
  "pending",
  "sent",
  "delivered",
  "failed",
  "suppressed",
] as const;
export type EmailDeliveryStatus = (typeof EMAIL_DELIVERY_STATUSES)[number];

/**
 * Error categories for email delivery failures. Used to classify retry
 * vs non-retry errors at the service boundary.
 */
export const EMAIL_ERROR_CATEGORIES = [
  "invalid_email",
  "suppressed_address",
  "provider_error",
  "timeout",
  "rate_limited",
  "network",
  "unknown",
] as const;
export type EmailErrorCategory = (typeof EMAIL_ERROR_CATEGORIES)[number];

/**
 * Alert frequency levels — drives how the saved-search matcher delivers
 * notifications. Tier mapping lives in lib/capabilities.
 */
export const ALERT_LEVELS = [
  "off",
  "basic", // daily digest
  "advanced", // hourly digest
  "instant", // push on match
  "priority", // instant + email + queue jump
] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

/**
 * Report reasons — used by both the user reporting flow and the admin
 * moderation queue.
 */
export const REPORT_REASONS = [
  "fake_listing",
  "scam_attempt",
  "wrong_property_info",
  "already_sold_rented",
  "fraudulent_agent",
  "fraudulent_owner",
  "harassment",
  "inappropriate_content",
  "suspicious_payment_request",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  fake_listing: "Fake Listing",
  scam_attempt: "Scam Attempt",
  wrong_property_info: "Wrong Property Information",
  already_sold_rented: "Already Sold / Rented",
  fraudulent_agent: "Fraudulent Agent",
  fraudulent_owner: "Fraudulent Owner",
  harassment: "Harassment",
  inappropriate_content: "Inappropriate Content",
  suspicious_payment_request: "Suspicious Payment Request",
  other: "Other",
};

/**
 * Report status (admin moderation queue).
 * Note: the `reports` table column uses ('open', 'investigating',
 * 'resolved', 'dismissed', 'escalated') — these are the migration-level
 * values. The ReportStatus type here is the canonical application-layer
 * union; the existing reports migration used a different naming for
 * historical reasons. The admin fetchers translate between the two.
 */
export const REPORT_STATUSES = [
  "open",
  "in_review",
  "resolved",
  "dismissed",
  "escalated",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Transaction workflow statuses (spec Section 7).
 * Forward path: inquiry → inspection_scheduled → inspection_completed
 *              → negotiation → offer_made → offer_accepted
 *              → transaction_completed
 * Terminal: cancelled / withdrawn / expired / declined
 */
export const TRANSACTION_STATUSES = [
  "inquiry",
  "inspection_scheduled",
  "inspection_completed",
  "negotiation",
  "offer_made",
  "offer_accepted",
  "transaction_completed",
  "cancelled",
  "withdrawn",
  "expired",
  "declined",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/**
 * Inspection sub-state machine (spec Section 11).
 */
export const INSPECTION_STATUSES = [
  "proposed",
  "confirmed",
  "reschedule_requested",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

/**
 * Offer statuses (spec Section 17).
 * draft is unused in V1 (offers go straight to submitted).
 * Superseded = a counter-offer replaced this one (spec Section 19).
 */
export const OFFER_STATUSES = [
  "draft",
  "submitted",
  "accepted",
  "declined",
  "withdrawn",
  "expired",
  "superseded",
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/**
 * Roles a profile can have within a transaction (spec Section 3).
 */
export const TRANSACTION_PARTICIPANT_ROLES = [
  "customer",
  "owner",
  "listing_creator",
  "managing_agent",
  "managing_company",
  "agent_assistant",
] as const;
export type TransactionParticipantRole = (typeof TRANSACTION_PARTICIPANT_ROLES)[number];
