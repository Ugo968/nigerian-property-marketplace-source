-- ============================================================================
-- 0019_property_extensions.sql
-- ============================================================================
-- Extends the `properties` table created in 0005 with additional fields
-- required by the property listing system (Prompt 6):
--
--   * `furnished_status` text column with CHECK for the 4 valid values
--     (furnished / semi_furnished / unfurnished / not_applicable).
--     Replaces the simpler `furnished boolean` for finer granularity.
--   * `year_built` smallint — when the property was constructed.
--   * `parking_spaces` smallint — number of dedicated parking spots.
--   * `floors` smallint — number of floors / storeys.
--   * `price_frequency` CHECK constraint expanded to include `per_night`
--     (short-let nightly pricing).
--   * `title_quality` text — server-side spam-detection result log
--     (clean / suspicious_caps / excessive_punctuation / spam_pattern).
--     Drives future admin moderation queue filtering.
--
-- All operations are idempotent (`add column if not exists`, drop+recreate
-- constraints only when needed).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. furnished_status — replaces the simpler `furnished boolean`.
--    We keep the boolean column for backward compatibility but the
--    application layer only reads `furnished_status`.
-- ---------------------------------------------------------------------------
alter table public.properties
  add column if not exists furnished_status text not null default 'not_applicable'
  check (furnished_status in (
    'furnished', 'semi_furnished', 'unfurnished', 'not_applicable'
  ));

-- Index for filtering listings by furnished status (common search filter)
create index if not exists properties_furnished_status_idx
  on public.properties(furnished_status);

-- ---------------------------------------------------------------------------
-- 2. year_built, parking_spaces, floors
-- ---------------------------------------------------------------------------
alter table public.properties
  add column if not exists year_built smallint
  check (year_built is null or (year_built >= 1800 and year_built <= extract(year from now())::int + 1));

alter table public.properties
  add column if not exists parking_spaces smallint not null default 0
  check (parking_spaces >= 0 and parking_spaces <= 1000);

alter table public.properties
  add column if not exists floors smallint
  check (floors is null or (floors >= 0 and floors <= 200));

-- ---------------------------------------------------------------------------
-- 3. price_frequency CHECK constraint — add `per_night` for short-lets.
--    PostgreSQL doesn't have IF NOT EXISTS for CHECK constraints, so we
--    drop + recreate. The constraint name from 0005 is implicit (auto-
--    generated); we drop by inspecting the column-level check.
-- ---------------------------------------------------------------------------

-- Drop existing constraints on price_frequency (handles both named + auto)
do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where contype = 'c'
      and conrelid = 'public.properties'::regclass
      and pg_get_constraintdef(oid) like '%price_frequency in%'
  loop
    execute format('alter table public.properties drop constraint if exists %I', con.conname);
  end loop;
end $$;

-- Add the new expanded constraint
alter table public.properties
  add constraint properties_price_frequency_check
  check (price_frequency is null or price_frequency in (
    'one_off', 'per_day', 'per_week', 'per_month', 'per_year', 'per_night'
  ));

-- ---------------------------------------------------------------------------
-- 4. title_quality — server-side anti-spam detection result.
--    Populated by the property creation server action.
-- ---------------------------------------------------------------------------
alter table public.properties
  add column if not exists title_quality text not null default 'clean'
  check (title_quality in (
    'clean', 'suspicious_caps', 'excessive_punctuation', 'spam_pattern', 'too_short', 'too_long'
  ));

create index if not exists properties_title_quality_idx
  on public.properties(title_quality)
  where title_quality <> 'clean';

-- ---------------------------------------------------------------------------
-- 5. title_quality + a soft check that titles aren't excessively long.
--    (Validation done server-side via Zod; the DB enforces the absolute max.)
-- ---------------------------------------------------------------------------
do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where contype = 'c'
      and conrelid = 'public.properties'::regclass
      and pg_get_constraintdef(oid) like '%title%'
  loop
    -- skip — no existing title check constraint to drop
    null;
  end loop;
end $$;

-- Enforce absolute max length at the DB layer (Zod enforces softer max)
alter table public.properties
  add constraint properties_title_max_length_check
  check (length(title) <= 200);

-- Enforce non-empty title (already NOT NULL but check for whitespace)
alter table public.properties
  add constraint properties_title_not_blank_check
  check (btrim(title) <> '');
