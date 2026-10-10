-- ============================================================================
-- 0002_profile_extensions.sql
-- ============================================================================
-- Extends the `profiles` table created in 0001 with additional fields
-- required by the master product specification (Prompt 3, Section 3):
--
--   * account_status (active / suspended / banned / pending / deactivated)
--   * deleted_at    (soft-delete support — never physically destroy user rows)
--   * full_name     (rename of display_name to match spec terminology)
--   * preferred_location (the user's preferred area, used for default
--     search context and recommendation seeds)
--
-- Backward-compatible: keeps `display_name` as a generated alias so existing
-- queries that reference it keep working until they are migrated.
-- ============================================================================

-- 1. account_status enum-like text column with CHECK constraint.
--    Default 'pending' so newly-registered users must complete onboarding
--    before being marked 'active' — but the signup flow can override this
--    to 'active' when onboarding is skipped (Free plan).
alter table public.profiles
  add column if not exists account_status text not null default 'pending'
  check (account_status in (
    'active', 'suspended', 'banned', 'pending', 'deactivated'
  ));

-- 2. Soft-delete timestamp. NULL means the row is live.
alter table public.profiles
  add column if not exists deleted_at timestamptz;

-- 3. preferred_location — free-form text. Kept simple in V1; will be
--    normalised into a locations table later if needed.
alter table public.profiles
  add column if not exists preferred_location text;

-- 4. Rename display_name → full_name (idempotent: only renames if the
--    old column exists and the new one does not).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'display_name'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'full_name'
  ) then
    alter table public.profiles rename column display_name to full_name;
  end if;
end $$;

-- 5. Backfill account_status for rows that pre-date this migration.
--    Any row with suspended_at set becomes 'suspended' for consistency.
update public.profiles
  set account_status = 'suspended'
  where suspended_at is not null
    and account_status = 'pending';

-- 6. Index account_status — admin dashboards filter on this often.
create index if not exists profiles_account_status_idx
  on public.profiles(account_status);

-- 7. Soft-deleted rows are excluded from public reads via RLS policy
--    in 0016_rls_policies.sql. Index the deleted_at column for that.
create index if not exists profiles_deleted_at_idx
  on public.profiles(deleted_at)
  where deleted_at is not null;

-- 8. Update the public-read RLS policy to also exclude soft-deleted rows.
--    Drop and recreate to keep policy names stable.
drop policy if exists "Profiles are publicly readable"
  on public.profiles;

create policy "Profiles are publicly readable"
  on public.profiles for select
  to anon, authenticated
  using (
    suspended_at is null
    and deleted_at is null
    and account_status in ('active', 'pending')
  );
