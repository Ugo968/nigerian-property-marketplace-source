-- ============================================================================
-- 0025_property_transactions.sql
-- ============================================================================
-- Property Transaction Workflow (Prompt 18).
--
-- Creates the normalized transaction/deal model that takes a real estate
-- interaction from inquiry to completion:
--
--   Inquiry → Inspection Scheduled → Inspection Completed → Negotiation
--          → Offer Made → Offer Accepted → Transaction Completed
--
-- CRITICAL MONEY RULE (spec Section 2, 44, 55):
--   V1 does NOT hold or transfer property transaction money.
--   No escrow, rent collection, purchase-money, deposits, commissions.
--   The Paystack/Flutterwave infrastructure remains for PLATFORM payments
--   only (subscriptions, featured, advertising). This migration creates
--   NO payment columns on transactions — amounts are TRACKED for
--   negotiation/offer purposes only and are NEVER collected by the
--   platform.
--
-- Tables:
--   * transactions                    — primary deal entity
--   * transaction_participants        — multi-party involvement tracking
--   * transaction_status_history      — append-only state transitions
--   * inspections                      — separate inspection scheduling
--   * negotiation_records             — proposed prices/terms
--   * offers                           — formal offer entity
--   * offer_history                    — immutable counter-offer chain
--
-- RLS strategy:
--   * transactions + participants + status_history + inspections +
--     negotiation_records + offers + offer_history:
--     participants-only access (the customer, property owner, listing
--     creator, and managing agent/company of the property)
--   * Admins use the service-role admin client (RLS bypass) — admin
--     authorization is enforced at the application layer via
--     requireAdminPermission() per spec Section 47
--
-- Idempotency:
--   * transactions have UNIQUE on (property_id, customer_id, transaction_type)
--     WHERE status NOT IN terminal states — prevents duplicate active
--     transactions for the same (property, customer, type)
--   * offers have UNIQUE on (transaction_id, status) WHERE status='submitted'
--     — only one active offer per customer per transaction at a time
--   * SECURITY DEFINER functions use conditional UPDATE ... WHERE
--     new_state = old_state IS NOT TRUE to make transitions idempotent
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. transactions — primary deal entity
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  -- The property the transaction is about
  property_id uuid not null references public.properties(id) on delete restrict,
  -- rent / sale / shortlet (matches properties.transaction_type)
  transaction_type text not null check (transaction_type in ('rent', 'sale', 'shortlet')),

  -- Participants (denormalised for fast authz; full list in
  -- transaction_participants)
  initiated_by uuid not null references public.profiles(id) on delete restrict,
  -- The property owner at the time of initiation (snapshot — may change
  -- if the property is reassigned, but the transaction stays bound to
  -- the original owner unless explicitly transferred)
  owner_id uuid references public.profiles(id) on delete set null,
  -- The prospective customer (buyer/renter/short-let customer)
  customer_id uuid not null references public.profiles(id) on delete restrict,
  -- Optional managing agent / company (from property_agent_representations)
  managing_agent_id uuid references public.profiles(id) on delete set null,
  managing_company_id uuid references public.profiles(id) on delete set null,

  -- Lifecycle
  current_status text not null default 'inquiry'
    check (current_status in (
      'inquiry',
      'inspection_scheduled',
      'inspection_completed',
      'negotiation',
      'offer_made',
      'offer_accepted',
      'transaction_completed',
      'cancelled',
      'withdrawn',
      'expired',
      'declined'
    )),

  -- Linked conversation (system messages about workflow events land here)
  conversation_id uuid,

  -- Cancellation / completion bookkeeping
  cancellation_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,

  completion_notes text,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,

  -- The accepted offer (immutable once set)
  accepted_offer_id uuid,

  -- Optional metadata (sanitised — no secrets)
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- Idempotency: one active transaction per (property, customer, type)
create unique index if not exists transactions_active_unique_idx
  on public.transactions(property_id, customer_id, transaction_type)
  where current_status not in ('cancelled', 'withdrawn', 'expired', 'declined', 'transaction_completed');

create index if not exists transactions_property_idx
  on public.transactions(property_id, current_status);
create index if not exists transactions_customer_idx
  on public.transactions(customer_id, current_status);
create index if not exists transactions_owner_idx
  on public.transactions(owner_id, current_status);
create index if not exists transactions_managing_agent_idx
  on public.transactions(managing_agent_id)
  where managing_agent_id is not null;
create index if not exists transactions_status_idx
  on public.transactions(current_status, created_at desc);
create index if not exists transactions_conversation_idx
  on public.transactions(conversation_id)
  where conversation_id is not null;

-- ---------------------------------------------------------------------------
-- 2. transaction_participants — full involvement list
--    A transaction may involve multiple parties:
--      - customer (prospective buyer/renter/short-let customer)
--      - owner (property owner)
--      - listing_creator (the user who created the listing — may differ)
--      - managing_agent (when representation exists)
--      - managing_company (when applicable)
--    This table tracks the full set so RLS can grant access to everyone
--    who should see the transaction.
-- ---------------------------------------------------------------------------
create table if not exists public.transaction_participants (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Role in this transaction
  role text not null check (role in (
    'customer', 'owner', 'listing_creator', 'managing_agent',
    'managing_company', 'agent_assistant'
  )),
  -- Whether the participant is still active (e.g. an agent's representation ended)
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Prevent duplicate (transaction, user, role) entries
  unique (transaction_id, user_id, role)
);

create index if not exists transaction_participants_user_idx
  on public.transaction_participants(user_id);
create index if not exists transaction_participants_transaction_idx
  on public.transaction_participants(transaction_id);

-- ---------------------------------------------------------------------------
-- 3. transaction_status_history — append-only state transitions
--    Every status change records: previous, new, actor, reason, timestamp.
--    The history table is INSERT-only (no UPDATE/DELETE RLS policies).
--    Per spec Section 9: "The history cannot be rewritten by normal users."
-- ---------------------------------------------------------------------------
create table if not exists public.transaction_status_history (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  previous_status text,
  new_status text not null,
  -- The actor who triggered the transition (auth.users.id for audit,
  -- denormalised to profile.id for the participant table join)
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  -- Optional reason / notes
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists transaction_status_history_transaction_idx
  on public.transaction_status_history(transaction_id, created_at desc);
create index if not exists transaction_status_history_actor_idx
  on public.transaction_status_history(actor_profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. inspections — separate inspection scheduling
--    Per spec Section 11: inspection has its own sub-state machine
--    (proposed → confirmed → reschedule_requested → completed → cancelled
--     → no_show).
--    Per spec Section 14: private exact addresses are NOT exposed here —
--    the inspection references the property_id; the property's
--    public/private location distinction (Prompt 8) controls what
--    address is shown to whom.
-- ---------------------------------------------------------------------------
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,

  -- Scheduled date/time (UTC — display layer converts to user's TZ)
  proposed_at timestamptz not null,
  -- Original timezone string for display (e.g. "Africa/Lagos")
  proposed_timezone text not null default 'Africa/Lagos',
  -- End time (optional — for multi-hour inspections)
  proposed_ends_at timestamptz,

  -- Who proposed this slot
  proposed_by uuid not null references public.profiles(id) on delete restrict,

  -- Sub-status
  status text not null default 'proposed'
    check (status in (
      'proposed', 'confirmed', 'reschedule_requested',
      'completed', 'cancelled', 'no_show'
    )),

  -- Confirmation / completion metadata
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,

  -- Notes (sanitised — no secrets, no payment instructions per spec 43)
  notes text,
  cancellation_reason text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger inspections_set_updated_at
  before update on public.inspections
  for each row execute function public.set_updated_at();

create index if not exists inspections_transaction_idx
  on public.inspections(transaction_id, status);
create index if not exists inspections_property_idx
  on public.inspections(property_id, proposed_at);
create index if not exists inspections_status_idx
  on public.inspections(status, proposed_at);

-- ---------------------------------------------------------------------------
-- 5. negotiation_records — proposed prices/terms
--    Per spec Section 16: structured negotiation record with proposed
--    price, currency, frequency, terms, response, status.
--    Negotiation records are PROPOSALS — they do NOT constitute payment.
--    The platform does NOT collect the proposed amount.
-- ---------------------------------------------------------------------------
create table if not exists public.negotiation_records (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  -- The party making this proposal
  proposed_by uuid not null references public.profiles(id) on delete restrict,

  -- The proposed amount in minor units (kobo). NEVER collected by the platform.
  -- This is a negotiation anchor — the actual money moves externally
  -- between buyer and owner per spec Section 2.
  proposed_amount bigint not null check (proposed_amount >= 0),
  currency text not null default 'NGN' check (currency in ('NGN', 'USD')),
  -- Price frequency (one_off for sale, per_month/year for rent, per_night for short-let)
  price_frequency text check (price_frequency in (
    'one_off', 'per_day', 'per_week', 'per_month', 'per_year'
  )),

  terms text,
  -- Status: pending / accepted / declined / superseded
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'superseded')),

  -- Response metadata
  responded_by uuid references public.profiles(id) on delete set null,
  responded_at timestamptz,
  response_notes text,

  created_at timestamptz not null default now()
);

create index if not exists negotiation_records_transaction_idx
  on public.negotiation_records(transaction_id, created_at desc);
create index if not exists negotiation_records_proposed_by_idx
  on public.negotiation_records(proposed_by, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. offers — formal offer entity
--    Per spec Section 17: offer has status (draft/submitted/accepted/
--    declined/withdrawn/expired/superseded), validity/expiry.
--    Per spec Section 19: counter-offers create new offer rows; previous
--    offers are NOT overwritten — they become 'superseded'.
--    Per spec Section 20: only authorized party (owner / managing agent)
--    can accept. The customer CANNOT accept their own offer.
--    Per spec Section 39: concurrent acceptance attempts use a
--    conditional UPDATE — only one succeeds.
-- ---------------------------------------------------------------------------
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  -- The customer who submitted this offer (or counter-party if it's a
  -- counter-offer from the owner — but typically only customers submit
  -- formal offers per spec Section 17)
  submitted_by uuid not null references public.profiles(id) on delete restrict,

  -- Offer amount in minor units (kobo). NEVER collected by the platform.
  offered_amount bigint not null check (offered_amount >= 0),
  currency text not null default 'NGN' check (currency in ('NGN', 'USD')),
  price_frequency text check (price_frequency in (
    'one_off', 'per_day', 'per_week', 'per_month', 'per_year'
  )),

  terms text,
  -- Validity / expiry (server-side time evaluation per spec Section 38)
  expires_at timestamptz not null,

  -- Status
  status text not null default 'submitted'
    check (status in (
      'draft', 'submitted', 'accepted', 'declined',
      'withdrawn', 'expired', 'superseded'
    )),

  -- Counter-offer chain — when this offer supersedes a previous one
  supersedes_offer_id uuid,

  -- Decision metadata
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_reason text,

  -- Immutable flag — once accepted, the offer row cannot be edited
  -- (enforced at the application layer + via RLS UPDATE policy that
  -- refuses to mutate accepted offers)
  is_immutable boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger offers_set_updated_at
  before update on public.offers
  for each row execute function public.set_updated_at();

-- Only one active (submitted) offer per (transaction, submitter) at a time.
-- Concurrent counter-offers replace the previous one via superseded status.
create unique index if not exists offers_active_unique_idx
  on public.offers(transaction_id, submitted_by)
  where status = 'submitted';

-- Index for fast "find all offers for this transaction"
create index if not exists offers_transaction_idx
  on public.offers(transaction_id, created_at desc);
create index if not exists offers_submitted_by_idx
  on public.offers(submitted_by, created_at desc);
create index if not exists offers_status_idx
  on public.offers(status, expires_at);
create index if not exists offers_supersedes_idx
  on public.offers(supersedes_offer_id)
  where supersedes_offer_id is not null;

-- Foreign key for counter-offer chain (added after index creation to
-- avoid circular dependency)
alter table public.offers
  add constraint offers_supersedes_offer_fk
  foreign key (supersedes_offer_id) references public.offers(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 7. offer_history — immutable audit of every status change
--    Per spec Section 19: "Do not overwrite previous offers. Create an
--    immutable offer history."
-- ---------------------------------------------------------------------------
create table if not exists public.offer_history (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  previous_status text,
  new_status text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists offer_history_offer_idx
  on public.offer_history(offer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 8. RLS — enable + policies
-- ---------------------------------------------------------------------------

alter table public.transactions enable row level security;
alter table public.transaction_participants enable row level security;
alter table public.transaction_status_history enable row level security;
alter table public.inspections enable row level security;
alter table public.negotiation_records enable row level security;
alter table public.offers enable row level security;
alter table public.offer_history enable row level security;

-- transactions: participants-only.
create policy "Transaction participants can read their transactions"
  on public.transactions for select
  to authenticated
  using (
    id in (
      select transaction_id from public.transaction_participants
      where user_id in (select id from public.profiles where user_id = auth.uid())
        and is_active = true
    )
    or owner_id in (select id from public.profiles where user_id = auth.uid())
    or customer_id in (select id from public.profiles where user_id = auth.uid())
    or initiated_by in (select id from public.profiles where user_id = auth.uid())
    or managing_agent_id in (select id from public.profiles where user_id = auth.uid())
  );

-- Updates: only via service role (server actions in src/lib/transactions).
-- No client UPDATE policy = clients cannot mutate transaction state.

-- transaction_participants: participants can read the participant list
-- of transactions they're already in.
create policy "Participants can read co-participants"
  on public.transaction_participants for select
  to authenticated
  using (
    transaction_id in (
      select transaction_id from public.transaction_participants tp2
      where tp2.user_id in (select id from public.profiles where user_id = auth.uid())
        and tp2.is_active = true
    )
  );

-- Inserts: only via service role. Client cannot add participants.

-- transaction_status_history: read by participants, INSERT via service role.
create policy "Participants can read status history"
  on public.transaction_status_history for select
  to authenticated
  using (
    transaction_id in (
      select id from public.transactions t
      where t.owner_id in (select id from public.profiles where user_id = auth.uid())
        or t.customer_id in (select id from public.profiles where user_id = auth.uid())
        or t.initiated_by in (select id from public.profiles where user_id = auth.uid())
        or exists (
          select 1 from public.transaction_participants tp
          where tp.transaction_id = t.id
            and tp.user_id in (select id from public.profiles where user_id = auth.uid())
            and tp.is_active = true
        )
    )
  );

-- inspections: participants can read; updates via service role.
create policy "Inspection participants can read"
  on public.inspections for select
  to authenticated
  using (
    transaction_id in (
      select id from public.transactions t
      where t.owner_id in (select id from public.profiles where user_id = auth.uid())
        or t.customer_id in (select id from public.profiles where user_id = auth.uid())
        or t.initiated_by in (select id from public.profiles where user_id = auth.uid())
        or exists (
          select 1 from public.transaction_participants tp
          where tp.transaction_id = t.id
            and tp.user_id in (select id from public.profiles where user_id = auth.uid())
            and tp.is_active = true
        )
    )
  );

-- negotiation_records: participants can read.
create policy "Negotiation participants can read"
  on public.negotiation_records for select
  to authenticated
  using (
    transaction_id in (
      select id from public.transactions t
      where t.owner_id in (select id from public.profiles where user_id = auth.uid())
        or t.customer_id in (select id from public.profiles where user_id = auth.uid())
        or t.initiated_by in (select id from public.profiles where user_id = auth.uid())
        or exists (
          select 1 from public.transaction_participants tp
          where tp.transaction_id = t.id
            and tp.user_id in (select id from public.profiles where user_id = auth.uid())
            and tp.is_active = true
        )
    )
  );

-- offers: participants can read, but the platform respects privacy —
-- the AMOUNT of another user's offer is NOT visible to unrelated users.
-- Per spec Section 23: "Do not expose another user's private offer
-- amount to unrelated users."
--
-- Within a transaction, the customer's offer amount IS visible to the
-- property owner / managing agent (because they're the counter-party).
-- But other customers' offers are NOT visible to each other.
create policy "Offer submitters can read their own offers"
  on public.offers for select
  to authenticated
  using (
    submitted_by in (select id from public.profiles where user_id = auth.uid())
  );

create policy "Property owners/managing agents can read transaction offers"
  on public.offers for select
  to authenticated
  using (
    transaction_id in (
      select id from public.transactions t
      where
        t.owner_id in (select id from public.profiles where user_id = auth.uid())
        or t.managing_agent_id in (select id from public.profiles where user_id = auth.uid())
        or t.managing_company_id in (select id from public.profiles where user_id = auth.uid())
        or t.initiated_by in (select id from public.profiles where user_id = auth.uid())
    )
  );

-- offer_history: same as offers — submitters + counter-party can read.
create policy "Offer submitters can read their own offer history"
  on public.offer_history for select
  to authenticated
  using (
    offer_id in (
      select id from public.offers o
      where o.submitted_by in (select id from public.profiles where user_id = auth.uid())
    )
  );

create policy "Counter-party can read offer history"
  on public.offer_history for select
  to authenticated
  using (
    offer_id in (
      select o.id from public.offers o
      where o.transaction_id in (
        select id from public.transactions t
        where
          t.owner_id in (select id from public.profiles where user_id = auth.uid())
          or t.managing_agent_id in (select id from public.profiles where user_id = auth.uid())
          or t.managing_company_id in (select id from public.profiles where user_id = auth.uid())
      )
    )
  );

-- Inserts/Updates: only via service role (server actions).
-- No INSERT/UPDATE/DELETE client policies = no client-side manipulation.

-- ---------------------------------------------------------------------------
-- 9. SECURITY DEFINER functions for atomic state transitions
--    Per spec Section 39 (concurrency): use conditional UPDATE so
--    concurrent acceptance attempts only succeed once.
-- ---------------------------------------------------------------------------

-- Accept an offer atomically. Returns TRUE if this caller's acceptance
-- succeeded, FALSE if another acceptance won (race) or the caller
-- is not the transaction's authorized acceptor.
create or replace function public.accept_transaction_offer(
  p_transaction_id uuid,
  p_offer_id uuid,
  p_acceptor_profile_id uuid,
  p_reason text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction_owner uuid;
  v_transaction_managing_agent uuid;
  v_transaction_managing_company uuid;
  v_offer_status text;
  v_offer_expires_at timestamptz;
  v_previous_status text;
begin
  -- Lock the transaction row for the duration of this call.
  select owner_id, managing_agent_id, managing_company_id, current_status
    into v_transaction_owner, v_transaction_managing_agent, v_transaction_managing_company, v_previous_status
    from public.transactions
    where id = p_transaction_id
    for update;

  if v_transaction_owner is null and v_transaction_managing_agent is null and v_transaction_managing_company is null then
    return false;
  end if;

  -- Authorization: caller must be the owner OR managing agent OR managing company.
  if p_acceptor_profile_id is distinct from v_transaction_owner
     and p_acceptor_profile_id is distinct from v_transaction_managing_agent
     and p_acceptor_profile_id is distinct from v_transaction_managing_company then
    return false;
  end if;

  -- The offer must belong to this transaction, be 'submitted', and not expired.
  select status, expires_at into v_offer_status, v_offer_expires_at
    from public.offers
    where id = p_offer_id
      and transaction_id = p_transaction_id
    for update;

  if v_offer_status is null then
    return false;
  end if;

  if v_offer_status <> 'submitted' then
    return false;
  end if;

  if v_offer_expires_at < now() then
    -- Mark the offer expired (server-side time evaluation per spec Section 38).
    update public.offers set status = 'expired' where id = p_offer_id and status = 'submitted';
    insert into public.offer_history (offer_id, previous_status, new_status, actor_profile_id, reason)
      values (p_offer_id, v_offer_status, 'expired', p_acceptor_profile_id, 'expired before acceptance');
    return false;
  end if;

  -- Conditional update — only succeeds if the offer is still 'submitted'.
  -- This is the race-condition guard per spec Section 39.
  update public.offers
    set
      status = 'accepted',
      decided_by = p_acceptor_profile_id,
      decided_at = now(),
      decision_reason = p_reason,
      is_immutable = true
    where id = p_offer_id
      and status = 'submitted';

  if not found then
    return false;
  end if;

  insert into public.offer_history (offer_id, previous_status, new_status, actor_profile_id, actor_user_id, reason)
    values (p_offer_id, 'submitted', 'accepted', p_acceptor_profile_id, null, p_reason);

  -- Supersede any other 'submitted' offers on this transaction.
  update public.offers
    set
      status = 'superseded',
      decided_by = p_acceptor_profile_id,
      decided_at = now(),
      decision_reason = 'Another offer was accepted.'
    where transaction_id = p_transaction_id
      and id <> p_offer_id
      and status = 'submitted';

  -- Record superseded history entries.
  insert into public.offer_history (offer_id, previous_status, new_status, actor_profile_id, actor_user_id, reason)
    select id, 'submitted', 'superseded', p_acceptor_profile_id, null, 'Another offer was accepted.'
      from public.offers
      where transaction_id = p_transaction_id
        and id <> p_offer_id
        and status = 'superseded'
        and decided_at = (select max(decided_at) from public.offers where transaction_id = p_transaction_id);

  -- Update the transaction itself.
  update public.transactions
    set
      current_status = 'offer_accepted',
      accepted_offer_id = p_offer_id
    where id = p_transaction_id
      and current_status in ('offer_made', 'negotiation');

  -- Append status history.
  insert into public.transaction_status_history (transaction_id, previous_status, new_status, actor_profile_id, reason, metadata)
    values (p_transaction_id, v_previous_status, 'offer_accepted', p_acceptor_profile_id, p_reason, jsonb_build_object('offer_id', p_offer_id));

  return true;
end;
$$;

-- Complete a transaction atomically. Returns TRUE if this caller's
-- completion succeeded.
create or replace function public.complete_transaction(
  p_transaction_id uuid,
  p_completer_profile_id uuid,
  p_completion_notes text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_agent uuid;
  v_company uuid;
  v_customer uuid;
  v_status text;
  v_type text;
  v_property_id uuid;
  v_previous_status text;
begin
  select
    t.owner_id, t.managing_agent_id, t.managing_company_id, t.customer_id,
    t.current_status, t.transaction_type, t.property_id
    into v_owner, v_agent, v_company, v_customer, v_status, v_type, v_property_id
    from public.transactions t
    where t.id = p_transaction_id
    for update;

  if v_status is null then
    return false;
  end if;

  if v_status <> 'offer_accepted' then
    return false;
  end if;

  -- Authorization: caller must be owner OR managing agent OR managing
  -- company OR the customer (per spec Section 29 — customer can report
  -- completion where permitted).
  if p_completer_profile_id is distinct from v_owner
     and p_completer_profile_id is distinct from v_agent
     and p_completer_profile_id is distinct from v_company
     and p_completer_profile_id is distinct from v_customer then
    return false;
  end if;

  v_previous_status := v_status;

  -- Conditional update — only one completion can succeed.
  update public.transactions
    set
      current_status = 'transaction_completed',
      completed_at = now(),
      completed_by = p_completer_profile_id,
      completion_notes = p_completion_notes
    where id = p_transaction_id
      and current_status = 'offer_accepted';

  if not found then
    return false;
  end if;

  insert into public.transaction_status_history (transaction_id, previous_status, new_status, actor_profile_id, reason, metadata)
    values (p_transaction_id, v_previous_status, 'transaction_completed', p_completer_profile_id, p_completion_notes, jsonb_build_object('property_id', v_property_id, 'transaction_type', v_type));

  -- Property status integration (spec Section 22):
  --   sale → sold, rent → rented, short-let → NO permanent status change
  --   (short-let properties stay available for the next customer).
  if v_type = 'sale' then
    update public.properties set status = 'sold'
      where id = v_property_id and status in ('available', 'under_offer', 'application_pending');
  elsif v_type = 'rent' then
    update public.properties set status = 'rented'
      where id = v_property_id and status in ('available', 'under_offer', 'application_pending');
  end if;

  return true;
end;
$$;

-- Cancel a transaction with a reason.
create or replace function public.cancel_transaction(
  p_transaction_id uuid,
  p_canceller_profile_id uuid,
  p_reason text,
  p_new_status text default 'cancelled'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_agent uuid;
  v_company uuid;
  v_customer uuid;
  v_status text;
  v_previous_status text;
begin
  if p_reason is null or length(trim(p_reason)) < 3 then
    return false;
  end if;

  if p_new_status not in ('cancelled', 'withdrawn', 'declined') then
    return false;
  end if;

  select
    t.owner_id, t.managing_agent_id, t.managing_company_id, t.customer_id, t.current_status
    into v_owner, v_agent, v_company, v_customer, v_status
    from public.transactions t
    where t.id = p_transaction_id
    for update;

  if v_status is null then
    return false;
  end if;

  -- Terminal states cannot be cancelled.
  if v_status in ('transaction_completed', 'cancelled', 'withdrawn', 'expired', 'declined') then
    return false;
  end if;

  -- Authorization: any of the legitimate participants can cancel.
  if p_canceller_profile_id is distinct from v_owner
     and p_canceller_profile_id is distinct from v_agent
     and p_canceller_profile_id is distinct from v_company
     and p_canceller_profile_id is distinct from v_customer then
    return false;
  end if;

  v_previous_status := v_status;

  update public.transactions
    set
      current_status = p_new_status,
      cancellation_reason = p_reason,
      cancelled_at = now(),
      cancelled_by = p_canceller_profile_id
    where id = p_transaction_id
      and current_status not in ('transaction_completed', 'cancelled', 'withdrawn', 'expired', 'declined');

  if not found then
    return false;
  end if;

  insert into public.transaction_status_history (transaction_id, previous_status, new_status, actor_profile_id, reason)
    values (p_transaction_id, v_previous_status, p_new_status, p_canceller_profile_id, p_reason);

  -- Expire any pending offers on this transaction.
  update public.offers set status = 'expired'
    where transaction_id = p_transaction_id and status = 'submitted';

  return true;
end;
$$;

-- Transition a transaction to the next stage (non-terminal forward move).
-- Used for: inquiry → inspection_scheduled, inspection_scheduled →
-- inspection_completed, inspection_completed → negotiation, negotiation →
-- offer_made.
create or replace function public.transition_transaction(
  p_transaction_id uuid,
  p_new_status text,
  p_actor_profile_id uuid,
  p_reason text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_owner uuid;
  v_agent uuid;
  v_company uuid;
  v_customer uuid;
begin
  -- Valid forward transitions (state machine per spec Section 8).
  if p_new_status not in (
    'inspection_scheduled', 'inspection_completed', 'negotiation', 'offer_made', 'offer_accepted'
  ) then
    return false;
  end if;

  select current_status, owner_id, managing_agent_id, managing_company_id, customer_id
    into v_current, v_owner, v_agent, v_company, v_customer
    from public.transactions
    where id = p_transaction_id
    for update;

  if v_current is null then
    return false;
  end if;

  -- Validate transition is allowed.
  if not (
    (v_current = 'inquiry' and p_new_status = 'inspection_scheduled')
    or (v_current = 'inspection_scheduled' and p_new_status = 'inspection_completed')
    or (v_current = 'inspection_completed' and p_new_status = 'negotiation')
    or (v_current = 'negotiation' and p_new_status = 'offer_made')
    or (v_current = 'offer_made' and p_new_status = 'offer_accepted')
  ) then
    return false;
  end if;

  -- Authorization: any of the legitimate participants can transition.
  if p_actor_profile_id is distinct from v_owner
     and p_actor_profile_id is distinct from v_agent
     and p_actor_profile_id is distinct from v_company
     and p_actor_profile_id is distinct from v_customer then
    return false;
  end if;

  update public.transactions
    set current_status = p_new_status
    where id = p_transaction_id
      and current_status = v_current;

  if not found then
    return false;
  end if;

  insert into public.transaction_status_history (transaction_id, previous_status, new_status, actor_profile_id, reason)
    values (p_transaction_id, v_current, p_new_status, p_actor_profile_id, p_reason);

  return true;
end;
$$;

-- End of migration 0025_property_transactions.sql.

-- ---------------------------------------------------------------------------
-- POST-MIGRATION: Add transaction_id column to reviews
--   This allows the review system (Prompt 11) to qualify reviews by
--   completed transaction (Prompt 18, spec Section 35). The column is
--   nullable — reviews can still be tied to applications, conversations,
--   or properties (existing qualifying interactions).
-- ---------------------------------------------------------------------------
alter table public.reviews
  add column if not exists transaction_id uuid references public.transactions(id) on delete cascade;

create index if not exists reviews_transaction_id_idx
  on public.reviews(transaction_id)
  where transaction_id is not null;
