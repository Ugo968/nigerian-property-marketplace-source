-- ============================================================================
-- 0015_notifications.sql
-- ============================================================================
-- In-app notification center. Per spec Section 22.
-- Notification types are extensible — there is no enum constraint on
-- `type` because new notification types can be added at any time without
-- DB migration.
-- ============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  -- Stable category string like "application.accepted", "message.received"
  type text not null,
  level text not null default 'info'
    check (level in ('info', 'success', 'warning', 'error')),
  title text not null,
  body text,
  -- Optional href the user can click to navigate from the notification
  href text,
  -- Optional related resource (polymorphic — type+id stored as JSONB)
  related jsonb not null default '{}'::jsonb,
  -- Read state
  read_at timestamptz,
  -- Soft deletion by the recipient
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications(recipient_id, created_at desc)
  where dismissed_at is null;
create index if not exists notifications_unread_idx
  on public.notifications(recipient_id, created_at desc)
  where read_at is null and dismissed_at is null;
create index if not exists notifications_type_idx
  on public.notifications(recipient_id, type);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;

create policy "Users can read their own notifications"
  on public.notifications for select
  to authenticated
  using (recipient_id in (select id from public.profiles where user_id = auth.uid()));

create policy "Users can update their own notifications"
  on public.notifications for update
  to authenticated
  using (recipient_id in (select id from public.profiles where user_id = auth.uid()))
  with check (recipient_id in (select id from public.profiles where user_id = auth.uid()));

create policy "Users can soft-delete their own notifications"
  on public.notifications for delete
  to authenticated
  using (recipient_id in (select id from public.profiles where user_id = auth.uid()));

-- Inserts: from server-side only (route handlers / server actions / cron).
-- No client-side RLS = users cannot fabricate notifications.
