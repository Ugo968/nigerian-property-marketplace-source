-- ============================================================================
-- 0001_initial_foundation.sql
-- ============================================================================
-- Foundation migration. Sets up the structural primitives every subsequent
-- migration will build on:
--
--   * UUID generation helper (used as primary keys across the app)
--   * updated_at trigger function (auto-stamps row mtime on UPDATE)
--   * The `profiles` table — the role-bearing row that ties a Supabase
--     auth.users entry to a marketplace role (landlord | agent | company)
--   * RLS policies for profiles (a user can read + update only their own
--     profile; admins via the service role bypass RLS)
--
-- This migration does NOT create properties, applications, messaging,
-- payments, advertising, etc. Those land in their own numbered migrations.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. UUID helper. Supabase already exposes gen_random_uuid() through
--    pgcrypto, but we re-create the alias for clarity.
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 2. updated_at trigger function — reusable by every table that needs it.
--    Usage:  alter table foo add column updated_at timestamptz;
--            create trigger foo_set_updated_at before update on foo
--              for each row execute function set_updated_at();
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. profiles table
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('landlord', 'agent', 'company')),
  display_name text not null,
  phone text,
  phone_verified boolean not null default false,
  email_verified boolean not null default false,
  verification_state text not null default 'unverified'
    check (verification_state in (
      'unverified', 'pending', 'bronze', 'blue',
      'rejected', 'suspended', 'revoked'
    )),
  subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'pro', 'premium')),
  avatar_url text,
  bio text,
  areas_served text[],
  social_handles jsonb not null default '{}'::jsonb,
  onboarding_completed boolean not null default false,
  suspended_at timestamptz,
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Index for fast lookups by role.
create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_verification_state_idx
  on public.profiles(verification_state);

-- ---------------------------------------------------------------------------
-- 4. RLS for profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- A user can read any profile (marketplace is public) but PII-sensitive
-- columns are not selected in queries by default — see profiles_view.
create policy "Profiles are publicly readable"
  on public.profiles for select
  to anon, authenticated
  using (suspended_at is null);

create policy "Users can read their own profile, even when suspended"
  on public.profiles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own profile (non-role, non-tier fields)"
  on public.profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    -- role and subscription_tier are immutable from the client side.
    -- Updates that change them are rejected at the database layer.
    and role = (select role from public.profiles where user_id = auth.uid())
    and subscription_tier = (
      select subscription_tier from public.profiles
      where user_id = auth.uid()
    )
  );

-- Note: admin actions bypass RLS via the service-role client.
-- We do NOT add admin policies here — admin access is exclusively through
-- the service-role key, which is never exposed to the browser.

-- ---------------------------------------------------------------------------
-- 5. Admin users table — RBAC for the (admin) route group.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin'
    check (role in ('admin', 'super_admin')),
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create trigger admin_users_set_updated_at
  before update on public.admin_users
  for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;

create policy "Admins can read admin_users"
  on public.admin_users for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_users a
      where a.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Audit log — every privileged action appends a row.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_actor_idx
  on public.audit_logs(actor_id);
create index if not exists audit_logs_action_idx
  on public.audit_logs(action);
create index if not exists audit_logs_created_at_idx
  on public.audit_logs(created_at desc);

alter table public.audit_logs enable row level security;

-- Audit logs are NOT user-readable. Only admins (via service role).
create policy "Audit logs are write-only for users"
  on public.audit_logs for insert
  to authenticated
  with check (actor_id = auth.uid());
