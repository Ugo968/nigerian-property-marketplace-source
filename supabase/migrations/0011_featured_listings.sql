-- ============================================================================
-- 0011_featured_listings.sql
-- ============================================================================
-- Featured listing credits + featured listing placements.
-- Per spec Section 18. Featured placements must be clearly labeled
-- "Featured" / "Sponsored" — never blend into organic results.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- featured_listing_credits — balance per user. Source: plan allocation OR
-- direct purchase. One row per (user, source) so we can audit history.
-- ---------------------------------------------------------------------------
create table if not exists public.featured_listing_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Source of the credit
  source text not null check (source in ('plan_allocation', 'purchase', 'admin_grant')),
  -- Reference to the payment or plan-allocation event
  source_ref uuid,
  amount int not null check (amount > 0), -- number of credits granted
  remaining int not null check (remaining >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger featured_listing_credits_set_updated_at
  before update on public.featured_listing_credits
  for each row execute function public.set_updated_at();

create index if not exists featured_listing_credits_user_idx
  on public.featured_listing_credits(user_id, remaining);

-- ---------------------------------------------------------------------------
-- featured_listings — actual placements
-- ---------------------------------------------------------------------------
create table if not exists public.featured_listings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  purchaser_id uuid not null references public.profiles(id) on delete cascade,
  -- Where the listing is featured
  placement text not null check (placement in (
    'homepage', 'search', 'category', 'location'
  )),
  -- Optional targeting context (e.g. category placement → which category)
  target_context jsonb not null default '{}'::jsonb,
  -- Credit source
  credit_id uuid references public.featured_listing_credits(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'paused', 'ended', 'cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  impressions int not null default 0,
  clicks int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Sanity: end must be after start
  check (ends_at > starts_at)
);

create trigger featured_listings_set_updated_at
  before update on public.featured_listings
  for each row execute function public.set_updated_at();

create index if not exists featured_listings_property_idx
  on public.featured_listings(property_id);
create index if not exists featured_listings_active_idx
  on public.featured_listings(placement, status, starts_at, ends_at)
  where status in ('scheduled', 'active');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.featured_listing_credits enable row level security;
alter table public.featured_listings enable row level security;

-- Public can read featured listings (they're meant to be displayed).
create policy "Featured listings are publicly readable"
  on public.featured_listings for select
  to anon, authenticated
  using (status in ('scheduled', 'active', 'paused', 'ended'));

-- Credits: only owner can read their balance.
create policy "Users can read their own featured listing credits"
  on public.featured_listing_credits for select
  to authenticated
  using (user_id in (select id from public.profiles where user_id = auth.uid()));

-- Inserts / updates via service role only (payment webhook, admin actions).
