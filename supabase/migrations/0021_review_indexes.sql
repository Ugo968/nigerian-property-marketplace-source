-- ============================================================================
-- 0021_review_indexes.sql
-- ============================================================================
-- Adds performance indexes + a partial unique constraint for
-- conversation-based reviews (the existing unique in 0013 only covers
-- application_id; conversation-based reviews need their own uniqueness).
--
-- Per spec Section 8: "Prevent duplicate reviews" at the database level.
-- Per spec Section 35: "Use appropriate indexes" + "Avoid N+1 queries".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Indexes for aggregation queries (spec Section 35)
-- ---------------------------------------------------------------------------

-- Fast lookup: all published reviews for a given reviewed user
create index if not exists reviews_reviewed_published_idx
  on public.reviews(reviewed_id, status, created_at desc)
  where status = 'published';

-- Fast lookup: all reviews by a given reviewer
create index if not exists reviews_reviewer_idx
  on public.reviews(reviewer_id, created_at desc);

-- Fast lookup: reviews for a specific property
create index if not exists reviews_property_idx
  on public.reviews(property_id, status)
  where property_id is not null and status = 'published';

-- Fast lookup: reviews by status (for admin moderation queue)
create index if not exists reviews_status_idx
  on public.reviews(status, created_at desc)
  where status in ('pending', 'hidden', 'flagged');

-- ---------------------------------------------------------------------------
-- Partial unique constraint for conversation-based reviews
-- (the existing unique covers application_id; conversations need their own)
-- ---------------------------------------------------------------------------

-- Prevent duplicate (reviewer, reviewed, conversation) for conversation reviews
create unique index if not exists reviews_conversation_unique
  on public.reviews(reviewer_id, reviewed_id, conversation_id)
  where conversation_id is not null;

-- Prevent duplicate (reviewer, reviewed, property_id) for property reviews
create unique index if not exists reviews_property_unique
  on public.reviews(reviewer_id, reviewed_id, property_id)
  where property_id is not null and application_id is null;
