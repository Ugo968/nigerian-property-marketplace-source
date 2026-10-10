-- ============================================================================
-- 0008_saved_items.sql
-- ============================================================================
-- Saved properties (favourites) + saved searches + property alerts.
-- Per spec Sections 13, 14, 23.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- saved_properties — favourite a property. Prevents duplicates.
-- ---------------------------------------------------------------------------
create table if not exists public.saved_properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  -- Optional collection grouping (e.g. "Shortlist for client A")
  collection_name text,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, property_id)
);

create index if not exists saved_properties_user_idx
  on public.saved_properties(user_id, created_at desc);
create index if not exists saved_properties_property_idx
  on public.saved_properties(property_id);

-- ---------------------------------------------------------------------------
-- saved_searches — stored search criteria. JSONB for flexibility.
-- Drives property_alerts via the matcher cron.
-- ---------------------------------------------------------------------------
create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  criteria jsonb not null default '{}'::jsonb,
  -- Structural criteria (denormalised from JSONB for indexing / fast filters)
  transaction_type text check (transaction_type in ('rent', 'sale', 'shortlet')),
  property_type_id uuid references public.property_types(id),
  state text,
  city text,
  price_min bigint,
  price_max bigint,
  bedrooms_min smallint,
  bedrooms_max smallint,
  -- Active = alert matcher should run for this search
  is_active boolean not null default true,
  -- How often to be notified (off/basic/advanced/instant/priority).
  -- Tier-gated by capability system at the application layer.
  alert_level text not null default 'basic'
    check (alert_level in ('off', 'basic', 'advanced', 'instant', 'priority')),
  last_matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger saved_searches_set_updated_at
  before update on public.saved_searches
  for each row execute function public.set_updated_at();

create index if not exists saved_searches_user_idx
  on public.saved_searches(user_id, is_active);
create index if not exists saved_searches_active_idx
  on public.saved_searches(is_active, last_matched_at)
  where is_active = true;

-- ---------------------------------------------------------------------------
-- property_alerts — generated when saved_searches match new listings
-- ---------------------------------------------------------------------------
create table if not exists public.property_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  saved_search_id uuid not null references public.saved_searches(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  -- The kind of event that triggered the alert
  alert_type text not null check (alert_type in (
    'new_match', 'price_change', 'status_change', 'availability_change'
  )),
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed', 'dismissed')),
  sent_at timestamptz,
  -- Optional notification reference (linked to notifications table)
  notification_id uuid,
  created_at timestamptz not null default now(),
  -- Prevent duplicate alerts for the same (search, property, type)
  unique (saved_search_id, property_id, alert_type)
);

create index if not exists property_alerts_user_idx
  on public.property_alerts(user_id, created_at desc);
create index if not exists property_alerts_pending_idx
  on public.property_alerts(delivery_status, created_at)
  where delivery_status = 'pending';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.saved_properties enable row level security;
alter table public.saved_searches enable row level security;
alter table public.property_alerts enable row level security;

create policy "Users can manage their own saved properties"
  on public.saved_properties for all
  to authenticated
  using (user_id in (select id from public.profiles where user_id = auth.uid()))
  with check (user_id in (select id from public.profiles where user_id = auth.uid()));

create policy "Users can manage their own saved searches"
  on public.saved_searches for all
  to authenticated
  using (user_id in (select id from public.profiles where user_id = auth.uid()))
  with check (user_id in (select id from public.profiles where user_id = auth.uid()));

create policy "Users can manage their own property alerts"
  on public.property_alerts for select
  to authenticated
  using (user_id in (select id from public.profiles where user_id = auth.uid()));

create policy "Users can update their own property alert delivery status"
  on public.property_alerts for update
  to authenticated
  using (user_id in (select id from public.profiles where user_id = auth.uid()))
  with check (user_id in (select id from public.profiles where user_id = auth.uid()));

-- Inserts to property_alerts happen from the matcher cron (service role).
-- No client-side insert policy = no client-side inserts allowed.
