-- ============================================================================
-- 0007_applications_and_interactions.sql
-- ============================================================================
-- Agent applications + property interaction (deal workflow) tracking.
--
-- Per spec Sections 12 + 13:
--   * Agents apply to represent properties. Owner/company can accept/decline.
--   * Statuses: pending / accepted / declined / withdrawn / expired / completed
--   * Property interaction workflow (V1 boundary — no escrow, no money held):
--     inquiry → inspection_scheduled → inspection_completed → negotiation →
--     offer_made → offer_accepted → transaction_completed
-- ============================================================================

-- ---------------------------------------------------------------------------
-- property_applications
-- One agent → one property. Prevents duplicate ACTIVE applications.
-- An agent may re-apply after a previous one is declined/withdrawn/expired.
-- ---------------------------------------------------------------------------
create table if not exists public.property_applications (
  id uuid primary key default gen_random_uuid(),

  property_id uuid not null references public.properties(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  -- The party that receives + can accept/decline. Usually the property's
  -- owner_profile_id or listing_creator_id, denormalised here for fast authz.
  decision_maker_id uuid not null references public.profiles(id) on delete cascade,

  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'expired', 'completed')),

  application_message text,
  proposed_commission_pct numeric(5,2) check (proposed_commission_pct >= 0 and proposed_commission_pct <= 100),
  proposed_commission_flat bigint, -- alternative: flat Naira amount (minor units)
  additional_info jsonb not null default '{}'::jsonb,

  -- Decision tracking
  decided_at timestamptz,
  decision_reason text,

  -- Expiry
  expires_at timestamptz,

  -- Soft deletion by applicant (hides from their list, keeps audit trail)
  withdrawn_at timestamptz,

  -- Completed workflow
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Prevent duplicate ACTIVE applications (one pending OR accepted per agent+property)
  constraint unique_active_application
    exclude (property_id with =, agent_id with =)
    where (status in ('pending', 'accepted'))
);

create trigger property_applications_set_updated_at
  before update on public.property_applications
  for each row execute function public.set_updated_at();

create index if not exists property_applications_property_idx
  on public.property_applications(property_id, status);
create index if not exists property_applications_agent_idx
  on public.property_applications(agent_id, status);
create index if not exists property_applications_decision_maker_idx
  on public.property_applications(decision_maker_id, status);
create index if not exists property_applications_status_idx
  on public.property_applications(status);
create index if not exists property_applications_created_at_idx
  on public.property_applications(created_at desc);

-- ---------------------------------------------------------------------------
-- property_interactions
-- Append-only log of the deal workflow. Each row is one stage transition.
-- This is NOT a state machine on a single row — it's a timeline of events.
-- Anyone reading can reconstruct the deal's history.
-- ---------------------------------------------------------------------------
create table if not exists public.property_interactions (
  id uuid primary key default gen_random_uuid(),

  property_id uuid not null references public.properties(id) on delete cascade,
  -- The party whose stage this is. May be the owner, agent, or applicant.
  -- Optional for system-generated events.
  actor_id uuid references public.profiles(id) on delete set null,
  -- Linked application (when the interaction is part of an agent engagement)
  application_id uuid references public.property_applications(id) on delete set null,

  stage text not null check (stage in (
    'inquiry', 'inspection_scheduled', 'inspection_completed',
    'negotiation', 'offer_made', 'offer_accepted', 'transaction_completed'
  )),

  notes text,
  metadata jsonb not null default '{}'::jsonb,

  -- Optional scheduled event time (e.g. inspection scheduled for next Tuesday)
  scheduled_for timestamptz,

  -- The actor that actually moved the deal past this stage (e.g. who marked
  -- inspection_completed). Useful for disputes.
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists property_interactions_property_idx
  on public.property_interactions(property_id, created_at);
create index if not exists property_interactions_application_idx
  on public.property_interactions(application_id)
  where application_id is not null;
create index if not exists property_interactions_stage_idx
  on public.property_interactions(stage);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.property_applications enable row level security;
alter table public.property_interactions enable row level security;

-- Applications: visible to agent + decision_maker (and admins via service role).
create policy "Agents can read their own applications"
  on public.property_applications for select
  to authenticated
  using (
    agent_id in (select id from public.profiles where user_id = auth.uid())
    or decision_maker_id in (select id from public.profiles where user_id = auth.uid())
  );

create policy "Agents can submit applications"
  on public.property_applications for insert
  to authenticated
  with check (
    agent_id in (select id from public.profiles where user_id = auth.uid())
    and decision_maker_id in (
      select p.id from public.profiles p
      join public.properties prop on prop.id = property_applications.property_id
      where prop.owner_profile_id = p.id or prop.listing_creator_id = p.id
    )
  );

create policy "Decision makers can update application status"
  on public.property_applications for update
  to authenticated
  using (
    decision_maker_id in (select id from public.profiles where user_id = auth.uid())
    or agent_id in (select id from public.profiles where user_id = auth.uid())
  )
  with check (
    decision_maker_id in (select id from public.profiles where user_id = auth.uid())
    or agent_id in (select id from public.profiles where user_id = auth.uid())
  );

-- Interactions: visible to property owner / listing creator / managing agent
-- + applicant agents for that property.
create policy "Property participants can read interactions"
  on public.property_interactions for select
  to authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_interactions.property_id
      and (
        p.owner_profile_id in (select id from public.profiles where user_id = auth.uid())
        or p.listing_creator_id in (select id from public.profiles where user_id = auth.uid())
        or p.managing_agent_id in (select id from public.profiles where user_id = auth.uid())
      )
    )
    or exists (
      select 1 from public.property_applications pa
      where pa.id = property_interactions.application_id
        and pa.agent_id in (select id from public.profiles where user_id = auth.uid())
    )
  );

create policy "Property participants can write interactions"
  on public.property_interactions for insert
  to authenticated
  with check (
    actor_id in (select id from public.profiles where user_id = auth.uid())
  );
