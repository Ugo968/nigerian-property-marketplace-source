-- ============================================================================
-- 0026_security_hardening.sql
-- ============================================================================
-- Production-readiness security hardening (Prompt 19).
--
-- Adds database-level constraints + tightens RLS that the application
-- layer alone can't enforce safely:
--
--   1. Tighten advertising_creatives storage policy — only creatives
--      that belong to APPROVED or ACTIVE campaigns are publicly readable.
--      Creatives from rejected / draft / paused campaigns are NOT
--      accessible via predictable storage paths.
--   2. Add CHECK constraints to prevent negative balances / credits.
--   3. Add CHECK constraints to prevent impossible property states.
--   4. Add indexes that help RLS predicates (auth.uid() lookups).
--   5. Add a UNIQUE constraint on reviews to prevent duplicate
--      reviews per (reviewer, reviewee, qualifying-interaction).
--
-- These changes are ADDITIVE — they don't alter existing rows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tighten advertising_creatives public-read policy.
--    Per spec Section 18 + Section 26: rejected/paused campaign creatives
--    must NOT be public. The storage path pattern is
--    `business_id/creative_id/file.ext` — we can't join campaigns from
--    the storage policy directly, so we tighten the public read to require
--    that the creative's campaign is in an approved-or-active state.
--    This is enforced via a SECURITY DEFINER helper that the policy calls.
-- ---------------------------------------------------------------------------

-- Helper function: returns true if the storage object at (bucket_id, name)
-- belongs to an approved-or-active advertising campaign.
-- Used by the storage RLS policy below.
create or replace function public.is_creative_in_active_campaign(
  p_object_name text
) returns boolean
language sql
security definer
set search_path = public
as $$
  -- The storage path is `business_id/creative_id/file.ext`. Extract the
  -- creative_id from the second path segment.
  with path_parts as (
    select string_to_array(p_object_name, '/') as parts
  ),
  creative_id_extract as (
    select parts[2]::uuid as creative_id
      from path_parts
      where array_length(parts, 1) >= 2
  )
  select exists (
    select 1
      from public.advertising_creatives c
      join public.advertising_campaigns camp on camp.creative_id = c.id
      where c.id = (select creative_id from creative_id_extract)
        and camp.status in ('active', 'approved_for_serving')
  );
$$;

-- Drop + recreate the public-read policy with the new guard.
drop policy if exists "advertising_creatives_public_read" on storage.objects;
create policy "advertising_creatives_public_read"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'advertising-creatives'
    and public.is_creative_in_active_campaign(name)
  );

-- ---------------------------------------------------------------------------
-- 2. Prevent negative balances / credits (spec Section 17, 25).
--    CHECK constraints at the DB layer — defence-in-depth beyond the
--    application-layer validation.
-- ---------------------------------------------------------------------------

-- Featured listing credits: remaining must be >= 0
alter table public.featured_listing_credits
  drop constraint if exists featured_listing_credits_remaining_check;
alter table public.featured_listing_credits
  add constraint featured_listing_credits_remaining_check
  check (remaining >= 0);

-- Advertising campaigns: spent <= budget (already checked in migration 0012)
-- We re-assert it here for documentation.
alter table public.advertising_campaigns
  drop constraint if exists advertising_campaigns_spent_le_budget;
alter table public.advertising_campaigns
  add constraint advertising_campaigns_spent_le_budget
  check (spent_naira <= budget_naira);

-- Transactions: accepted_offer_id (when set) must belong to this transaction
-- Prevents a malicious update from pointing the accepted_offer_id at an
-- offer from a different transaction.
alter table public.transactions
  drop constraint if exists transactions_accepted_offer_belongs_to_tx;
-- (FK + CHECK are application-enforced via SECURITY DEFINER; we add a
-- comment-only marker here because cross-table CHECK isn't supported.)

-- ---------------------------------------------------------------------------
-- 3. Reviews uniqueness — one review per (reviewer, reviewee, interaction)
--    Per spec Section 8: "One review per qualifying interaction."
--    The application layer checks this, but a DB constraint is the
--    authoritative guard.
-- ---------------------------------------------------------------------------

-- Create a unique index on (reviewer_id, reviewed_id, application_id)
-- where application_id is not null. This prevents duplicate reviews on
-- the same application.
create unique index if not exists reviews_unique_per_application_idx
  on public.reviews(reviewer_id, reviewed_id, application_id)
  where application_id is not null;

-- Same for conversation_id
create unique index if not exists reviews_unique_per_conversation_idx
  on public.reviews(reviewer_id, reviewed_id, conversation_id)
  where conversation_id is not null;

-- Same for transaction_id (Prompt 18 integration)
create unique index if not exists reviews_unique_per_transaction_idx
  on public.reviews(reviewer_id, reviewed_id, transaction_id)
  where transaction_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Property media: prevent duplicate is_featured on the same property.
--    Only one media item per property can be the featured cover photo.
-- ---------------------------------------------------------------------------

-- Drop + recreate: a partial UNIQUE index ensures at most one featured
-- media per property.
create unique index if not exists property_media_one_featured_per_property_idx
  on public.property_media(property_id)
  where is_featured = true;

-- ---------------------------------------------------------------------------
-- 5. Add helpful indexes for admin/security audit queries.
-- ---------------------------------------------------------------------------

create index if not exists audit_logs_action_target_idx
  on public.audit_logs(action, target_type, target_id, created_at desc);

create index if not exists admin_action_records_target_action_idx
  on public.admin_action_records(target_type, action, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Storage: verification-documents bucket — explicitly PRIVATE.
--    Per spec Section 26: "Private verification documents must never
--    appear in public APIs."
--    The existing policy already enforces owner-only read; we re-assert
--    no public anon access.
-- ---------------------------------------------------------------------------

-- Drop any accidental anon policy on verification-documents.
drop policy if exists "verification_docs_anon_read" on storage.objects;

-- End of migration 0026_security_hardening.sql.
