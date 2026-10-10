-- ============================================================================
-- 0024_admin_extensions.sql
-- ============================================================================
-- Admin Dashboard & Moderation system (Prompt 17).
--
-- Adds:
--   * admin_action_records — moderation history table (separate from the
--     append-only audit_logs so the admin UI can list moderation events
--     efficiently without scanning the entire audit log)
--   * report_categories — configurable report categories (spec Section 22)
--   * platform_settings — simple key/value store for admin-configurable
--     values (advertising minimum, featured pricing, etc.)
--   * Indexes on audit_logs + reports for admin filtering
--   * report_status CHECK constraint expanded to include 'escalated'
--     (additive — existing rows still satisfy the new constraint)
--
-- RLS strategy:
--   * admin_action_records — server-only (RLS, NO client policy)
--   * report_categories — public read, server-side write
--   * platform_settings — public read (so client code can read config
--     values), server-side write
--
-- Admin authorization is enforced at the application layer via
-- requireAdminPermission() — NEVER via a client RLS policy that
-- says "admin can see everything".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. admin_action_records — moderation history (spec Section 33)
--    Stores the audit trail for moderation actions: ban, suspend,
--    property removal, verification revocation, etc. Separate from
--    audit_logs because:
--      a) it carries a structured (action, target_type, target_id,
--         reason, previous_state, new_state) shape that's efficient
--         to query for "show me all moderation actions on user X"
--      b) it's never editable by anyone — INSERT only
--    RLS: server-only (no client policy = no client access).
-- ---------------------------------------------------------------------------
create table if not exists public.admin_action_records (
  id uuid primary key default gen_random_uuid(),
  -- The admin (auth.users.id) who performed the action
  admin_user_id uuid not null references auth.users(id) on delete set null,
  -- The action slug, e.g. "user.suspend", "property.remove",
  -- "verification.revoke", "campaign.reject"
  action text not null,
  -- Polymorphic target
  target_type text not null check (target_type in (
    'user', 'property', 'verification_application', 'review',
    'report', 'conversation', 'message', 'advertising_business',
    'advertising_campaign', 'featured_listing', 'subscription',
    'payment', 'notification'
  )),
  target_id uuid not null,
  -- Reason supplied by the admin (required for high-impact actions)
  reason text,
  -- Previous state + new state snapshots (for state-machine transitions)
  previous_state text,
  new_state text,
  -- Optional metadata (sanitised — no secrets)
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_action_records_admin_idx
  on public.admin_action_records(admin_user_id, created_at desc);
create index if not exists admin_action_records_target_idx
  on public.admin_action_records(target_type, target_id, created_at desc);
create index if not exists admin_action_records_action_idx
  on public.admin_action_records(action, created_at desc);
create index if not exists admin_action_records_created_idx
  on public.admin_action_records(created_at desc);

alter table public.admin_action_records enable row level security;
-- No policies = server-only access. Service role bypasses RLS.

-- ---------------------------------------------------------------------------
-- 2. report_categories — configurable report categories
--    (spec Section 22: "Do not hardcode categories throughout the frontend.")
--    Admin-managed; seeded with the spec's default categories.
-- ---------------------------------------------------------------------------
create table if not exists public.report_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  -- Longer description shown to the user submitting the report
  description text,
  -- Which entity types this category applies to (empty = all)
  applicable_entity_types text[] not null default '{}'::text[],
  -- Severity hint for moderation queue ordering (1=low … 5=critical)
  severity smallint not null default 2 check (severity >= 1 and severity <= 5),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger report_categories_set_updated_at
  before update on public.report_categories
  for each row execute function public.set_updated_at();

create index if not exists report_categories_active_idx
  on public.report_categories(is_active, sort_order);

alter table public.report_categories enable row level security;

-- Public read — anyone (even anon) can see the categories when filing a report.
create policy "Report categories are publicly readable"
  on public.report_categories for select
  to anon, authenticated
  using (is_active = true);

-- Writes: server-only. No INSERT/UPDATE/DELETE policies = no client writes.

-- ---------------------------------------------------------------------------
-- 3. platform_settings — key/value store for admin-configurable values
--    (spec Section 40: advertising minimum ₦5,000, featured pricing, etc.)
--    The application reads these via the existing config modules
--    (lib/advertising/config.ts, lib/featured/config.ts) which fall
--    back to hard-coded defaults when no row exists. The admin UI
--    can update these rows; the config modules re-read them.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  -- Human-readable description shown in the admin UI
  description text,
  -- Whether the value is a number, string, boolean, json
  value_type text not null check (value_type in (
    'number', 'string', 'boolean', 'json'
  )),
  -- Whether the value can be edited from the admin UI (some settings
  -- are read-only because they're enforced at the DB layer)
  is_editable boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger platform_settings_set_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;

-- Public read — config modules need to read these without auth.
create policy "Platform settings are publicly readable"
  on public.platform_settings for select
  to anon, authenticated
  using (true);

-- Writes: server-only via admin actions. No INSERT/UPDATE/DELETE policies.

-- ---------------------------------------------------------------------------
-- 4. Expand reports.status CHECK to include 'escalated'.
--    The existing CHECK constraint is on the column directly, so we
--    need to drop and recreate it. Additive — existing rows still
--    satisfy the new constraint.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'reports_status_check'
  ) then
    alter table public.reports drop constraint if exists reports_status_check;
    alter table public.reports
      add constraint reports_status_check
      check (status in ('open', 'investigating', 'resolved', 'dismissed', 'escalated'));
  end if;
end $$;

-- Index for the moderation queue (severity-sorted within age buckets)
create index if not exists reports_queue_idx
  on public.reports(status, created_at);

-- ---------------------------------------------------------------------------
-- 5. Audit log indexes for admin filtering (spec Section 31).
--    These index existing columns on audit_logs — they were created in
--    0001 but without admin-filter-friendly indexes.
-- ---------------------------------------------------------------------------
create index if not exists audit_logs_actor_idx
  on public.audit_logs(actor_id, created_at desc);
create index if not exists audit_logs_action_idx
  on public.audit_logs(action, created_at desc);
create index if not exists audit_logs_target_idx
  on public.audit_logs(target_type, target_id, created_at desc);
create index if not exists audit_logs_created_idx
  on public.audit_logs(created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Add a `resolved_by` column to reports for the moderation audit trail.
--    Linked to admin_users so the resolving admin is recorded.
-- ---------------------------------------------------------------------------
alter table public.reports
  add column if not exists resolved_by uuid references public.admin_users(id) on delete set null;
alter table public.reports
  add column if not exists resolved_at timestamptz;

create index if not exists reports_resolved_by_idx
  on public.reports(resolved_by)
  where resolved_by is not null;

-- ---------------------------------------------------------------------------
-- 7. Seed default report categories (spec Section 22).
--    Idempotent — `on conflict do nothing`.
-- ---------------------------------------------------------------------------
insert into public.report_categories (slug, label, description, applicable_entity_types, severity, sort_order) values
  ('fraud_scam', 'Fraud / Scam', 'Suspected fraud, scam attempt, or attempt to extract money outside the platform.', '{}', 5, 10),
  ('misleading_listing', 'Misleading Listing', 'Property information does not match reality — wrong photos, wrong location, hidden fees.', '{"property"}', 3, 20),
  ('fake_property', 'Fake Property', 'The listing does not exist or the listing creator does not own it.', '{"property"}', 5, 30),
  ('impersonation', 'Impersonation', 'The account is impersonating another person or organisation.', '{"profile"}', 4, 40),
  ('harassment', 'Harassment', 'Harassment, threats, or abusive behaviour toward another user.', '{"profile","message"}', 4, 50),
  ('spam', 'Spam', 'Unsolicited promotional or repetitive content unrelated to the platform.', '{}', 2, 60),
  ('inappropriate_content', 'Inappropriate Content', 'Sexual, violent, or otherwise inappropriate content.', '{}', 3, 70),
  ('suspicious_payment_request', 'Suspicious Payment Request', 'A user requested payment outside the platform or via an unverified channel.', '{"profile","message","property"}', 5, 80),
  ('fake_review', 'Fake Review', 'The review appears to be fabricated, coordinated, or extorted.', '{"review"}', 3, 90),
  ('misleading_advertisement', 'Misleading Advertisement', 'An advertising campaign contains misleading claims or prohibited content.', '{"advertising_campaign","advertising_business"}', 3, 100),
  ('other', 'Other', 'Any other concern that does not fit the categories above.', '{}', 2, 1000)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Seed default platform settings (spec Section 40).
--    These mirror the hard-coded values in lib/advertising/config.ts
--    and lib/featured/config.ts. The admin UI can update them; the
--    config modules can be updated to read from this table in V2.
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value, description, value_type, is_editable) values
  ('advertising.min_campaign_budget_naira', '5000', 'Minimum advertising campaign budget in Naira.', 'number', true),
  ('advertising.max_campaigns_per_business', '5', 'Maximum active campaigns per advertising business.', 'number', true),
  ('advertising.max_businesses_per_user', '3', 'Maximum advertising businesses per advertiser account.', 'number', true),
  ('featured.credit_purchase_price_naira', '1000', 'Price per featured-listing credit in Naira.', 'number', true),
  ('featured.max_active_promotions_per_user', '3', 'Maximum concurrent active featured promotions per user.', 'number', true),
  ('notifications.admin_can_broadcast', 'false', 'Whether admins can broadcast announcement notifications. Reserved for future use.', 'boolean', true),
  ('reports.auto_escalate_after_hours', '72', 'Hours after which an unresolved report is auto-flagged for escalation.', 'number', true)
on conflict (key) do nothing;

-- End of migration 0024_admin_extensions.sql.
