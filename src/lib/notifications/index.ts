/**
 * Notifications module barrel.
 *
 * Single import surface for everything notification-related:
 *   import { notificationService, sendEmail, getMyNotificationPreferences, ... } from "@/lib/notifications";
 *
 * Modules outside this folder should NOT import from individual files.
 */

// Dispatcher (the central NotificationService singleton).
export { notificationService } from "./dispatcher";
export type {
  DispatchNotificationInput,
  DispatchResult,
} from "./dispatcher";

// Type catalogue + preference rules.
export {
  NOTIFICATION_TYPES,
  EMAIL_TEMPLATES,
  MANDATORY_CATEGORIES,
  getNotificationTypeConfig,
  isMandatoryCategory,
  defaultPreferenceFor,
  categorySupportsFrequency,
} from "./types";
export type {
  NotificationTypeConfig,
  EmailTemplateSlug,
  NotificationTypeId,
} from "./types";

// Email provider abstraction.
export {
  getEmailProvider,
  getFromAddress,
} from "./email-provider";
export type {
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from "./email-provider";

// Email service (queue + retries + delivery records).
export {
  sendEmail,
  drainPendingEmailRetries,
  isEmailConfigured,
  RETRYABLE_ERRORS,
} from "./email-service";
export type {
  SendEmailInput,
  SendEmailResult,
} from "./email-service";

// Email template renderer.
export { renderEmail } from "./email-renderer";
export type {
  EmailContent,
  TemplateContext,
} from "./email-renderer";

// Preferences server actions.
export {
  getMyNotificationPreferences,
  updateMyNotificationPreference,
  unsubscribeViaEmail,
} from "./preferences";
export type {
  PreferencesResult,
  UpdatePreferenceResult,
  PreferenceUpdateInput,
} from "./preferences";

// Saved-search matcher.
export {
  matchPropertyToSavedSearches,
} from "./saved-search-matcher";
export type { MatcherResult } from "./saved-search-matcher";
