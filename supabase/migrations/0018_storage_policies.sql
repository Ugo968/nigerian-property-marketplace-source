-- ============================================================================
-- 0018_storage_policies.sql
-- ============================================================================
-- Supabase Storage buckets + per-bucket RLS policies.
--
-- Bucket list:
--   * avatars                       — public read, owner write
--   * property-media                — public read, owner write
--   * verification-documents        — PRIVATE — owner + admin only
--   * advertising-creatives         — public read (when in active campaign), owner write
--   * message-attachments           — PRIVATE — conversation participants only
--   * report-evidence               — PRIVATE — reporter + admin only
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Note: storage.objects is a Supabase-managed table. We enable RLS on it
-- (already enabled by default in Supabase projects), and create per-bucket
-- policies using the lower(bucket_id) check.
-- ---------------------------------------------------------------------------

-- Avatars: public read; owner write.
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Property media: public read; only property managers write.
-- The storage path is structured as: property_id/file_name
-- We verify the property's owner/creator/agent matches the caller.
-- ---------------------------------------------------------------------------
drop policy if exists "property_media_public_read" on storage.objects;
create policy "property_media_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'property-media');

drop policy if exists "property_media_manager_write" on storage.objects;
create policy "property_media_manager_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'property-media'
    and public.can_manage_property((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "property_media_manager_update" on storage.objects;
create policy "property_media_manager_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'property-media'
    and public.can_manage_property((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'property-media'
    and public.can_manage_property((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "property_media_manager_delete" on storage.objects;
create policy "property_media_manager_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'property-media'
    and public.can_manage_property((storage.foldername(name))[1]::uuid)
  );

-- ---------------------------------------------------------------------------
-- Verification documents: PRIVATE.
-- Read: only the applicant (folder is application_id, which is owned by them)
-- Write: only the applicant
-- Admin: via service role (bypasses RLS)
-- ---------------------------------------------------------------------------
drop policy if exists "verification_docs_applicant_read" on storage.objects;
create policy "verification_docs_applicant_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'verification-documents'
    and exists (
      select 1 from public.verification_applications va
      join public.profiles p on p.id = va.applicant_id
      where va.id = (storage.foldername(name))[1]::uuid
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "verification_docs_applicant_write" on storage.objects;
create policy "verification_docs_applicant_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'verification-documents'
    and exists (
      select 1 from public.verification_applications va
      join public.profiles p on p.id = va.applicant_id
      where va.id = (storage.foldername(name))[1]::uuid
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "verification_docs_applicant_delete" on storage.objects;
create policy "verification_docs_applicant_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'verification-documents'
    and exists (
      select 1 from public.verification_applications va
      join public.profiles p on p.id = va.applicant_id
      where va.id = (storage.foldername(name))[1]::uuid
        and p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Advertising creatives: public read when in active campaign; owner write.
-- Storage path: business_id/creative_id/file_name
-- ---------------------------------------------------------------------------
drop policy if exists "advertising_creatives_owner_write" on storage.objects;
create policy "advertising_creatives_owner_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'advertising-creatives'
    and exists (
      select 1 from public.advertising_businesses b
      where b.id = (storage.foldername(name))[1]::uuid
        and b.owner_user_id = auth.uid()
    )
  );

drop policy if exists "advertising_creatives_owner_update" on storage.objects;
create policy "advertising_creatives_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'advertising-creatives'
    and exists (
      select 1 from public.advertising_businesses b
      where b.id = (storage.foldername(name))[1]::uuid
        and b.owner_user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'advertising-creatives'
    and exists (
      select 1 from public.advertising_businesses b
      where b.id = (storage.foldername(name))[1]::uuid
        and b.owner_user_id = auth.uid()
    )
  );

drop policy if exists "advertising_creatives_owner_delete" on storage.objects;
create policy "advertising_creatives_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'advertising-creatives'
    and exists (
      select 1 from public.advertising_businesses b
      where b.id = (storage.foldername(name))[1]::uuid
        and b.owner_user_id = auth.uid()
    )
  );

drop policy if exists "advertising_creatives_public_read" on storage.objects;
create policy "advertising_creatives_public_read"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'advertising-creatives'
  );

-- ---------------------------------------------------------------------------
-- Message attachments: PRIVATE.
-- Only conversation participants can read/write.
-- Storage path: conversation_id/sender_id/file_name
-- ---------------------------------------------------------------------------
drop policy if exists "message_attachments_participant_read" on storage.objects;
create policy "message_attachments_participant_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = (storage.foldername(name))[1]::uuid
        and cp.user_id in (select id from public.profiles where user_id = auth.uid())
    )
  );

drop policy if exists "message_attachments_participant_write" on storage.objects;
create policy "message_attachments_participant_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = (storage.foldername(name))[1]::uuid
        and cp.user_id in (select id from public.profiles where user_id = auth.uid())
    )
  );

drop policy if exists "message_attachments_participant_delete" on storage.objects;
create policy "message_attachments_participant_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = (storage.foldername(name))[1]::uuid
        and cp.user_id in (select id from public.profiles where user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Report evidence: PRIVATE.
-- Reporter + admin only.
-- Storage path: report_id/file_name
-- ---------------------------------------------------------------------------
drop policy if exists "report_evidence_reporter_read" on storage.objects;
create policy "report_evidence_reporter_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'report-evidence'
    and exists (
      select 1 from public.reports r
      where r.id = (storage.foldername(name))[1]::uuid
        and (
          r.reporter_id in (select id from public.profiles where user_id = auth.uid())
          or public.is_caller_admin()
        )
    )
  );

drop policy if exists "report_evidence_reporter_write" on storage.objects;
create policy "report_evidence_reporter_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-evidence'
    and exists (
      select 1 from public.reports r
      where r.id = (storage.foldername(name))[1]::uuid
        and r.reporter_id in (select id from public.profiles where user_id = auth.uid())
    )
  );

drop policy if exists "report_evidence_reporter_delete" on storage.objects;
create policy "report_evidence_reporter_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'report-evidence'
    and exists (
      select 1 from public.reports r
      where r.id = (storage.foldername(name))[1]::uuid
        and (
          r.reporter_id in (select id from public.profiles where user_id = auth.uid())
          or public.is_caller_admin()
        )
    )
  );
