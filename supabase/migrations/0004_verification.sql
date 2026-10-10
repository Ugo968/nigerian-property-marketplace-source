-- ============================================================================
-- 0004_verification.sql
-- ============================================================================
-- Verification system. Per spec Section 5:
--
--   * Verification is NOT auto-granted on payment. Subscription determines
--     *eligibility*; admin review determines *approval*.
--   * Two badge tiers: bronze (basic) and blue (advanced)
--   * Verification states on profiles: unverified / pending / bronze / blue /
--     rejected / suspended / revoked
--
-- Documents are NEVER stored as BLOBs in the database. Files live in the
-- Supabase Storage bucket `verification-documents` (private; RLS-gated).
-- The DB stores metadata + a signed-URL-safe storage path reference.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- verification_applications
-- One application per (user, tier) attempt. A user can re-apply after
-- rejection or revocation — each attempt is a new row.
-- ---------------------------------------------------------------------------
create table if not exists public.verification_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  tier text not null check (tier in ('bronze', 'blue')),
  status text not null default 'submitted'
    check (status in (
      'draft', 'submitted', 'in_review',
      'approved', 'rejected', 'withdrawn', 'expired'
    )),
  applicant_summary text,
  applicant_metadata jsonb not null default '{}'::jsonb,
  reviewer_id uuid references public.admin_users(id) on delete set null,
  reviewer_notes text,
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger verification_applications_set_updated_at
  before update on public.verification_applications
  for each row execute function public.set_updated_at();

create index if not exists verification_applications_applicant_idx
  on public.verification_applications(applicant_id);
create index if not exists verification_applications_status_idx
  on public.verification_applications(status);
create index if not exists verification_applications_tier_idx
  on public.verification_applications(tier);
create index if not exists verification_applications_reviewer_idx
  on public.verification_applications(reviewer_id)
  where reviewer_id is not null;
create index if not exists verification_applications_submitted_at_idx
  on public.verification_applications(submitted_at desc)
  where submitted_at is not null;

-- ---------------------------------------------------------------------------
-- verification_documents
-- Metadata for files uploaded to the private `verification-documents`
-- bucket. The `storage_path` is the key inside that bucket; the
-- application server mints signed URLs on demand for authorised viewers.
-- ---------------------------------------------------------------------------
create table if not exists public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.verification_applications(id)
    on delete cascade,
  document_type text not null check (document_type in (
    'government_id', 'utility_bill', 'proof_of_address',
    'cac_certificate', 'business_license', 'professional_certification',
    'agent_license', 'office_lease', 'other'
  )),
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_at timestamptz not null default now(),
  unique (storage_path)
);

create index if not exists verification_documents_application_idx
  on public.verification_documents(application_id);

-- ---------------------------------------------------------------------------
-- verification_reviews
-- Each row is one review action by an admin — supports multi-stage
-- review trails (initial review, escalation, final decision).
-- ---------------------------------------------------------------------------
create table if not exists public.verification_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.verification_applications(id)
    on delete cascade,
  reviewer_id uuid not null references public.admin_users(id)
    on delete set null,
  decision text not null check (decision in (
    'in_review', 'approved', 'rejected', 'revoked', 'revised'
  )),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists verification_reviews_application_idx
  on public.verification_reviews(application_id);
create index if not exists verification_reviews_reviewer_idx
  on public.verification_reviews(reviewer_id);

-- ---------------------------------------------------------------------------
-- verification_history
-- Append-only audit trail of every verification_state change on a
-- profile. Drives the "verification timeline" UI + compliance reporting.
-- ---------------------------------------------------------------------------
create table if not exists public.verification_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  previous_state text,
  new_state text not null check (new_state in (
    'unverified', 'pending', 'bronze', 'blue',
    'rejected', 'suspended', 'revoked'
  )),
  application_id uuid references public.verification_applications(id)
    on delete set null,
  actor_id uuid references public.admin_users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists verification_history_profile_idx
  on public.verification_history(profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.verification_applications enable row level security;
alter table public.verification_documents enable row level security;
alter table public.verification_reviews enable row level security;
alter table public.verification_history enable row level security;

-- Applicants can read their own applications + documents + history.
-- Reviews (admin-internal) are NOT visible to applicants.
create policy "Applicants can read their own applications"
  on public.verification_applications for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = verification_applications.applicant_id
        and p.user_id = auth.uid()
    )
  );

create policy "Applicants manage their own applications"
  on public.verification_applications for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = verification_applications.applicant_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = verification_applications.applicant_id
        and p.user_id = auth.uid()
    )
  );

-- Applicants can read their own documents. Admins (service role) can read all.
create policy "Applicants can read their own verification documents"
  on public.verification_documents for select
  to authenticated
  using (
    exists (
      select 1 from public.verification_applications va
      join public.profiles p on p.id = va.applicant_id
      where va.id = verification_documents.application_id
        and p.user_id = auth.uid()
    )
  );

create policy "Applicants can upload their own verification documents"
  on public.verification_documents for insert
  to authenticated
  with check (
    exists (
      select 1 from public.verification_applications va
      join public.profiles p on p.id = va.applicant_id
      where va.id = verification_documents.application_id
        and p.user_id = auth.uid()
    )
  );

create policy "Applicants can delete their own verification documents"
  on public.verification_documents for delete
  to authenticated
  using (
    exists (
      select 1 from public.verification_applications va
      join public.profiles p on p.id = va.applicant_id
      where va.id = verification_documents.application_id
        and p.user_id = auth.uid()
    )
  );

-- Verification history: applicant can read their own; admins via service role.
create policy "Users can read their own verification history"
  on public.verification_history for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = verification_history.profile_id
        and p.user_id = auth.uid()
    )
  );

-- Verification reviews: admin-only (no user RLS policy = no user access).
-- Service role bypasses RLS so admins can read/write.
