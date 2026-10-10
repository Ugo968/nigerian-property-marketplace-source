-- ============================================================================
-- 0009_subscriptions.sql
-- ============================================================================
-- Subscription plans (master) + user subscriptions.
-- Per spec Section 16. Pricing is also mirrored in TypeScript in
-- src/lib/subscriptions/plans.ts (single source of truth at the app layer).
--
-- IMPORTANT: a plan row in this table is for database reference + reporting.
-- The capability system in src/lib/capabilities/ derives feature gating from
-- (role, tier) at runtime — not from a DB row. This avoids "if plan === X".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- subscription_plans — master plan matrix
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('landlord', 'agent', 'company')),
  tier text not null check (tier in ('free', 'pro', 'premium')),
  price_naira bigint not null default 0 check (price_naira >= 0),
  -- Company Premium is "₦35,000+" — variable pricing on top of the base
  is_variable_price boolean not null default false,
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'quarterly', 'annually')),
  is_default boolean not null default false, -- the role's free plan
  is_sellable boolean not null default true,
  tagline text,
  highlights jsonb not null default '[]'::jsonb, -- string[]
  capabilities jsonb not null default '{}'::jsonb, -- serialised Capabilities
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role, tier, billing_cycle)
);

create trigger subscription_plans_set_updated_at
  before update on public.subscription_plans
  for each row execute function public.set_updated_at();

create index if not exists subscription_plans_role_tier_idx
  on public.subscription_plans(role, tier);

-- ---------------------------------------------------------------------------
-- user_subscriptions — the active subscription for a user
-- ---------------------------------------------------------------------------
create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  -- Denormalised for fast authz without joining
  role text not null,
  tier text not null check (tier in ('free', 'pro', 'premium')),

  status text not null default 'active'
    check (status in ('active', 'trialing', 'past_due', 'cancelled', 'expired', 'incomplete')),

  -- Provider references
  provider text check (provider in ('paystack', 'flutterwave')),
  provider_customer_ref text, -- e.g. Paystack customer code
  provider_subscription_ref text, -- e.g. Paystack subscription code

  billing_cycle text not null default 'monthly',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  cancellation_reason text,

  trial_start timestamptz,
  trial_end timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_subscriptions_set_updated_at
  before update on public.user_subscriptions
  for each row execute function public.set_updated_at();

create index if not exists user_subscriptions_user_idx
  on public.user_subscriptions(user_id, status);
create index if not exists user_subscriptions_provider_ref_idx
  on public.user_subscriptions(provider_subscription_ref)
  where provider_subscription_ref is not null;
create index if not exists user_subscriptions_status_idx
  on public.user_subscriptions(status, current_period_end);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;

-- Plans: public read (so pricing page can render). Admin writes via service role.
create policy "Subscription plans are publicly readable"
  on public.subscription_plans for select
  to anon, authenticated
  using (is_sellable = true);

-- User subscriptions: only the owner can read.
create policy "Users can read their own subscriptions"
  on public.user_subscriptions for select
  to authenticated
  using (user_id in (select id from public.profiles where user_id = auth.uid()));

-- Inserts / updates only via service role (webhook handlers in P10).
-- No client-side RLS = no client-side tampering with subscription state.
