# NOTIFICATIONS

This document records the centralized Notifications & Email Alerts system
implemented in Prompt 16.

## Architecture overview

The notification system is built as a single reusable service that
every feature module calls. There is NO duplicated notification logic
in auth, applications, messaging, payments, verification, featured,
advertising, reviews, properties, or saved searches — every feature
calls `notificationService.dispatch(...)` and lets the dispatcher
resolve recipients, preferences, idempotency, and email delivery.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Feature modules                                                   │
│  (auth, applications, messaging, payments, verification,          │
│   featured, advertising, reviews, properties, saved-search matcher)│
└────────────────────────────┬────────────────────────────────────────┘
                             │ calls
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  NotificationService (dispatcher.ts) — the central singleton       │
│  - Validates notification type against the catalogue               │
│  - Resolves recipient profile + email from auth.users              │
│  - Looks up the recipient's preference for the category           │
│  - Honours mandatory categories (always send)                     │
│  - Honours opt-outs (skip for non-mandatory categories)           │
│  - Inserts event into notification_events ledger (idempotency)     │
│  - Calls dispatch_notification() SECURITY DEFINER (RLS-safe)       │
│  - Calls sendEmail() for the email channel                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
        ┌────────────────────┴───────────────────────┐
        ▼                                           ▼
┌─────────────────────────┐               ┌─────────────────────────┐
│  In-app channel         │               │  Email channel          │
│  notifications table    │               │  email-service.ts       │
│  + dispatch_notification│               │  + email-provider.ts   │
│    SECURITY DEFINER     │               │  + email-renderer.ts   │
│  + Realtime publication │               │  + email_delivery_records│
└─────────────────────────┘               └─────────────────────────┘
```

## Database schema (migration 0023)

### `notifications` table (extended)

The existing `notifications` table from migration 0015 was extended
with the columns required for the centralized architecture:

| Column | Type | Purpose |
|---|---|---|
| `priority` | text | low / normal / high / critical — drives presentation order |
| `channel` | text | in_app / email / sms / push — one row per (recipient, channel) |
| `related_entity_type` | text | normalised related entity (e.g. "payment", "property") |
| `related_entity_id` | uuid | normalised related entity id |
| `event_key` | text | stable idempotency key — partial unique index enforces dedup |
| `metadata` | jsonb | free-form metadata bag (sanitised — no secrets) |
| `expires_at` | timestamptz | optional expiry for cleanup eligibility |

**Partial unique index**: `(recipient_id, event_key, channel) WHERE event_key IS NOT NULL`
ensures duplicate dispatch attempts (retried webhooks, retried workers)
do not produce duplicate notification rows.

### `notification_preferences` table

Per-user per-category preferences:

| Column | Type | Purpose |
|---|---|---|
| `user_id` | uuid | recipient profile |
| `category` | text | one of the 12 NotificationCategory values |
| `in_app_enabled` | boolean | in-app channel toggle |
| `email_enabled` | boolean | email channel toggle |
| `email_frequency` | text | instant / daily / weekly / off |

RLS: owner-only (read + update + insert).

### `notification_events` table (server-only)

Idempotency ledger. RLS enabled with NO client policies = server-only
access. Inserted by the dispatcher BEFORE the notification row, so even
a crash mid-dispatch can be detected on retry.

**Unique index on `event_key`**: a single event key can only be
processed once across the entire system.

### `email_delivery_records` table (server-only)

Outbound email tracking. RLS enabled with NO client policies.

| Column | Type | Purpose |
|---|---|---|
| `notification_id` | uuid | linked notification (nullable) |
| `event_key` | text | idempotency key |
| `recipient_id` | uuid | recipient profile (denormalised) |
| `recipient_email` | text | email address used |
| `template` | text | template slug |
| `provider` | text | resend / stub |
| `provider_message_id` | text | provider's message id |
| `status` | text | pending / sent / delivered / failed / suppressed |
| `error_category` | text | classified failure reason |
| `error_message` | text | sanitised error message |
| `attempt_count` | int | retry counter |
| `next_retry_at` | timestamptz | scheduled retry time |
| `sent_at` / `failed_at` | timestamptz | lifecycle timestamps |

### SECURITY DEFINER functions

| Function | Purpose |
|---|---|
| `dispatch_notification(...)` | Inserts a notification row with idempotency checking. Rejects absolute URLs in href (defence-in-depth). Returns NULL when the event_key already exists. |
| `mark_notification_read(uuid)` | Sets `read_at` only if the caller is the recipient. |
| `mark_notification_unread(uuid)` | Clears `read_at` for the caller's own notification. |
| `mark_all_notifications_read()` | Bulk-mark all caller's unread notifications as read. |
| `dismiss_notification(uuid)` | Soft-deletes (sets `dismissed_at`) for the caller's own notification. |

## Notification type catalogue

The catalogue lives in `src/lib/notifications/types.ts`. It defines:

- 50+ notification types covering all 12 categories
- The category group each type belongs to
- The in-app visual level (info / success / warning / error)
- The delivery priority (low / normal / high / critical)
- The email template slug (or null when no email)
- Whether the type is transactional (ignores user preferences)
- The default email frequency for the category

Adding a new notification type = add a row to `NOTIFICATION_TYPES`.
No database migration required. The `notifications.type` column is
free-text — the catalogue adds application-layer discipline.

### Mandatory categories

Per spec Section 13, the following categories CANNOT be disabled by
users:

- `account_security`
- `verification`
- `applications`
- `subscriptions`
- `payments`

The preferences server action refuses to disable mandatory categories
or set their frequency to anything other than `instant`.

## Email provider abstraction

`src/lib/notifications/email-provider.ts` defines the `EmailProvider`
interface with a Resend implementation and a Stub fallback for dev.

Switching providers = implement the interface + branch in
`selectProvider()`. The application talks to `getEmailProvider()` only.

**Critical**: This module is server-only. Never import from a client
component. It reads `EMAIL_PROVIDER_API_KEY` which is not
`NEXT_PUBLIC_*`.

## Email templates

`src/lib/notifications/email-renderer.ts` renders 31 templates:

- Account: welcome, email_verified, security_event, password_reset
- Verification: submitted, status, approved, rejected, revoked
- Applications: received, accepted, declined, representation_established
- Messaging: new_message
- Saved searches: saved_search_match
- Reviews: review_received
- Subscriptions: activated, cancelled, expiring, payment_failed
- Payments: successful, failed, refunded
- Featured listings: submitted, approved, rejected, expiring
- Advertising: campaign submitted/approved/rejected/expiring

Templates are mobile-responsive, brand-consistent (Shelty teal
accent), include a clear CTA, and show the unsubscribe link ONLY for
non-mandatory categories.

### Email security (spec Section 38)

- All user-generated text (property title, message preview, review
  body, advertiser headline, etc.) is HTML-escaped before
  interpolation.
- CTA URLs are restricted to relative paths on our origin. Absolute
  URLs are forbidden.
- Plain-text fallback is always generated (strip HTML tags).
- Unsubscribe links are personalised per (email, category) and
  cannot modify another user's preferences.

## Email service (queue + retries)

`src/lib/notifications/email-service.ts` is the queue abstraction:

1. Insert an `email_delivery_records` row with status=pending.
2. Render the template via the email-renderer.
3. Call the email provider.
4. On success: update the record to status=sent.
5. On failure: classify the error.
   - Retryable (provider_error, timeout, rate_limited, network,
     unknown): schedule a retry. Max 3 attempts. Delays: 0s / 30s / 5m.
   - Permanent (invalid_email, suppressed_address): mark failed /
     suppressed, do not retry.
6. After retries are exhausted: mark failed.

The `drainPendingEmailRetries()` function is a future-worker hook for
a cron-driven retry queue. V1 runs retries inline.

## Saved-search alert flow

`src/lib/notifications/saved-search-matcher.ts`:

1. Triggered by `publishProperty` (instant path) OR by the
   `/api/cron/saved-search-matcher` endpoint (digest path).
2. Loads the newly published property (must be `available`).
3. Loads all active `saved_searches`.
4. Coarse SQL filter (transaction_type, property_type, state, city,
   price range, bedrooms).
5. For each match:
   - Skip the property owner's own saved searches.
   - Cap the alert level to the user's plan (downgrade if exceeded).
   - Insert a `property_alerts` row (UNIQUE constraint prevents
     duplicates).
   - For `instant` / `priority` levels: dispatch a
     `saved_search.match` notification immediately.
   - For `daily` / `weekly` levels: leave the property_alerts row
     for the digest worker (next prompt).

## Idempotency

The same event should never produce duplicate notifications. Three
layers of defence:

1. **Event ledger**: The dispatcher inserts a row into
   `notification_events` with a unique `event_key` BEFORE
   dispatching. Duplicate inserts are caught and treated as
   "already processed".
2. **Partial unique index**: Even if the ledger insert fails, the
   `notifications` table has a partial unique index on
   `(recipient_id, event_key, channel) WHERE event_key IS NOT NULL`.
   The `dispatch_notification()` SECURITY DEFINER catches the
   `unique_violation` exception and returns NULL.
3. **Email provider idempotency key**: Passed to the provider
   (when supported) so the provider deduplicates on their side too.

## Realtime

The `notifications` table is added to the `supabase_realtime`
publication. The `NotificationBell` component subscribes to INSERT
events and refetches the unread count + recent list when a new
notification arrives.

Per spec Section 37 (offline / reconnect behavior): the bell also
polls every 60 seconds as a fallback. Database state remains
authoritative — refresh restores the correct count.

## API routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/notifications` | Paginated list (cursor-based) |
| GET | `/api/notifications/unread-count` | Lightweight count for the bell badge |
| PATCH | `/api/notifications/[id]` | Mark read / unread (uses SECURITY DEFINER) |
| DELETE | `/api/notifications/[id]` | Soft-delete (dismiss) |
| POST | `/api/notifications/mark-all-read` | Bulk mark read |
| GET | `/api/notifications/preferences` | Get all preferences (defaults filled) |
| PATCH | `/api/notifications/preferences` | Update one preference (validates mandatory) |
| GET | `/api/notifications/unsubscribe` | One-click unsubscribe (HTML response) |
| POST | `/api/cron/saved-search-matcher` | Run the matcher for a list of property ids |

All routes are server-side. The client never submits arbitrary
recipient IDs, notification types, or titles — those are always
resolved server-side from the action that triggered the notification.

## RLS strategy

| Table | RLS | Client policy |
|---|---|---|
| `notifications` | enabled | owner-only (read, update, delete) |
| `notification_preferences` | enabled | owner-only (read, update, insert) |
| `notification_events` | enabled | NO policy (server-only) |
| `email_delivery_records` | enabled | NO policy (server-only) |

The dispatcher uses the service-role admin client (bypasses RLS) but
ALWAYS resolves the recipient id from the trusted server-side context
(the action that triggered the notification), never from client
input.

## Future extension points

- **SMS / push channels**: Add to the `NotificationChannel` enum in
  `src/types/common.ts` and add a column-aware renderer. The
  dispatcher already supports multi-channel fan-out per event.
- **Digest worker**: A scheduled job that drains `property_alerts`
  rows with `delivery_status = pending` and batches them into
  per-user digest emails (daily / weekly).
- **Email queue**: Replace inline `sendEmail()` with a background
  job queue. The `email_delivery_records` table is the queue's
  source of truth — the worker drains rows with `next_retry_at`
  elapsed.
- **Multi-provider routing**: Branch in `selectProvider()` based on
  template, recipient geography, or provider health.
- **Notification retention**: A cron job that archives notifications
  past their `expires_at` (and past a hard retention window for
  non-expiring security-critical ones).
- **Admin moderation queue**: Notification volume monitoring +
  per-user rate-limit caps.
- **Push notifications**: Web Push API integration via the existing
  provider abstraction. Same dispatcher fan-out pattern.

## Limitations (V1)

- The digest worker is not yet auto-scheduled — the property_alerts
  rows accumulate for daily/weekly alerts until the worker is wired
  up in a future prompt.
- The email retry worker is inline (V1). A real queue is the
  intended V2 architecture.
- The unsubscribe link uses email + category query params. A signed
  JWT token version is a future enhancement.
- No push / SMS / WhatsApp channels implemented (per spec Section
  44 — these belong to later prompts).
- No marketing newsletter platform (per spec Section 44).
- The notification centre does not yet support per-type filtering
  (only per-category). Future enhancement.
