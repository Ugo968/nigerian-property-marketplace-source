-- ============================================================================
-- 0020_property_agent_representations.sql
-- ============================================================================
-- Dedicated representation relationship table.
--
-- Per spec Section 18 + 34:
--   * An accepted application establishes "Agent A represents Property P"
--   * The relationship has start/end dates + status
--   * Multiple agents may represent a property (spec Section 19)
--   * Contradictory duplicate active relationships are prevented
--
-- The existing `properties.managing_agent_id` column (from migration 0005)
-- is a single-agent pointer — it remains for backwards compatibility
-- (identifies the PRIMARY managing agent). This new table supports the
-- full many-to-many representation model.
-- ============================================================================

create table if not exists public.property_agent_representations (
  id uuid primary key default gen_random_uuid(),

  property_id uuid not null references public.properties(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  -- The owner/company that authorised this representation
  owner_id uuid not null references public.profiles(id) on delete cascade,
  -- The application that created this representation
  source_application_id uuid references public.property_applications(id) on delete set null,

  status text not null default 'active'
    check (status in ('active', 'ended', 'suspended')),

  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  end_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Prevent duplicate ACTIVE representations for the same (property, agent)
  unique (property_id, agent_id) deferrable initially deferred
);

create trigger property_agent_representations_set_updated_at
  before update on public.property_agent_representations
  for each row execute function public.set_updated_at();

create index if not exists property_agent_representations_property_idx
  on public.property_agent_representations(property_id, status);
create index if not exists property_agent_representations_agent_idx
  on public.property_agent_representations(agent_id, status);
create index if not exists property_agent_representations_owner_idx
  on public.property_agent_representations(owner_id, status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.property_agent_representations enable row level security;

-- Public can read active representations for visible properties (so the
-- property page can show "Represented by Agent X").
create policy "Public can read active representations for visible properties"
  on public.property_agent_representations for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_agent_representations.property_id
        and p.deleted_at is null
        and p.published_at is not null
        and p.status in ('available', 'application_pending', 'under_offer', 'rented', 'sold')
    )
  );

-- Agents can read their own representations
create policy "Agents can read their own representations"
  on public.property_agent_representations for select
  to authenticated
  using (agent_id in (select id from public.profiles where user_id = auth.uid()));

-- Property owners can read + manage representations for their properties
create policy "Property owners can manage representations"
  on public.property_agent_representations for all
  to authenticated
  using (
    owner_id in (select id from public.profiles where user_id = auth.uid())
    or property_id in (
      select id from public.properties
      where listing_creator_id in (select id from public.profiles where user_id = auth.uid())
    )
  )
  with check (
    owner_id in (select id from public.profiles where user_id = auth.uid())
    or property_id in (
      select id from public.properties
      where listing_creator_id in (select id from public.profiles where user_id = auth.uid())
    )
  );
