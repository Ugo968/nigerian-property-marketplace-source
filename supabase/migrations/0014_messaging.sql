-- ============================================================================
-- 0014_messaging.sql
-- ============================================================================
-- One-to-one marketplace messaging foundation. Per spec Section 21.
--
-- Conversation limits:
--   Landlord  Free/Pro/Premium → unlimited
--   Agent     Free → 10/month  | Pro → 25/month | Premium → unlimited
--   Company   Free → 15/month  | Pro → 25/month | Premium → unlimited
--
-- Limits restrict STARTING new eligible conversations only. Existing
-- legitimate conversations must NEVER be destroyed or blocked.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- Optional property context (e.g. "inquiring about property X")
  property_id uuid references public.properties(id) on delete set null,
  -- Optional linked application (when chat started from an application)
  application_id uuid references public.property_applications(id) on delete set null,
  -- Conversation type — drives eligibility for new-conversation limits
  conversation_type text not null default 'marketplace'
    check (conversation_type in ('marketplace', 'application', 'support')),
  -- Soft deletion per-participant (handled in conversation_participants)
  last_message_at timestamptz,
  last_message_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create index if not exists conversations_property_idx
  on public.conversations(property_id)
  where property_id is not null;
create index if not exists conversations_application_idx
  on public.conversations(application_id)
  where application_id is not null;
create index if not exists conversations_last_message_idx
  on public.conversations(last_message_at desc)
  where last_message_at is not null;

-- ---------------------------------------------------------------------------
-- conversation_participants
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Per-participant unread tracking
  last_read_message_id uuid,
  unread_count int not null default 0 check (unread_count >= 0),
  -- Per-participant soft deletion (hides from their list without destroying)
  archived_at timestamptz,
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_participants_user_idx
  on public.conversation_participants(user_id, archived_at)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  -- Forwards-compat: messages can be text / image / file / system
  message_type text not null default 'text'
    check (message_type in ('text', 'image', 'file', 'system', 'property_share')),
  body text,
  -- Optional attachment metadata (for image/file types)
  attachment_path text,
  attachment_name text,
  attachment_mime_type text,
  attachment_size_bytes bigint,
  -- Optional property reference (for property_share message type)
  shared_property_id uuid references public.properties(id) on delete set null,
  -- Message status (read receipts at the participant level)
  -- 'sent' = written; 'delivered' = at least one participant has unread > 0;
  -- 'read' = all participants have read
  status text not null default 'sent'
    check (status in ('sent', 'delivered', 'read')),
  -- Edit history
  edited_at timestamptz,
  -- Soft deletion (per-message, by sender)
  deleted_at timestamptz,
  -- Report tracking
  reported_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages(conversation_id, created_at);
create index if not exists messages_sender_idx
  on public.messages(sender_id, created_at desc);
create index if not exists messages_unread_idx
  on public.messages(conversation_id, created_at)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- conversation_blocks — user-to-user block list
-- A blocked user cannot START a new conversation with the blocker.
-- Existing conversations are NOT destroyed — they remain readable for
-- the blocker but the blocked user cannot send new messages.
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id)
);

create index if not exists conversation_blocks_blocker_idx
  on public.conversation_blocks(blocker_id);
create index if not exists conversation_blocks_blocked_idx
  on public.conversation_blocks(blocked_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_blocks enable row level security;

-- Conversations: only participants can read.
create policy "Participants can read their conversations"
  on public.conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversations.id
        and cp.user_id in (select id from public.profiles where user_id = auth.uid())
    )
  );

create policy "Participants can update conversations"
  on public.conversations for update
  to authenticated
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversations.id
        and cp.user_id in (select id from public.profiles where user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversations.id
        and cp.user_id in (select id from public.profiles where user_id = auth.uid())
    )
  );

-- Conversation creation: authenticated users can insert. The application
-- layer enforces monthly new-conversation limits + block checks.
create policy "Authenticated users can create conversations"
  on public.conversations for insert
  to authenticated
  with check (true);

-- Participants: a user manages only their own participant row.
create policy "Users can read their own conversation_participants"
  on public.conversation_participants for select
  to authenticated
  using (
    user_id in (select id from public.profiles where user_id = auth.uid())
    or exists (
      select 1 from public.conversation_participants cp2
      where cp2.conversation_id = conversation_participants.conversation_id
        and cp2.user_id in (select id from public.profiles where user_id = auth.uid())
    )
  );

create policy "Users can manage their own conversation_participants"
  on public.conversation_participants for insert
  to authenticated
  with check (
    user_id in (select id from public.profiles where user_id = auth.uid())
  );

create policy "Users can update their own conversation_participants"
  on public.conversation_participants for update
  to authenticated
  using (user_id in (select id from public.profiles where user_id = auth.uid()))
  with check (user_id in (select id from public.profiles where user_id = auth.uid()));

-- Messages: participants can read all messages in their conversations.
create policy "Participants can read messages in their conversations"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = messages.conversation_id
        and cp.user_id in (select id from public.profiles where user_id = auth.uid())
    )
  );

-- Senders can write messages.
create policy "Participants can send messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id in (select id from public.profiles where user_id = auth.uid())
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = messages.conversation_id
        and cp.user_id = sender_id
    )
  );

-- Senders can edit / soft-delete their own messages.
create policy "Senders can edit their own messages"
  on public.messages for update
  to authenticated
  using (sender_id in (select id from public.profiles where user_id = auth.uid()))
  with check (sender_id in (select id from public.profiles where user_id = auth.uid()));

create policy "Senders can soft-delete their own messages"
  on public.messages for delete
  to authenticated
  using (sender_id in (select id from public.profiles where user_id = auth.uid()));

-- Blocks: only the blocker manages their own blocks.
create policy "Users can manage their own blocks"
  on public.conversation_blocks for all
  to authenticated
  using (blocker_id in (select id from public.profiles where user_id = auth.uid()))
  with check (blocker_id in (select id from public.profiles where user_id = auth.uid()));

-- A user can ALSO see who they've blocked (read-only on blocked_id).
create policy "Users can read who blocked them"
  on public.conversation_blocks for select
  to authenticated
  using (blocked_id in (select id from public.profiles where user_id = auth.uid()));
