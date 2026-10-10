-- ============================================================================
-- 0005_properties.sql
-- ============================================================================
-- Central property model. Per spec Section 6, supports ALL major property
-- types — apartments, houses, land, commercial, industrial, etc. The
-- property-type list is extensible via the `property_types` master table.
--
-- Ownership model (spec Section 11):
--   * owner_profile_id      — the actual property owner (landlord/company)
--   * listing_creator_id    — who published the listing (may be the owner
--                             themselves, or an agent acting on their behalf)
--   * managing_agent_id     — the agent currently representing the property
--                             (set when an application is accepted)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- property_types — master list. Extensible at runtime via admin UI.
-- ---------------------------------------------------------------------------
create table if not exists public.property_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  category text not null check (category in (
    'residential', 'commercial', 'industrial', 'land', 'mixed_use', 'other'
  )),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists property_types_category_idx
  on public.property_types(category);
create index if not exists property_types_active_idx
  on public.property_types(is_active, sort_order);

-- ---------------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------------
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),

  -- Ownership / management (spec Section 11)
  owner_profile_id uuid references public.profiles(id) on delete restrict,
  listing_creator_id uuid not null references public.profiles(id) on delete restrict,
  managing_agent_id uuid references public.profiles(id) on delete set null,

  -- Basics
  title text not null,
  description text,
  property_type_id uuid not null references public.property_types(id),
  transaction_type text not null check (transaction_type in ('rent', 'sale', 'shortlet')),

  -- Pricing
  price bigint not null check (price >= 0), -- minor units (kobo)
  price_frequency text check (price_frequency in (
    'one_off', 'per_day', 'per_week', 'per_month', 'per_year'
  )),
  currency text not null default 'NGN' check (currency in ('NGN', 'USD')),

  -- Specs
  bedrooms smallint not null default 0 check (bedrooms >= 0),
  bathrooms smallint not null default 0 check (bathrooms >= 0),
  toilets smallint not null default 0 check (toilets >= 0),
  size_value numeric check (size_value > 0),
  size_unit text check (size_unit in ('sqm', 'sqft', 'acre', 'hectare', 'plot')),
  furnished boolean not null default false,

  -- Lifecycle
  status text not null default 'draft'
    check (status in (
      'draft', 'available', 'application_pending', 'under_offer',
      'rented', 'sold', 'unavailable', 'suspended', 'removed'
    )),
  availability_date date,
  availability_end_date date,

  -- Soft deletion
  deleted_at timestamptz,

  -- Timestamps
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Constraint: rent/shortlet must have a price frequency; sale must be one_off
  constraint valid_price_frequency check (
    (transaction_type = 'sale' and price_frequency = 'one_off')
    or (transaction_type in ('rent', 'shortlet') and price_frequency is not null)
  ),

  -- Constraint: owner must have a role that can own properties
  constraint owner_role_valid check (
    owner_profile_id is null -- null until assignment in some flows
    or exists (
      select 1 from public.profiles p
      where p.id = owner_profile_id
        and p.role in ('landlord', 'company')
    )
  ),

  -- Constraint: listing creator must be an active marketplace user
  constraint creator_role_valid check (
    exists (
      select 1 from public.profiles p
      where p.id = listing_creator_id
        and p.role in ('landlord', 'agent', 'company')
    )
  )
);

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- Indexes for common search queries
create index if not exists properties_owner_idx
  on public.properties(owner_profile_id);
create index if not exists properties_creator_idx
  on public.properties(listing_creator_id);
create index if not exists properties_managing_agent_idx
  on public.properties(managing_agent_id)
  where managing_agent_id is not null;
create index if not exists properties_transaction_type_idx
  on public.properties(transaction_type);
create index if not exists properties_property_type_idx
  on public.properties(property_type_id);
create index if not exists properties_status_idx
  on public.properties(status);
create index if not exists properties_price_idx
  on public.properties(price);
create index if not exists properties_bedrooms_idx
  on public.properties(bedrooms);
create index if not exists properties_published_at_idx
  on public.properties(published_at desc)
  where published_at is not null;
create index if not exists properties_deleted_at_idx
  on public.properties(deleted_at)
  where deleted_at is not null;

-- Full-text search index on title + description
create index if not exists properties_search_idx
  on public.properties using gin (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  );

-- ---------------------------------------------------------------------------
-- property_locations
-- Split from properties for two reasons:
--   1. Lets us store a public_lat/public_lng (rounded ~100m) separately
--      from a private exact address — only released to authorised parties.
--   2. Lets future search optimise by geo without bloating the main table.
-- ---------------------------------------------------------------------------
create table if not exists public.property_locations (
  property_id uuid primary key references public.properties(id) on delete cascade,
  country text not null default 'Nigeria',
  state text not null,
  city text not null,
  area text,
  landmark text,
  -- Private exact address — never shown publicly by default
  address_line text,
  address_lga text,
  -- Private exact coordinates (used by maps for owners + accepted agents)
  private_lat numeric(9,6),
  private_lng numeric(9,6),
  -- Public approximate coordinates (rounded to ~3 decimal places ≈ 111m)
  public_lat numeric(9,3),
  public_lng numeric(9,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint coordinates_pair_valid check (
    (private_lat is null and private_lng is null)
    or (private_lat is not null and private_lng is not null)
  ),
  constraint public_coordinates_pair_valid check (
    (public_lat is null and public_lng is null)
    or (public_lat is not null and public_lng is not null)
  )
);

create trigger property_locations_set_updated_at
  before update on public.property_locations
  for each row execute function public.set_updated_at();

create index if not exists property_locations_state_idx
  on public.property_locations(state);
create index if not exists property_locations_city_idx
  on public.property_locations(city);
create index if not exists property_locations_area_idx
  on public.property_locations(area)
  where area is not null;
create index if not exists property_locations_geo_idx
  on public.property_locations(public_lat, public_lng)
  where public_lat is not null and public_lng is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.properties enable row level security;
alter table public.property_locations enable row level security;
alter table public.property_types enable row level security;

-- property_types: public read, admin write (service role bypasses RLS).
create policy "Property types are publicly readable"
  on public.property_types for select
  to anon, authenticated
  using (is_active = true);

-- Public can read active (non-deleted, non-suspended, non-draft) properties.
create policy "Active properties are publicly readable"
  on public.properties for select
  to anon, authenticated
  using (
    deleted_at is null
    and status in ('available', 'application_pending', 'under_offer', 'rented', 'sold')
    and published_at is not null
  );

-- Owners + managing agents can read their own properties regardless of status.
create policy "Owners and creators can read their properties"
  on public.properties for select
  to authenticated
  using (
    deleted_at is null
    and (
      owner_profile_id in (
        select id from public.profiles where user_id = auth.uid()
      )
      or listing_creator_id in (
        select id from public.profiles where user_id = auth.uid()
      )
      or managing_agent_id in (
        select id from public.profiles where user_id = auth.uid()
      )
    )
  );

-- Insert: only the listing creator (and they must be the actual creator).
create policy "Users can create properties"
  on public.properties for insert
  to authenticated
  with check (
    listing_creator_id in (
      select id from public.profiles where user_id = auth.uid()
    )
  );

-- Update: only owner / creator / managing agent.
create policy "Owners / creators / managing agents can update properties"
  on public.properties for update
  to authenticated
  using (
    owner_profile_id in (select id from public.profiles where user_id = auth.uid())
    or listing_creator_id in (select id from public.profiles where user_id = auth.uid())
    or managing_agent_id in (select id from public.profiles where user_id = auth.uid())
  )
  with check (
    owner_profile_id in (select id from public.profiles where user_id = auth.uid())
    or listing_creator_id in (select id from public.profiles where user_id = auth.uid())
    or managing_agent_id in (select id from public.profiles where user_id = auth.uid())
  );

-- Soft-delete: only owner / creator.
create policy "Owners / creators can soft-delete properties"
  on public.properties for delete
  to authenticated
  using (
    owner_profile_id in (select id from public.profiles where user_id = auth.uid())
    or listing_creator_id in (select id from public.profiles where user_id = auth.uid())
  );

-- Locations follow property access.
create policy "Public can read public location fields of active properties"
  on public.property_locations for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_locations.property_id
        and p.deleted_at is null
        and p.published_at is not null
        and p.status in ('available', 'application_pending', 'under_offer', 'rented', 'sold')
    )
  );

create policy "Property owners / creators / agents can manage locations"
  on public.property_locations for all
  to authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_locations.property_id
        and (
          p.owner_profile_id in (select id from public.profiles where user_id = auth.uid())
          or p.listing_creator_id in (select id from public.profiles where user_id = auth.uid())
          or p.managing_agent_id in (select id from public.profiles where user_id = auth.uid())
        )
    )
  )
  with check (
    exists (
      select 1 from public.properties p
      where p.id = property_locations.property_id
        and (
          p.owner_profile_id in (select id from public.profiles where user_id = auth.uid())
          or p.listing_creator_id in (select id from public.profiles where user_id = auth.uid())
          or p.managing_agent_id in (select id from public.profiles where user_id = auth.uid())
        )
    )
  );
