-- ============================================================================
-- 0022_featured_credit_ledger.sql
-- ============================================================================
-- Append-only credit ledger for featured listing credits.
-- Per spec Section 10: "Prefer an append-only credit ledger"
--
-- Also adds a promotion_placements config table for configurable
-- promotion products, durations, and credit costs (spec Section 13).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- featured_credit_transactions — append-only ledger
-- ---------------------------------------------------------------------------
create table if not exists public.featured_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null, -- positive = credit added, negative = credit consumed
  transaction_type text not null check (transaction_type in (
    'granted',     -- plan allocation or admin grant
    'consumed',    -- used for a promotion
    'refunded',    -- promotion cancelled/rejected, credit returned
    'expired',     -- credits expired
    'purchased',   -- bought via payment
    'adjusted'     -- admin adjustment
  )),
  source text not null check (source in (
    'plan_allocation', 'purchase', 'admin_grant',
    'promotion', 'refund', 'expiration', 'adjustment'
  )),
  related_resource_id uuid, -- promotion id or payment id
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists featured_credit_transactions_user_idx
  on public.featured_credit_transactions(user_id, created_at desc);

alter table public.featured_credit_transactions enable row level security;

create policy "Users can read their own credit transactions"
  on public.featured_credit_transactions for select
  to authenticated
  using (user_id in (select id from public.profiles where user_id = auth.uid()));

-- No INSERT policy for users — credits are granted/consumed server-side only.

-- ---------------------------------------------------------------------------
-- promotion_products — configurable promotion types + pricing (spec Section 13)
-- ---------------------------------------------------------------------------
create table if not exists public.promotion_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  placement text not null check (placement in (
    'homepage', 'search', 'category', 'location'
  )),
  credit_cost int not null check (credit_cost > 0),
  duration_days int not null check (duration_days > 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger promotion_products_set_updated_at
  before update on public.promotion_products
  for each row execute function public.set_updated_at();

alter table public.promotion_products enable row level security;

create policy "Promotion products are publicly readable"
  on public.promotion_products for select
  to anon, authenticated
  using (is_active = true);

-- ---------------------------------------------------------------------------
-- promotion_impressions — analytics foundation (spec Section 31, 32)
-- ---------------------------------------------------------------------------
create table if not exists public.promotion_impressions (
  id uuid primary key default gen_random_uuid(),
  featured_listing_id uuid not null references public.featured_listings(id) on delete cascade,
  -- Anonymous session hash for dedup (spec Section 32: "avoid storing unnecessary personal information")
  session_hash text,
  event_type text not null check (event_type in ('impression', 'click')),
  created_at timestamptz not null default now()
);

create index if not exists promotion_impressions_listing_idx
  on public.promotion_impressions(featured_listing_id, created_at desc);

-- Partial unique index for click dedup (one click per session per listing per hour)
create unique index if not exists promotion_impressions_click_dedup
  on public.promotion_impressions(featured_listing_id, session_hash, date_trunc('hour', created_at))
  where event_type = 'click' and session_hash is not null;

alter table public.promotion_impressions enable row level security;
-- No user RLS — impressions are recorded server-side only.

-- ---------------------------------------------------------------------------
-- Seed default promotion products (spec Section 13: "clearly mark values
-- requiring final business approval")
-- ---------------------------------------------------------------------------
insert into public.promotion_products (slug, label, placement, credit_cost, duration_days, is_active, sort_order)
values
  ('search_boost_7', 'Search Boost — 7 days', 'search', 1, 7, true, 10),
  ('search_boost_14', 'Search Boost — 14 days', 'search', 2, 14, true, 20),
  ('search_boost_30', 'Search Boost — 30 days', 'search', 3, 30, true, 30),
  ('homepage_featured_7', 'Homepage Featured — 7 days', 'homepage', 2, 7, true, 40),
  ('homepage_featured_14', 'Homepage Featured — 14 days', 'homepage', 4, 14, true, 50),
  ('location_featured_7', 'Location Featured — 7 days', 'location', 1, 7, true, 60),
  ('location_featured_14', 'Location Featured — 14 days', 'location', 2, 14, true, 70)
on conflict (slug) do nothing;
