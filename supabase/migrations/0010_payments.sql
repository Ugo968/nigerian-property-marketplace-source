-- ============================================================================
-- 0010_payments.sql
-- ============================================================================
-- Platform payments ledger. Per spec Section 17.
--
-- IMPORTANT (spec Section 38):
--   This table is for money paid TO THE PLATFORM (subscriptions, featured
--   listings, advertising, etc.). It is NOT for property purchase / rent
--   money. V1 does not escrow or transfer property money at all.
--
-- Payment state only transitions on a server-side verified provider webhook.
-- Never trust a client-side "payment successful" message.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- payments — one row per payment attempt. Append-only for successful
-- records; rows can transition pending → (successful | failed | cancelled |
-- refunded | expired) but never get deleted.
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles(id) on delete restrict,
  amount bigint not null check (amount >= 0), -- minor units (kobo)
  currency text not null default 'NGN' check (currency in ('NGN', 'USD')),

  provider text not null check (provider in ('paystack', 'flutterwave')),
  provider_reference text, -- unique once known
  provider_payment_ref text, -- provider's own payment id (separate from our reference)

  payment_type text not null check (payment_type in (
    'subscription', 'featured_listing', 'advertising',
    'verification_fee', 'topup'
  )),
  -- Optional reference to the resource this payment is for
  -- (subscription id, featured listing id, campaign id, etc.)
  related_resource_id uuid,

  status text not null default 'pending'
    check (status in ('pending', 'successful', 'failed', 'cancelled', 'refunded', 'expired')),

  metadata jsonb not null default '{}'::jsonb,

  initiated_at timestamptz not null default now(),
  verified_at timestamptz,
  verification_metadata jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Prevent duplicate successful payments with the same provider reference.
  -- Multiple pending attempts with different references are fine.
  unique (provider, provider_reference)
);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create index if not exists payments_user_idx
  on public.payments(user_id, created_at desc);
create index if not exists payments_status_idx
  on public.payments(status, created_at);
create index if not exists payments_type_idx
  on public.payments(payment_type, status);
create index if not exists payments_provider_ref_idx
  on public.payments(provider, provider_reference)
  where provider_reference is not null;
create index if not exists payments_related_resource_idx
  on public.payments(related_resource_id)
  where related_resource_id is not null;

-- ---------------------------------------------------------------------------
-- payment_events — append-only audit of every provider webhook event.
-- Even when a payment's row doesn't change state, the event is recorded.
-- ---------------------------------------------------------------------------
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  provider text not null check (provider in ('paystack', 'flutterwave')),
  provider_event text not null, -- e.g. "charge.success", "transfer.failed"
  provider_event_id text, -- idempotency key from provider
  raw_payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  -- Prevent duplicate processing of the same webhook event
  unique (provider, provider_event_id)
);

create index if not exists payment_events_payment_idx
  on public.payment_events(payment_id, received_at);
create index if not exists payment_events_unprocessed_idx
  on public.payment_events(received_at)
  where processed_at is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

-- Users can read their own payments (for billing history UI).
create policy "Users can read their own payments"
  on public.payments for select
  to authenticated
  using (user_id in (select id from public.profiles where user_id = auth.uid()));

-- Users can insert a new pending payment row (initiation). They CANNOT
-- update the status — that's webhook-only.
create policy "Users can create pending payment rows"
  on public.payments for insert
  to authenticated
  with check (
    user_id in (select id from public.profiles where user_id = auth.uid())
    and status = 'pending'
  );

-- No update / delete policy for users. Only the service role (webhook
-- verifier) can update payment status.

-- Payment events are webhook-only — no client-side access at all.
