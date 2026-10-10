-- ============================================================================
-- 0027_tenant_role.sql
-- ============================================================================
-- Adds the "tenant" marketplace role as a fourth primary role.
--
-- Backward-compatible: existing landlord/agent/company users are NOT
-- converted. The profiles.role CHECK constraint is relaxed to include
-- 'tenant'. A new tenant_profiles table stores tenant-specific data
-- (preferences, trial tracking).
--
-- Per spec Section 1: "Existing users must retain their current roles
-- and data. Do not silently convert existing users into tenants."
--
-- Per spec Section 3: 7-day free trial with a configurable listing
-- allowance (default 10). Trial start/expiry tracked server-side.
-- Per spec Section 12: users cannot alter trial expiry or usage counters.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Relax the profiles.role CHECK to include 'tenant'.
--    The original CHECK (migration 0001) is:
--      check (role in ('landlord', 'agent', 'company'))
--    We drop + recreate it to include 'tenant'.
-- ---------------------------------------------------------------------------
do $$
begin
  -- Find + drop the existing role CHECK constraint on profiles.
  -- The constraint name varies by Supabase version; we use a dynamic
  -- lookup to find the one that checks the role column.
  declare
    con_name text;
  begin
    select con.conname into con_name
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public'
        and rel.relname = 'profiles'
        and con.contype = 'c'  -- CHECK constraint
        and pg_get_constraintdef(con.oid) ~* 'role in';

    if con_name is not null then
      execute format('alter table public.profiles drop constraint if exists %I', con_name);
    end if;
  end;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('landlord', 'agent', 'company', 'tenant'));

-- ---------------------------------------------------------------------------
-- 2. tenant_profiles — role-specific profile data for tenants.
--    Stores preferences (preferred locations, property types, budget,
--    bedrooms) + trial tracking.
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,

  -- Preferred location (free-form; structured location hierarchy lives
  -- in the properties table + property_locations).
  preferred_state text,
  preferred_city text,
  preferred_areas text[],

  -- Preferred property types (slugs matching property_types table)
  preferred_property_types text[],

  -- Desired number of bedrooms (min/max)
  preferred_bedrooms_min smallint check (preferred_bedrooms_min is null or preferred_bedrooms_min >= 0),
  preferred_bedrooms_max smallint check (preferred_bedrooms_max is null or preferred_bedrooms_max >= 0),

  -- Budget (in Naira minor units / kobo — consistent with properties.price)
  preferred_budget_min bigint check (preferred_budget_min is null or preferred_budget_min >= 0),
  preferred_budget_max bigint check (preferred_budget_max is null or preferred_budget_max >= 0),

  -- Rental or short-let preference
  preferred_transaction_type text check (preferred_transaction_type in ('rent', 'sale', 'shortlet')),

  -- Optional move-in timeframe (free-form text, e.g. "January 2025")
  preferred_move_in_timeframe text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tenant_profiles_set_updated_at
  before update on public.tenant_profiles
  for each row execute function public.set_updated_at();

alter table public.tenant_profiles enable row level security;

-- Tenants can read + update their own tenant_profile.
create policy "Tenants can read their own profile"
  on public.tenant_profiles for select
  to authenticated
  using (profile_id in (select id from public.profiles where user_id = auth.uid()));

create policy "Tenants can update their own profile"
  on public.tenant_profiles for update
  to authenticated
  using (profile_id in (select id from public.profiles where user_id = auth.uid()))
  with check (profile_id in (select id from public.profiles where user_id = auth.uid()));

create policy "Tenants can insert their own profile"
  on public.tenant_profiles for insert
  to authenticated
  with check (profile_id in (select id from public.profiles where user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. tenant_trial_usage — server-side trial tracking.
--    Per spec Section 3: "Enforce the allowance server-side and prevent
--    repeatedly resetting it by changing request parameters."
--    Per spec Section 12: "Users cannot alter their trial expiry or
--    usage counters."
--
--    This table is SERVER-ONLY (no client INSERT/UPDATE/DELETE policy).
--    The application layer (server actions) reads + updates it via the
--    service-role admin client after authorization checks.
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_trial_usage (
  tenant_profile_id uuid primary key references public.profiles(id) on delete cascade,

  -- Trial period
  trial_started_at timestamptz not null default now(),
  trial_expires_at timestamptz not null,

  -- Listing browsing allowance (default 10, configurable via platform_settings)
  listing_allowance int not null default 10,
  listings_viewed int not null default 0,

  -- Track which listings the tenant has viewed during the trial
  -- (array of property_ids — capped to prevent unbounded growth)
  viewed_property_ids uuid[] not null default '{}'::uuid[],

  -- Whether the trial has been explicitly ended (e.g. user subscribed early)
  trial_ended_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tenant_trial_usage_set_updated_at
  before update on public.tenant_trial_usage
  for each row execute function public.set_updated_at();

alter table public.tenant_trial_usage enable row level security;

-- Tenants can READ their own trial status (to see remaining time + allowance).
-- But they CANNOT insert/update/delete — that's server-only.
create policy "Tenants can read their own trial status"
  on public.tenant_trial_usage for select
  to authenticated
  using (tenant_profile_id in (select id from public.profiles where user_id = auth.uid()));

-- No INSERT/UPDATE/DELETE policies = server-only writes.

-- ---------------------------------------------------------------------------
-- 4. Add platform_settings for tenant trial configuration.
--    Per spec Section 10: "Configure the trial listing allowance and
--    trial duration through the existing configuration approach."
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value, description, value_type, is_editable) values
  ('tenant.trial_duration_days', '7', 'Duration of the tenant free trial in days.', 'number', true),
  ('tenant.trial_listing_allowance', '10', 'Number of distinct property listings a trial tenant can view.', 'number', true),
  ('tenant.subscription_price_naira', '1500', 'Monthly subscription price for tenants in Naira.', 'number', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Add 'tenant' plan to subscription_plans seed (the seed file
--    003_subscription_plans.sql will also be updated, but we insert
--    here for immediate availability on migration).
-- ---------------------------------------------------------------------------
insert into public.subscription_plans
  (role, tier, price_naira, is_variable_price, billing_cycle, is_default, is_sellable, tagline, highlights)
values
  ('tenant', 'free', 0, false, 'monthly', true, false,
   '7-day free trial. Browse up to 10 listings.',
   '["7-day free trial","Browse up to 10 listings","Search and filter","View public property details","Save preferences"]'::jsonb),
  ('tenant', 'pro', 1500, false, 'monthly', false, true,
   'Full tenant access. Contact landlords directly.',
   '["Browse all listings","Advanced search and filters","Contact landlords directly","Save properties","Save searches","Property alerts","Manage enquiries","Report suspicious listings"]'::jsonb)
on conflict (role, tier, billing_cycle) do nothing;

-- End of migration 0027_tenant_role.sql.
