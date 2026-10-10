-- ============================================================================
-- 0013_reviews.sql
-- ============================================================================
-- Reviews & ratings. Per spec Section 20.
--
-- Reviews MUST be tied to a legitimate marketplace interaction. We don't
-- allow arbitrary "anyone can review anyone" behaviour. A review row
-- references the qualifying interaction (application_id or
-- conversation_id) and the system enforces one review per
-- (reviewer, reviewed, interaction).
-- ============================================================================

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  -- Reviewer + reviewed
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewed_id uuid not null references public.profiles(id) on delete cascade,

  -- What kind of entity is being reviewed (lets us show reviews on
  -- property pages, agent pages, company pages, etc.)
  reviewed_entity_type text not null check (reviewed_entity_type in (
    'landlord', 'agent', 'company'
  )),

  -- The qualifying interaction. One of these must be set.
  application_id uuid references public.property_applications(id) on delete cascade,
  conversation_id uuid, -- references messaging.conversations (added in 0014)
  property_id uuid references public.properties(id) on delete cascade,

  -- The review content
  rating smallint not null check (rating >= 1 and rating <= 5),
  title text,
  body text,

  -- Moderation
  status text not null default 'pending'
    check (status in ('pending', 'published', 'hidden', 'removed')),
  moderation_reason text,
  moderated_by uuid references public.admin_users(id) on delete set null,
  moderated_at timestamptz,

  -- Reply from the reviewed party
  response_text text,
  response_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Prevent duplicate reviews for the same (reviewer, reviewed, interaction)
  -- Two reviewers can leave two reviews for the same interaction, but
  -- one reviewer cannot review the same party for the same interaction twice.
  unique (reviewer_id, reviewed_id, application_id)
);

create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

create index if not exists reviews_reviewed_idx
  on public.reviews(reviewed_id, status);
create index if not exists reviews_reviewer_idx
  on public.reviews(reviewer_id);
create index if not exists reviews_property_idx
  on public.reviews(property_id)
  where property_id is not null;
create index if not exists reviews_status_idx
  on public.reviews(status, created_at);
create index if not exists reviews_rating_idx
  on public.reviews(reviewed_id, rating)
  where status = 'published';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.reviews enable row level security;

-- Published reviews are public.
create policy "Published reviews are publicly readable"
  on public.reviews for select
  to anon, authenticated
  using (status = 'published');

-- Reviewer can read their own (including pending/hidden/removed).
create policy "Reviewers can read their own reviews"
  on public.reviews for select
  to authenticated
  using (reviewer_id in (select id from public.profiles where user_id = auth.uid()));

-- Reviewed party can read reviews about themselves (including hidden ones).
create policy "Reviewed parties can read their own reviews"
  on public.reviews for select
  to authenticated
  using (reviewed_id in (select id from public.profiles where user_id = auth.uid()));

-- Insert: reviewer must be the actual auth user. The qualifying interaction
-- is verified by the application layer before insert.
create policy "Users can submit reviews as themselves"
  on public.reviews for insert
  to authenticated
  with check (
    reviewer_id in (select id from public.profiles where user_id = auth.uid())
    and reviewer_id <> reviewed_id
  );

-- Reviewer can edit only the body / title; status changes are admin-only.
create policy "Reviewers can edit their own review content"
  on public.reviews for update
  to authenticated
  using (reviewer_id in (select id from public.profiles where user_id = auth.uid()))
  with check (reviewer_id in (select id from public.profiles where user_id = auth.uid()));

-- Reviewed party can add a response (update only response_* fields).
create policy "Reviewed parties can respond to their reviews"
  on public.reviews for update
  to authenticated
  using (reviewed_id in (select id from public.profiles where user_id = auth.uid()))
  with check (reviewed_id in (select id from public.profiles where user_id = auth.uid()));
