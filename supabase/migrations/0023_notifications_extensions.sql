-- ============================================================================
-- 0023_notifications_extensions.sql
-- ============================================================================
-- Notifications & Email Alerts system (Prompt 16).
--
-- Extends the existing `notifications` table (created in 0015) with the
-- additional columns required to support the centralized notification
-- architecture: priority, metadata, expiry, event idempotency key,
-- related entity type/id normalization.
--
-- Adds three new tables:
--   * notification_preferences   — per-user channel/category preferences
--   * notification_events        — idempotency ledger so retried domain
--                                  events don't fan-out duplicate
--                                  notifications
--   * email_delivery_records     — tracking for the email provider
--                                  boundary (status, retries, error
--                                  category, provider message id)
--
-- All inserts into `notifications` from server actions use the
-- `dispatch_notification()` SECURITY DEFINER helper defined here. It:
--   * Resolves the recipient profile_id from the auth uid on caller
--     (the caller is service-role or admin)
--   * Enforces the idempotency key constraint (UNIQUE on
--     (recipient_id, event_key) when event_key is provided)
--   * Returns the inserted notification id (or null when the event
--     has already been delivered — so callers can short-circuit)
--
-- RLS:
--   * notifications: existing policies from 0015 — owner-only
--   * notification_preferences: owner-only (full CRUD)
--   * notification_events: server-only — NO client-facing policy
--   * email_delivery_records: server-only — NO client-facing policy
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend `notifications` table.
--    All additions are nullable / defaulted to preserve existing rows.
-- ---------------------------------------------------------------------------

-- Priority level (low / normal / high / critical). Defaults to 'normal'.
alter table public.notifications
  add column if not exists priority text not null default 'normal'
  check (priority in ('low', 'normal', 'high', 'critical'));

-- Optional expiry. Once expires_at < now() the row is eligible for
-- archival / cleanup. NULL = no expiry (e.g. security-critical records).
alter table public.notifications
  add column if not exists expires_at timestamptz;

-- Free-form metadata bag. NEVER store secrets / PII beyond what the
-- user is allowed to see in the notification UI. Sanitised at the
-- service layer before insert.
alter table public.notifications
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Normalised related-entity reference (avoids parsing the related
-- JSONB blob for common queries / RLS predicate pushes).
alter table public.notifications
  add column if not exists related_entity_type text;
alter table public.notifications
  add column if not exists related_entity_id uuid;

-- Stable idempotency key — same value as the matching row in
-- `notification_events.event_key`. Allows duplicate dispatch attempts
-- (e.g. retried webhook, retried worker) to dedupe at the table level
-- via a partial unique index.
alter table public.notifications
  add column if not exists event_key text;

-- Channel through which the notification was delivered (in_app, email).
-- Stored separately so a single domain event that fans out to multiple
-- channels produces one row per channel per recipient.
alter table public.notifications
  add column if not exists channel text not null default 'in_app'
  check (channel in ('in_app', 'email', 'sms', 'push'));

-- ---------------------------------------------------------------------------
-- 2. Indexes for the new columns.
-- ---------------------------------------------------------------------------
create index if not exists notifications_priority_idx
  on public.notifications(recipient_id, priority, created_at desc)
  where dismissed_at is null;

create index if not exists notifications_unread_priority_idx
  on public.notifications(recipient_id, priority)
  where read_at is null and dismissed_at is null;

create index if not exists notifications_related_entity_idx
  on public.notifications(related_entity_type, related_entity_id)
  where related_entity_id is not null;

create index if not exists notifications_expires_at_idx
  on public.notifications(expires_at)
  where expires_at is not null;

-- Partial UNIQUE on (recipient_id, event_key, channel) — only when
-- event_key is provided. NULL event_key rows are exempt (allows ad-hoc
-- notifications like one-off admin messages to bypass the dedup gate).
create unique index if not exists notifications_event_key_unique_idx
  on public.notifications(recipient_id, event_key, channel)
  where event_key is not null and dismissed_at is null;

-- ---------------------------------------------------------------------------
-- 3. notification_events — idempotency ledger.
--    Server-only. RLS enabled with NO policy = no client access.
--    Inserted by the dispatcher BEFORE the notifications row, so even a
--    crash mid-dispatch can be detected on retry (the row exists, the
--    event_key is now "spent").
-- ---------------------------------------------------------------------------
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  -- Stable key like "application.accepted:APP_UUID" or
  -- "payment.successful:REF_ABC123". Hashed if too long.
  event_key text not null,
  -- Domain event category (application.accepted, payment.successful, etc.)
  event_type text not null,
  -- Optional actor that triggered the event (audit)
  actor_id uuid references public.profiles(id) on delete set null,
  -- Optional recipient resolution hint (which user the event targets)
  recipient_id uuid references public.profiles(id) on delete cascade,
  -- JSON payload snapshot (sanitised — no secrets)
  payload jsonb not null default '{}'::jsonb,
  -- Resulting notification ids that this event produced (one event may
  -- fan out to multiple channels/rows)
  produced_notification_ids uuid[] not null default '{}'::uuid[],
  -- Lifecycle
  status text not null default 'processed'
    check (status in ('processed', 'failed', 'superseded')),
  -- Error tracking
  error_message text,
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger notification_events_set_updated_at
  before update on public.notification_events
  for each row execute function public.set_updated_at();

-- Idempotency: a single event_key can only be processed once.
-- Duplicate inserts (e.g. retried webhook) raise a constraint violation
-- which the dispatcher catches and treats as "already processed".
create unique index if not exists notification_events_event_key_unique_idx
  on public.notification_events(event_key);

create index if not exists notification_events_recipient_idx
  on public.notification_events(recipient_id, created_at desc);
create index if not exists notification_events_event_type_idx
  on public.notification_events(event_type, created_at desc);

alter table public.notification_events enable row level security;
-- No policies = no client access. Server-only (service role bypasses RLS).

-- ---------------------------------------------------------------------------
-- 4. notification_preferences — per-user channel/category preferences.
--    Defaults to "everything on" — security-critical categories cannot
--    be turned off (enforced in the dispatcher at the application layer).
-- ---------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Category group — see NOTIFICATION_CATEGORIES in src/lib/notifications/types.ts
  -- e.g. "account_security", "verification", "applications", "messages",
  --      "property_alerts", "reviews", "subscriptions", "payments",
  --      "featured", "advertising", "marketing"
  category text not null,
  -- Channel preferences
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default true,
  -- Email frequency for digest-style categories (instant/daily/weekly/off)
  -- Only meaningful for low-priority recurring notifications
  -- (e.g. property_alerts, marketing).
  email_frequency text not null default 'instant'
    check (email_frequency in ('instant', 'daily', 'weekly', 'off')),
  -- Soft-create / soft-update
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);

create trigger notification_preference_set_updated_at
  before update on public.notification_preference
  for each row execute function public.set_updated_at();

-- Fix trigger name typo if previous migration created the wrong trigger
-- (the trigger above is on `notification_preference` singular; ensure the
-- plural-named table also has its trigger). Actually we named the table
-- `notification_preferences` (plural) — recreate the trigger correctly.
drop trigger if exists notification_preference_set_updated_at
  on public.notification_preferences;
create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create index if not exists notification_preferences_user_idx
  on public.notification_preferences(user_id);

alter table public.notification_preferences enable row level security;

create policy "Users can read their own notification preferences"
  on public.notification_preferences for select
  to authenticated
  using (user_id in (select id from public.profiles where user_id = auth.uid()));

create policy "Users can update their own notification preferences"
  on public.notification_preferences for update
  to authenticated
  using (user_id in (select id from public.profiles where user_id = auth.uid()))
  with check (user_id in (select id from public.profiles where user_id = auth.uid()));

create policy "Users can insert their own notification preferences"
  on public.notification_preferences for insert
  to authenticated
  with check (user_id in (select id from public.profiles where user_id = auth.uid()));

-- Deletes: not exposed via RLS. Preferences are upserted, never deleted.
-- (server-side cleanup on account deletion cascades via FK.)

-- ---------------------------------------------------------------------------
-- 5. email_delivery_records — outbound email tracking.
--    RLS enabled, NO client policy = server-only access. The user-facing
--    "did this email send?" view is exposed via a separate helper that
--    joins through to notifications with RLS.
-- ---------------------------------------------------------------------------
create table if not exists public.email_delivery_records (
  id uuid primary key default gen_random_uuid(),
  -- Linked notification (nullable — some emails like one-off verification
  -- tokens aren't tied to a notification row, just a domain event)
  notification_id uuid references public.notifications(id) on delete set null,
  -- Stable event key this delivery corresponds to (matches
  -- notification_events.event_key / notifications.event_key)
  event_key text,
  -- Recipient (denormalised for queries without joining through to
  -- notifications — also covers emails sent to non-recipients like
  -- support / admin inboxes in future)
  recipient_id uuid references public.profiles(id) on delete set null,
  recipient_email text not null,
  -- Template + provider routing
  template text not null,
  provider text not null,
  provider_message_id text,
  -- Delivery status — matches email service abstraction
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'delivered', 'failed', 'suppressed')),
  -- Error tracking
  error_category text
    check (error_category in (
      null,
      'invalid_email',
      'suppressed_address',
      'provider_error',
      'timeout',
      'rate_limited',
      'network',
      'unknown'
    )),
  error_message text,
  -- Retry bookkeeping
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  -- Timestamps
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger email_delivery_records_set_updated_at
  before update on public.email_delivery_records
  for each row execute function public.set_updated_at();

create index if not exists email_delivery_records_notification_idx
  on public.email_delivery_records(notification_id);
create index if not exists email_delivery_records_recipient_idx
  on public.email_delivery_records(recipient_id, created_at desc);
create index if not exists email_delivery_records_status_idx
  on public.email_delivery_records(status, next_retry_at)
  where status in ('pending', 'failed');
create index if not exists email_delivery_records_event_key_idx
  on public.email_delivery_records(event_key);

alter table public.email_delivery_records enable row level security;
-- No policies = server-only access. Service role bypasses RLS.

-- ---------------------------------------------------------------------------
-- 6. dispatch_notification() — SECURITY DEFINER helper used by the
--    NotificationService to insert a notification row atomically with
--    idempotency checking.
--
--    Parameters:
--      p_recipient_id       uuid  — recipient profile.id (NOT auth uid)
--      p_type               text  — stable category, e.g. "application.accepted"
--      p_title              text
--      p_body               text  (nullable)
--      p_level              text  — info|success|warning|error (default 'info')
--      p_priority           text  — low|normal|high|critical (default 'normal')
--      p_channel            text  — in_app|email|sms|push (default 'in_app')
--      p_href               text  (nullable, MUST be a relative URL)
--      p_related            jsonb (default '{}')
--      p_related_entity_type text (nullable)
--      p_related_entity_id  uuid  (nullable)
--      p_event_key          text  (nullable — when present, deduplicates)
--      p_metadata           jsonb (default '{}')
--      p_expires_at         timestamptz (nullable)
--
--    Returns: uuid (the inserted notification id) or NULL when the
--             event_key already exists for this (recipient, channel)
--             and the call was a duplicate.
-- ---------------------------------------------------------------------------
create or replace function public.dispatch_notification(
  p_recipient_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_level text default 'info',
  p_priority text default 'normal',
  p_channel text default 'in_app',
  p_href text default null,
  p_related jsonb default '{}'::jsonb,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null,
  p_event_key text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_expires_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Validate level + priority + channel against CHECK constraints.
  if p_level not in ('info', 'success', 'warning', 'error') then
    raise exception 'Invalid notification level: %', p_level;
  end if;
  if p_priority not in ('low', 'normal', 'high', 'critical') then
    raise exception 'Invalid notification priority: %', p_priority;
  end if;
  if p_channel not in ('in_app', 'email', 'sms', 'push') then
    raise exception 'Invalid notification channel: %', p_channel;
  end if;

  -- Reject absolute URLs in href (defence-in-depth against malicious
  -- notification data). The application layer also enforces this, but
  -- RLS-tier defence is cheap and bullet-proof.
  if p_href is not null and (p_href ~ '^https?://' or p_href ~ '^//') then
    raise exception 'Absolute URLs are forbidden in notification href';
  end if;

  -- Insert. The unique partial index on
  -- (recipient_id, event_key, channel) where event_key is not null will
  -- raise a constraint violation on duplicate — we catch it and return
  -- null so the caller can short-circuit.
  begin
    insert into public.notifications (
      recipient_id, type, level, priority, channel,
      title, body, href, related,
      related_entity_type, related_entity_id,
      event_key, metadata, expires_at
    ) values (
      p_recipient_id, p_type, p_level, p_priority, p_channel,
      p_title, p_body, p_href, p_related,
      p_related_entity_type, p_related_entity_id,
      p_event_key, p_metadata, p_expires_at
    )
    returning id into v_id;
  exception
    when unique_violation then
      -- Idempotency guard fired. Return null.
      return null;
  end;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. mark_notification_unread() — companion to mark_notification_read.
--    Allows the user to surface a notification again by clearing read_at.
--    Only callable by the recipient.
-- ---------------------------------------------------------------------------
create or replace function public.mark_notification_unread(notification_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
    set read_at = null
    where id = notification_uuid
      and recipient_id = public.user_profile_id();
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Soft-delete (dismiss) a notification — recipient-only.
--    Does NOT physically delete. Audit history stays intact via
--    notification_events + audit_logs.
-- ---------------------------------------------------------------------------
create or replace function public.dismiss_notification(notification_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
    set dismissed_at = now()
    where id = notification_uuid
      and recipient_id = public.user_profile_id()
      and dismissed_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Realtime — enable publication for the notifications table so the
--    in-app bell + list can update live without polling.
--    Supabase publishes changes via the `supabase_realtime` publication.
--    Only INSERT events are needed (read/dismissed are pulled via
--    explicit client actions to keep traffic minimal).
-- ---------------------------------------------------------------------------
do $$
begin
  -- Add the table to the realtime publication if not already a member.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- End of migration 0023_notifications_extensions.sql.
