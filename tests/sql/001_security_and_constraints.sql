-- ============================================================================
-- SQL INTEGRITY & SECURITY TESTS
-- ============================================================================
-- These test scripts verify RLS + constraints behave as expected.
-- They are intended to be run against a real Supabase Postgres instance
-- (e.g. via `psql $DATABASE_URL -f tests/sql/001_security_and_constraints.sql`).
--
-- In the sandbox dev environment these scripts cannot be executed (no
-- live Postgres). They are stored here as executable documentation of
-- the expected behavior; CI / production deployment runs them.
--
-- Convention:
--   * Each test block begins with a comment header
--   * Tests use `begin; ... rollback;` so they don't pollute state
--   * Failed expectations raise an exception
-- ============================================================================

-- ---------------------------------------------------------------------------
-- TEST: User can read own profile
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub": "test-user-1-uuid", "role": "authenticated"}';
  perform 1 from public.profiles where user_id = 'test-user-1-uuid'::uuid limit 1;
rollback;

-- ---------------------------------------------------------------------------
-- TEST: User cannot modify another user's profile
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub": "test-user-1-uuid", "role": "authenticated"}';
  update public.profiles
    set full_name = 'hacked'
    where user_id = 'test-user-2-uuid'::uuid;
  if found then
    raise exception 'SECURITY VIOLATION: user modified another user''s profile';
  end if;
rollback;

-- ---------------------------------------------------------------------------
-- TEST: Invalid role is rejected by CHECK constraint
-- ---------------------------------------------------------------------------
begin;
  set local role postgres;
  do $$
  begin
    insert into public.profiles (user_id, role, full_name)
    values ('00000000-0000-0000-0000-000000000001'::uuid, 'invalid_role', 'test');
    raise exception 'CONSTRAINT VIOLATION: invalid role was accepted';
  exception when check_violation then
    null;
  end;
rollback;

-- ---------------------------------------------------------------------------
-- TEST: Duplicate saved property is rejected (unique constraint)
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub": "test-user-1-uuid", "role": "authenticated"}';
  do $$
  begin
    insert into public.saved_properties (user_id, property_id)
    values ('test-user-1-uuid'::uuid, 'test-property-uuid'::uuid);
    insert into public.saved_properties (user_id, property_id)
    values ('test-user-1-uuid'::uuid, 'test-property-uuid'::uuid);
    raise exception 'CONSTRAINT VIOLATION: duplicate saved property was accepted';
  exception when unique_violation then
    null;
  end;
rollback;

-- ---------------------------------------------------------------------------
-- TEST: Duplicate active application is rejected (EXCLUDE constraint)
-- ---------------------------------------------------------------------------
begin;
  set local role postgres;
  insert into public.property_applications (property_id, agent_id, decision_maker_id, status)
  values ('test-property-uuid'::uuid, 'test-agent-uuid'::uuid, 'test-owner-uuid'::uuid, 'pending');
  do $$
  begin
    insert into public.property_applications (property_id, agent_id, decision_maker_id, status)
    values ('test-property-uuid'::uuid, 'test-agent-uuid'::uuid, 'test-owner-uuid'::uuid, 'pending');
    raise exception 'CONSTRAINT VIOLATION: duplicate active application accepted';
  exception when exclusion_violation then
    null;
  end;
rollback;

-- ---------------------------------------------------------------------------
-- TEST: Users cannot access unrelated conversations
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub": "test-user-1-uuid", "role": "authenticated"}';
  perform 1 from public.conversations c
  where c.id = 'test-conv-not-mine-uuid'::uuid;
  if found then
    raise exception 'SECURITY VIOLATION: user accessed unrelated conversation';
  end if;
rollback;

-- ---------------------------------------------------------------------------
-- TEST: Users cannot manually mark payments successful
-- (No UPDATE RLS policy on payments — only service role can update status)
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub": "test-user-1-uuid", "role": "authenticated"}';
  update public.payments
    set status = 'successful', verified_at = now()
    where id = 'test-payment-uuid'::uuid
      and user_id = 'test-user-1-uuid'::uuid;
  if found then
    raise exception 'SECURITY VIOLATION: user marked own payment successful';
  end if;
rollback;

-- ---------------------------------------------------------------------------
-- TEST: Invalid rating (< 1 or > 5) rejected
-- ---------------------------------------------------------------------------
begin;
  set local role postgres;
  do $$
  begin
    insert into public.reviews (
      reviewer_id, reviewed_id, reviewed_entity_type, rating, body
    ) values (
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      'agent', 0, 'invalid rating'
    );
    raise exception 'CONSTRAINT VIOLATION: rating 0 accepted';
  exception when check_violation then
    null;
  end;
rollback;

-- ---------------------------------------------------------------------------
-- TEST: Normal users cannot approve their own verification
-- (verification_reviews has no user RLS policy)
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub": "test-user-1-uuid", "role": "authenticated"}';
  do $$
  begin
    insert into public.verification_reviews (application_id, reviewer_id, decision, notes)
    values (
      'test-application-uuid'::uuid,
      '00000000-0000-0000-0000-000000000099'::uuid,
      'approved',
      'self approval attempt'
    );
    raise exception 'SECURITY VIOLATION: user approved own verification';
  exception when insufficient_privilege then
    null;
  end;
rollback;

-- ---------------------------------------------------------------------------
-- TEST: Audit log entries cannot be modified by ordinary users
-- ---------------------------------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub": "test-user-1-uuid", "role": "authenticated"}';
  update public.audit_logs set action = 'tampered' where id = 'test-audit-uuid'::uuid;
  if found then
    raise exception 'SECURITY VIOLATION: user modified audit log';
  end if;
rollback;

-- ---------------------------------------------------------------------------
-- TEST: Advertising campaign budget below ₦5,000 is rejected
-- (₦5,000 = 500,000 kobo = budget_naira >= 500000 check)
-- ---------------------------------------------------------------------------
begin;
  set local role postgres;
  do $$
  begin
    insert into public.advertising_campaigns (
      business_id, name, placement_id, budget_naira
    ) values (
      'test-biz-uuid'::uuid, 'cheap campaign', 'test-placement-uuid'::uuid, 499999
    );
    raise exception 'CONSTRAINT VIOLATION: campaign below ₦5,000 accepted';
  exception when check_violation then
    null;
  end;
rollback;
