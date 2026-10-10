-- ============================================================================
-- 0006_property_media_and_amenities.sql
-- ============================================================================
-- Property media (photos / videos / floor plans) + amenities (extensible
-- master list + many-to-many join). Per spec Sections 9 + 10.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- amenities — master list. Extensible at runtime via admin UI.
-- ---------------------------------------------------------------------------
create table if not exists public.amenities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  category text not null default 'general' check (category in (
    'general', 'utility', 'security', 'outdoor', 'indoor', 'appliance', 'other'
  )),
  icon text, -- optional lucide icon name
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists amenities_active_idx
  on public.amenities(is_active, sort_order);

-- ---------------------------------------------------------------------------
-- property_amenities — many-to-many join
-- ---------------------------------------------------------------------------
create table if not exists public.property_amenities (
  property_id uuid not null references public.properties(id) on delete cascade,
  amenity_id uuid not null references public.amenities(id) on delete restrict,
  -- Optional value field for amenities that take a value (e.g. "parking: 2 cars")
  value text,
  created_at timestamptz not null default now(),
  primary key (property_id, amenity_id)
);

create index if not exists property_amenities_amenity_idx
  on public.property_amenities(amenity_id);

-- ---------------------------------------------------------------------------
-- property_media — metadata + storage references
-- ---------------------------------------------------------------------------
create table if not exists public.property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video', 'floor_plan', 'document')),
  storage_path text not null unique,
  thumbnail_path text,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  width int,
  height int,
  duration_seconds int, -- for videos
  caption text,
  alt_text text,
  sort_order int not null default 0,
  is_featured boolean not null default false,
  uploaded_at timestamptz not null default now()
);

-- At most one featured media per property
create unique index if not exists property_media_featured_uniq
  on public.property_media(property_id)
  where is_featured = true;

create index if not exists property_media_property_idx
  on public.property_media(property_id, sort_order);
create index if not exists property_media_type_idx
  on public.property_media(property_id, media_type);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.amenities enable row level security;
alter table public.property_amenities enable row level security;
alter table public.property_media enable row level security;

-- Amenities master: public read, admin write via service role.
create policy "Amenities are publicly readable"
  on public.amenities for select
  to anon, authenticated
  using (is_active = true);

-- property_amenities: public can read for visible properties;
-- owners/creators/agents can manage.
create policy "Public can read amenities of visible properties"
  on public.property_amenities for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_amenities.property_id
        and p.deleted_at is null
        and p.published_at is not null
        and p.status in ('available', 'application_pending', 'under_offer', 'rented', 'sold')
    )
  );

create policy "Property managers can manage amenities"
  on public.property_amenities for all
  to authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_amenities.property_id
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
      where p.id = property_amenities.property_id
        and (
          p.owner_profile_id in (select id from public.profiles where user_id = auth.uid())
          or p.listing_creator_id in (select id from public.profiles where user_id = auth.uid())
          or p.managing_agent_id in (select id from public.profiles where user_id = auth.uid())
        )
    )
  );

-- property_media: same pattern.
create policy "Public can read media of visible properties"
  on public.property_media for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_media.property_id
        and p.deleted_at is null
        and p.published_at is not null
        and p.status in ('available', 'application_pending', 'under_offer', 'rented', 'sold')
    )
  );

create policy "Property managers can manage media"
  on public.property_media for all
  to authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_media.property_id
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
      where p.id = property_media.property_id
        and (
          p.owner_profile_id in (select id from public.profiles where user_id = auth.uid())
          or p.listing_creator_id in (select id from public.profiles where user_id = auth.uid())
          or p.managing_agent_id in (select id from public.profiles where user_id = auth.uid())
        )
    )
  );
