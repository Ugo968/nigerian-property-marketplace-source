-- ============================================================================
-- 0028_property_types_and_location_extensions.sql
-- ============================================================================
-- Adds new Nigerian-market property types (self-contained, room, room and
-- parlour, studio, mini flat, shared accommodation, student accommodation)
-- and extends the property_locations table with an LGA column.
--
-- Per spec Section 7: "Avoid creating duplicate or conflicting property
-- types if equivalent categories already exist."
-- We ADD new types that don't conflict with existing ones. The existing
-- 'apartment' slug is NOT changed — 'self_contained' and 'mini_flat' are
-- new distinct types.
--
-- Per spec Section 6: Nigerian location hierarchy — add LGA column.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Seed new property types.
--    Idempotent — on conflict do nothing.
-- ---------------------------------------------------------------------------
insert into public.property_types (slug, label, category, sort_order)
values
  ('self_contained',        'Self-Contained',           'residential', 15),
  ('room',                  'Room',                     'residential', 16),
  ('room_and_parlour',      'Room and Parlour',         'residential', 17),
  ('studio',               'Studio Apartment',         'residential', 18),
  ('mini_flat',             'Mini Flat',                'residential', 19),
  ('one_bedroom',           'One-Bedroom Apartment',    'residential', 20),
  ('two_bedroom',           'Two-Bedroom Apartment',    'residential', 21),
  ('three_bedroom',         'Three-Bedroom Apartment', 'residential', 22),
  ('four_or_more_bedroom',  'Four+ Bedroom Apartment',  'residential', 23),
  ('shared_accommodation',  'Shared Accommodation',     'residential', 24),
  ('student_accommodation','Student Accommodation',    'residential', 25),
  ('commercial_property',   'Commercial Property',      'commercial',  135),
  ('land',                  'Land',                     'land',         225)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Add LGA column to property_locations.
--    Per spec Section 6: "Local government area where appropriate"
--    Per spec Section 7: "LGA where available" as a search filter.
-- ---------------------------------------------------------------------------
alter table public.property_locations
  add column if not exists address_lga text;

-- Add an index for LGA-based search filtering.
create index if not exists property_locations_lga_idx
  on public.property_locations(state, city, address_lga)
  where address_lga is not null;

-- ---------------------------------------------------------------------------
-- 3. Add keyword search alias table — maps Nigerian-market colloquial
--    terms to canonical property type slugs so search queries like
--    "self con" find "self_contained" properties.
--
--    Per spec Section 7: "For self-contained searches, support both the
--    standardized property type and reasonable keyword matching so users
--    can find listings even when descriptions use terms such as
--    'self con' or 'self-contained'."
-- ---------------------------------------------------------------------------
create table if not exists public.property_type_keywords (
  id uuid primary key default gen_random_uuid(),
  property_type_slug text not null references public.property_types(slug) on delete cascade,
  keyword text not null,
  -- Normalised lowercase for case-insensitive matching
  keyword_normalized text generated always as (lower(trim(keyword))) stored,
  created_at timestamptz not null default now(),
  unique (property_type_slug, keyword_normalized)
);

create index if not exists property_type_keywords_normalized_idx
  on public.property_type_keywords(keyword_normalized);

alter table public.property_type_keywords enable row level security;

-- Public read — anyone searching properties needs keyword lookup.
create policy "Property type keywords are publicly readable"
  on public.property_type_keywords for select
  to anon, authenticated
  using (true);

-- Server-only writes (no client INSERT/UPDATE/DELETE policy).

-- Seed common keywords.
insert into public.property_type_keywords (property_type_slug, keyword)
values
  ('self_contained', 'self con'),
  ('self_contained', 'self-con'),
  ('self_contained', 'self contained'),
  ('self_contained', 'selfcontained'),
  ('self_contained', 'selfcon'),
  ('self_contained', 'single room self contained'),
  ('room', 'single room'),
  ('room', 'room only'),
  ('room_and_parlour', 'room and parlor'),
  ('room_and_parlour', 'room & parlour'),
  ('studio', 'studio apartment'),
  ('studio', 'studio flat'),
  ('mini_flat', 'mini flat'),
  ('mini_flat', 'miniflat'),
  ('mini_flat', 'self contain'),
  ('one_bedroom', '1 bedroom'),
  ('one_bedroom', '1bedroom'),
  ('two_bedroom', '2 bedroom'),
  ('two_bedroom', '2bedroom'),
  ('three_bedroom', '3 bedroom'),
  ('three_bedroom', '3bedroom'),
  ('four_or_more_bedroom', '4 bedroom'),
  ('four_or_more_bedroom', '4+ bedroom'),
  ('shared_accommodation', 'shared flat'),
  ('shared_accommodation', 'shared house'),
  ('student_accommodation', 'student hostel'),
  ('student_accommodation', 'hostel'),
  ('shortlet', 'short let'),
  ('shortlet', 'short-let'),
  ('shortlet', 'airbnb'),
  ('shop', 'shop for rent'),
  ('office', 'office space'),
  ('land', 'land for sale'),
  ('land', 'plot of land')
on conflict (property_type_slug, keyword_normalized) do nothing;

-- End of migration 0028_property_types_and_location_extensions.sql.
