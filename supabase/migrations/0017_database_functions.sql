-- ============================================================================
-- 0017_database_functions.sql
-- ============================================================================
-- Server-side helper functions. SECURITY DEFINER where they need to
-- bypass RLS for safe reasons. Marked IMMUTABLE / STABLE where possible.
--
-- Important: SECURITY DEFINER functions run with the privileges of the
-- function owner (postgres). They MUST be carefully written to avoid
-- creating security holes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. is_admin() — returns true if the calling auth user is an admin.
--    SECURITY DEFINER because it needs to read admin_users (which is
--    not user-readable). The function only RETURNS a boolean; it does
--    not expose any rows, so there is no data leak.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(check_user uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users au
    where au.user_id = check_user
  );
$$;

-- Convenience wrapper for use in policies
create or replace function public.is_caller_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_admin(auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 2. user_profile_id() — returns the public.profiles.id for the calling
--    auth user. SECURITY DEFINER because it's called inside RLS
--    policies where we can't afford nested RLS cycles.
-- ---------------------------------------------------------------------------
create or replace function public.user_profile_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from public.profiles where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 3. can_manage_property(prop_uuid uuid) — true if the caller is the
--    owner, listing creator, or managing agent of the property.
--    SECURITY DEFINER to avoid recursive RLS on properties.
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_property(prop_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.properties p
    where p.id = prop_uuid
    and (
      p.owner_profile_id = public.user_profile_id()
      or p.listing_creator_id = public.user_profile_id()
      or p.managing_agent_id = public.user_profile_id()
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. mark_notification_read(notification_uuid uuid) — atomic update that
--    sets read_at only if the caller is the recipient. Avoids the
--    client computing the right row to update.
-- ---------------------------------------------------------------------------
create or replace function public.mark_notification_read(notification_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
    set read_at = now()
    where id = notification_uuid
      and recipient_id = public.user_profile_id()
      and read_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. mark_all_notifications_read() — bulk mark all unread notifications
--    of the caller as read. Useful for "Mark all as read" UI.
-- ---------------------------------------------------------------------------
create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
    set read_at = now()
    where recipient_id = public.user_profile_id()
      and read_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. increment_property_views(prop_uuid uuid) — fire-and-forget view
--    counter. SECURITY DEFINER so anon users can call it without RLS
--    blocking the UPDATE.
-- ---------------------------------------------------------------------------
create table if not exists public.property_view_counts (
  property_id uuid primary key references public.properties(id) on delete cascade,
  views bigint not null default 0,
  unique_views bigint not null default 0,
  updated_at timestamptz not null default now()
);

create trigger property_view_counts_set_updated_at
  before update on public.property_view_counts
  for each row execute function public.set_updated_at();

create or replace function public.increment_property_views(prop_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.property_view_counts (property_id, views, unique_views)
  values (prop_uuid, 1, 0)
  on conflict (property_id) do update
    set views = public.property_view_counts.views + 1,
        updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. record_audit(action text, target_type text, target_id text, meta jsonb)
--    Convenience function for server actions to append to audit_logs
--    with the caller's user_id automatically attached.
-- ---------------------------------------------------------------------------
create or replace function public.record_audit(
  audit_action text,
  audit_target_type text default null,
  audit_target_id text default null,
  audit_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), audit_action, audit_target_type, audit_target_id, audit_metadata);
end;
$$;
