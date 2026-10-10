-- ============================================================================
-- 0016_reports.sql
-- ============================================================================
-- Generic reporting system. Per spec Section 24.
-- Supports reports against: properties, users (profiles), reviews,
-- messages, advertising campaigns, etc.
-- ============================================================================

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  -- Reporter
  reporter_id uuid references public.profiles(id) on delete set null,
  -- Anonymous reports allowed (e.g. unauthenticated safety tips)
  reporter_email text, -- when reporter_id is null

  -- Polymorphic target — entity_type determines which table entity_id points to
  entity_type text not null check (entity_type in (
    'property', 'profile', 'review', 'message',
    'advertising_business', 'advertising_campaign', 'other'
  )),
  entity_id uuid not null,

  -- Reason category (drives admin queue filter + report routing)
  reason text not null check (reason in (
    'fake_listing', 'scam_attempt', 'wrong_property_info',
    'already_sold_rented', 'fraudulent_agent', 'fraudulent_owner',
    'harassment', 'inappropriate_content', 'suspicious_payment_request',
    'other'
  )),

  description text not null,
  -- Optional evidence — file refs uploaded to private bucket
  evidence jsonb not null default '{}'::jsonb,

  status text not null default 'open'
    check (status in ('open', 'investigating', 'resolved', 'dismissed')),

  -- Resolution metadata
  resolution_notes text,
  resolution_action text, -- e.g. "listing_removed", "user_suspended", "no_action"
  resolved_by uuid references public.admin_users(id) on delete set null,
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

create index if not exists reports_reporter_idx
  on public.reports(reporter_id, created_at desc)
  where reporter_id is not null;
create index if not exists reports_target_idx
  on public.reports(entity_type, entity_id);
create index if not exists reports_status_idx
  on public.reports(status, created_at);
create index if not exists reports_reason_idx
  on public.reports(reason, status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.reports enable row level security;

-- Authenticated users can read their own reports (to see status updates).
-- Otherwise reports are admin-only.
create policy "Users can read their own reports"
  on public.reports for select
  to authenticated
  using (reporter_id in (select id from public.profiles where user_id = auth.uid()));

-- Any authenticated user can submit a report. Anonymous reports (where
-- reporter_id is null) must be inserted via the service role.
create policy "Authenticated users can submit reports"
  on public.reports for insert
  to authenticated
  with check (
    reporter_id is null
    or reporter_id in (select id from public.profiles where user_id = auth.uid())
  );

-- Reporters can withdraw their own reports (delete).
create policy "Reporters can withdraw their own reports"
  on public.reports for delete
  to authenticated
  using (reporter_id in (select id from public.profiles where user_id = auth.uid()));

-- Updates only via service role (admin resolution flow).
