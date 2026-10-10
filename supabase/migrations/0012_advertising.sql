-- ============================================================================
-- 0012_advertising.sql
-- ============================================================================
-- Separate advertising system. Per spec Section 19, housing-related
-- businesses (carpenters, plumbers, etc.) are NOT a fourth marketplace
-- role. They use this advertising system.
--
-- Minimum campaign budget: ₦5,000 (the floor, not the only price).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- advertiser_categories — master list
-- ---------------------------------------------------------------------------
create table if not exists public.advertiser_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists advertiser_categories_active_idx
  on public.advertiser_categories(is_active, sort_order);

-- ---------------------------------------------------------------------------
-- advertising_placements — master list of where ads can appear
-- ---------------------------------------------------------------------------
create table if not exists public.advertising_placements (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists advertising_placements_active_idx
  on public.advertising_placements(is_active, sort_order);

-- ---------------------------------------------------------------------------
-- advertising_businesses — the advertiser's profile. Separate from
-- public.profiles (advertisers are NOT marketplace role-holders).
-- ---------------------------------------------------------------------------
create table if not exists public.advertising_businesses (
  id uuid primary key default gen_random_uuid(),
  -- The owning user (must have an auth.users account)
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  category_id uuid not null references public.advertiser_categories(id),
  -- The contact email — may differ from owner's auth email
  contact_email text not null,
  contact_phone text,
  website text,
  description text,
  logo_url text,
  address text,
  state text,
  city text,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'suspended', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger advertising_businesses_set_updated_at
  before update on public.advertising_businesses
  for each row execute function public.set_updated_at();

create index if not exists advertising_businesses_owner_idx
  on public.advertising_businesses(owner_user_id);
create index if not exists advertising_businesses_category_idx
  on public.advertising_businesses(category_id);
create index if not exists advertising_businesses_status_idx
  on public.advertising_businesses(status);

-- ---------------------------------------------------------------------------
-- advertising_creatives — the visual asset for one campaign variant
-- ---------------------------------------------------------------------------
create table if not exists public.advertising_creatives (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.advertising_businesses(id) on delete cascade,
  creative_type text not null check (creative_type in ('image', 'video', 'text')),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  headline text,
  body_text text,
  cta_text text,
  target_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists advertising_creatives_business_idx
  on public.advertising_creatives(business_id);

-- ---------------------------------------------------------------------------
-- advertising_campaigns
-- ---------------------------------------------------------------------------
create table if not exists public.advertising_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.advertising_businesses(id) on delete cascade,
  name text not null,
  creative_id uuid references public.advertising_creatives(id) on delete set null,
  status text not null default 'draft'
    check (status in (
      'draft', 'pending_payment', 'pending_review', 'active',
      'paused', 'completed', 'rejected', 'cancelled'
    )),
  -- Budget in minor units (kobo). Floor: ₦5,000 = 500000 kobo
  budget_naira bigint not null check (budget_naira >= 500000),
  spent_naira bigint not null default 0 check (spent_naira >= 0 and spent_naira <= budget_naira),
  -- Placement + targeting
  placement_id uuid not null references public.advertising_placements(id),
  target_categories uuid[] default '{}', -- advertiser_categories to target (for category placement)
  target_states text[] default '{}',
  target_cities text[] default '{}',
  -- Lifecycle
  starts_at timestamptz,
  ends_at timestamptz,
  reviewed_at timestamptz,
  reviewer_id uuid references public.admin_users(id) on delete set null,
  rejection_reason text,
  -- Metrics
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  -- Linked payment
  payment_id uuid references public.payments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Sanity: end must be after start (when both set)
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create trigger advertising_campaigns_set_updated_at
  before update on public.advertising_campaigns
  for each row execute function public.set_updated_at();

create index if not exists advertising_campaigns_business_idx
  on public.advertising_campaigns(business_id, status);
create index if not exists advertising_campaigns_active_idx
  on public.advertising_campaigns(placement_id, status, starts_at, ends_at)
  where status in ('active', 'pending_review');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.advertiser_categories enable row level security;
alter table public.advertising_placements enable row level security;
alter table public.advertising_businesses enable row level security;
alter table public.advertising_creatives enable row level security;
alter table public.advertising_campaigns enable row level security;

-- Master lists: public read.
create policy "Advertiser categories are publicly readable"
  on public.advertiser_categories for select
  to anon, authenticated
  using (is_active = true);

create policy "Advertising placements are publicly readable"
  on public.advertising_placements for select
  to anon, authenticated
  using (is_active = true);

-- Businesses: public can read approved ones; owner can read all their own.
create policy "Approved advertisers are publicly readable"
  on public.advertising_businesses for select
  to anon, authenticated
  using (status = 'approved');

create policy "Owners can read their own advertising businesses"
  on public.advertising_businesses for select
  to authenticated
  using (owner_user_id = auth.uid());

create policy "Owners can manage their own advertising businesses"
  on public.advertising_businesses for all
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- Creatives: owner manages; public reads when used in approved campaigns.
create policy "Owners can manage their advertising creatives"
  on public.advertising_creatives for all
  to authenticated
  using (
    exists (
      select 1 from public.advertising_businesses b
      where b.id = advertising_creatives.business_id
        and b.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.advertising_businesses b
      where b.id = advertising_creatives.business_id
        and b.owner_user_id = auth.uid()
    )
  );

-- Public can read creatives only when they're linked to an active campaign.
create policy "Public can read creatives in active campaigns"
  on public.advertising_creatives for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.advertising_campaigns c
      join public.advertising_businesses b on b.id = c.business_id
      where c.creative_id = advertising_creatives.id
        and c.status = 'active'
        and b.status = 'approved'
    )
  );

-- Campaigns: owner manages their own; public reads active ones.
create policy "Owners can manage their own campaigns"
  on public.advertising_campaigns for all
  to authenticated
  using (
    exists (
      select 1 from public.advertising_businesses b
      where b.id = advertising_campaigns.business_id
        and b.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.advertising_businesses b
      where b.id = advertising_campaigns.business_id
        and b.owner_user_id = auth.uid()
    )
  );

create policy "Active campaigns are publicly readable"
  on public.advertising_campaigns for select
  to anon, authenticated
  using (
    status = 'active'
    and exists (
      select 1 from public.advertising_businesses b
      where b.id = advertising_campaigns.business_id
        and b.status = 'approved'
    )
  );
