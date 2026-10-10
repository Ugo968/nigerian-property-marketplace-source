-- ============================================================================
-- 0003_role_specific_profiles.sql
-- ============================================================================
-- Role-specific data lives in separate tables so the main `profiles` table
-- stays clean and role-agnostic. Each role-specific row has a 1:1 link to
-- `profiles(id)`. The role on `profiles` determines which child table
-- is the "active" role profile.
--
-- Per spec Section 4:
--   * landlord_profiles  — ownership info, preferred contact, location
--   * agent_profiles     — professional name, agency, experience, license
--   * company_profiles   — CAC, description, office, website, socials
--
-- All three carry a `profile_completeness` percentage (0–100) that the
-- application updates when fields are filled in. This drives the
-- onboarding checklist and search-ranking "listing completeness" signal.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- landlord_profiles
-- ---------------------------------------------------------------------------
create table if not exists public.landlord_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  preferred_contact_method text check (preferred_contact_method in ('phone', 'email', 'whatsapp')),
  preferred_contact_value text,
  ownership_summary text,
  profile_completeness smallint not null default 0
    check (profile_completeness between 0 and 100),
  verification_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger landlord_profiles_set_updated_at
  before update on public.landlord_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- agent_profiles
-- ---------------------------------------------------------------------------
create table if not exists public.agent_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  professional_name text,
  agency_name text,
  agency_id uuid references public.profiles(id) on delete set null,
  years_of_experience smallint check (years_of_experience >= 0),
  license_number text,
  license_issuing_body text,
  professional_description text,
  portfolio_url text,
  profile_completeness smallint not null default 0
    check (profile_completeness between 0 and 100),
  verification_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger agent_profiles_set_updated_at
  before update on public.agent_profiles
  for each row execute function public.set_updated_at();

create index if not exists agent_profiles_agency_id_idx
  on public.agent_profiles(agency_id)
  where agency_id is not null;

-- ---------------------------------------------------------------------------
-- company_profiles
-- ---------------------------------------------------------------------------
create table if not exists public.company_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  company_name text not null,
  company_logo_url text,
  company_description text,
  cac_registration_number text,
  cac_registered boolean not null default false,
  office_address text,
  office_state text,
  office_lga text,
  website text,
  social_handles jsonb not null default '{}'::jsonb,
  profile_completeness smallint not null default 0
    check (profile_completeness between 0 and 100),
  verification_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger company_profiles_set_updated_at
  before update on public.company_profiles
  for each row execute function public.set_updated_at();

-- Helpful index for company name search (admin / public directory)
create index if not exists company_profiles_name_idx
  on public.company_profiles using gin (to_tsvector('simple', company_name));

-- ---------------------------------------------------------------------------
-- RLS for role-specific profiles
-- ---------------------------------------------------------------------------
alter table public.landlord_profiles enable row level security;
alter table public.agent_profiles enable row level security;
alter table public.company_profiles enable row level security;

-- Public can read non-sensitive fields; PII is filtered at the query layer.
create policy "Role profiles are publicly readable"
  on public.landlord_profiles for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = landlord_profiles.profile_id
        and p.suspended_at is null
        and p.deleted_at is null
    )
  );

create policy "Role profiles are publicly readable (agent)"
  on public.agent_profiles for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = agent_profiles.profile_id
        and p.suspended_at is null
        and p.deleted_at is null
    )
  );

create policy "Role profiles are publicly readable (company)"
  on public.company_profiles for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = company_profiles.profile_id
        and p.suspended_at is null
        and p.deleted_at is null
    )
  );

-- Only the profile owner (or admin via service role) may insert/update.
create policy "Owners manage their landlord profile"
  on public.landlord_profiles for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = landlord_profiles.profile_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = landlord_profiles.profile_id
        and p.user_id = auth.uid()
    )
  );

create policy "Owners manage their agent profile"
  on public.agent_profiles for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = agent_profiles.profile_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = agent_profiles.profile_id
        and p.user_id = auth.uid()
    )
  );

create policy "Owners manage their company profile"
  on public.company_profiles for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = company_profiles.profile_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = company_profiles.profile_id
        and p.user_id = auth.uid()
    )
  );
