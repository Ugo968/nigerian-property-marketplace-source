import { createServerClient } from "@/lib/db/supabase";
import { getCurrentProfile } from "@/lib/auth/server";
import type { ConversationRow, MessageRow, ProfileRow } from "@/types";

/**
 * Messaging fetchers — used by Server Components to load conversation + message data.
 *
 * Per spec Sections 17, 18, 19, 21, 35, 38:
 *   * Inbox: conversations with last message preview + unread count + participant info
 *   * Conversation: paginated messages (cursor-based, newest first)
 *   * Older messages: load via cursor
 *   * Efficient queries (no N+1 — batch fetch participants + last message)
 *   * Only conversations the caller is a participant in (RLS + server check)
 */

const PAGE_SIZE = 30;

export interface InboxItem {
  conversation: ConversationRow;
  otherParticipant: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
    verification_state: string;
  };
  lastMessage: {
    id: string;
    body: string | null;
    sender_id: string;
    message_type: string;
    created_at: string;
    deleted_at: string | null;
  } | null;
  unreadCount: number;
  propertyTitle?: string | null;
}

/**
 * Returns the caller's inbox — conversations sorted by last_message_at DESC.
 * Per spec Section 18: shows conversations with property/context, other participant,
 * last message preview, timestamp, unread count, verification indicator.
 */
export async function getInbox(): Promise<InboxItem[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = await createServerClient();
  if (!supabase) return [];

  // Fetch conversation_participants for the caller
  const { data: participantRows } = await supabase
    .from("conversation_participants")
    .select(`
      conversation_id,
      unread_count,
      archived_at,
      conversations!inner(
        id, property_id, application_id, conversation_type,
        last_message_at, last_message_id, created_at, updated_at
      )
    `)
    .eq("user_id", profile.id)
    .is("archived_at", null) // exclude archived
    .order("conversations(last_message_at)", { ascending: false })
    .limit(50);

  if (!participantRows || participantRows.length === 0) return [];

  // Extract conversation IDs
  const items = participantRows as Array<{
    conversation_id: string;
    unread_count: number;
    archived_at: string | null;
    conversations: ConversationRow;
  }>;

  const conversationIds = items.map((i) => i.conversation_id);

  // Batch fetch: other participants for all conversations
  const { data: allParticipants } = await supabase
    .from("conversation_participants")
    .select("conversation_id, user_id")
    .in("conversation_id", conversationIds)
    .neq("user_id", profile.id);

  // Map conversation_id → other participant's user_id
  const otherParticipantMap = new Map<string, string>();
  if (allParticipants) {
    for (const p of allParticipants as Array<{ conversation_id: string; user_id: string }>) {
      if (!otherParticipantMap.has(p.conversation_id)) {
        otherParticipantMap.set(p.conversation_id, p.user_id);
      }
    }
  }

  // Batch fetch: profiles for other participants
  const otherUserIds = Array.from(new Set(otherParticipantMap.values()));
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role, verification_state, account_status, deleted_at")
    .in("id", otherUserIds);

  const profileMap = new Map<string, {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
    verification_state: string;
  }>();
  if (profileRows) {
    for (const p of profileRows as Array<{
      id: string;
      full_name: string;
      avatar_url: string | null;
      role: string;
      verification_state: string;
      account_status: string;
      deleted_at: string | null;
    }>) {
      if (!p.deleted_at && p.account_status !== "banned") {
        profileMap.set(p.id, {
          id: p.id,
          full_name: p.full_name,
          avatar_url: p.avatar_url,
          role: p.role,
          verification_state: p.verification_state,
        });
      }
    }
  }

  // Batch fetch: last messages
  const lastMessageIds = items
    .map((i) => i.conversations.last_message_id)
    .filter(Boolean) as string[];

  const { data: lastMessages } = await supabase
    .from("messages")
    .select("id, body, sender_id, message_type, created_at, deleted_at")
    .in("id", lastMessageIds.length > 0 ? lastMessageIds : ["00000000-0000-0000-0000-000000000000"]);

  const lastMessageMap = new Map<string, InboxItem["lastMessage"]>();
  if (lastMessages) {
    for (const m of lastMessages as Array<{
      id: string;
      body: string | null;
      sender_id: string;
      message_type: string;
      created_at: string;
      deleted_at: string | null;
    }>) {
      lastMessageMap.set(m.id, {
        id: m.id,
        body: m.body,
        sender_id: m.sender_id,
        message_type: m.message_type,
        created_at: m.created_at,
        deleted_at: m.deleted_at,
      });
    }
  }

  // Batch fetch: property titles
  const propertyIds = items
    .map((i) => i.conversations.property_id)
    .filter(Boolean) as string[];
  const propertyTitleMap = new Map<string, string>();
  if (propertyIds.length > 0) {
    const { data: propRows } = await supabase
      .from("properties")
      .select("id, title")
      .in("id", propertyIds);
    if (propRows) {
      for (const p of propRows as Array<{ id: string; title: string }>) {
        propertyTitleMap.set(p.id, p.title);
      }
    }
  }

  // Compose inbox items
  const inbox: InboxItem[] = [];
  for (const item of items) {
    const otherUserId = otherParticipantMap.get(item.conversation_id);
    const otherParticipant = otherUserId ? profileMap.get(otherUserId) : null;
    if (!otherParticipant) continue; // skip if other participant is deleted/banned

    const lastMsg = item.conversations.last_message_id
      ? lastMessageMap.get(item.conversations.last_message_id)
      : null;

    inbox.push({
      conversation: item.conversations,
      otherParticipant,
      lastMessage: lastMsg ?? null,
      unreadCount: item.unread_count,
      propertyTitle: item.conversations.property_id
        ? propertyTitleMap.get(item.conversations.property_id) ?? null
        : null,
    });
  }

  return inbox;
}

// ---------------------------------------------------------------------------
// CONVERSATION DETAIL — messages with pagination
// ---------------------------------------------------------------------------

export interface ConversationDetail {
  conversation: ConversationRow;
  otherParticipant: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
    verification_state: string;
  };
  propertyTitle: string | null;
  messages: Array<{
    id: string;
    sender_id: string;
    body: string | null;
    message_type: string;
    created_at: string;
    deleted_at: string | null;
  }>;
  hasMoreMessages: boolean;
  oldestMessageId: string | null;
}

/**
 * Returns a single conversation with its messages (newest PAGE_SIZE messages).
 * Per spec Section 19: validates the caller is a participant.
 * Per spec Section 21: cursor-based pagination for older messages.
 */
export async function getConversation(
  conversationId: string,
): Promise<ConversationDetail | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createServerClient();
  if (!supabase) return null;

  // Verify participation
  const { data: participant } = await supabase
    .from("conversation_participants")
    .select("conversation_id, conversations!inner(*)")
    .eq("conversation_id", conversationId)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!participant) return null;

  const conv = (participant as { conversations: ConversationRow }).conversations;

  // Fetch other participant
  const { data: otherPart } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .neq("user_id", profile.id)
    .limit(1)
    .maybeSingle();

  let otherParticipant = null;
  if (otherPart) {
    const otherUserId = (otherPart as { user_id: string }).user_id;
    const { data: otherProfile } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role, verification_state")
      .eq("id", otherUserId)
      .maybeSingle();
    if (otherProfile) {
      otherParticipant = otherProfile as {
        id: string;
        full_name: string;
        avatar_url: string | null;
        role: string;
        verification_state: string;
      };
    }
  }

  // Fetch property title if applicable
  let propertyTitle = null;
  if (conv.property_id) {
    const { data: prop } = await supabase
      .from("properties")
      .select("title")
      .eq("id", conv.property_id)
      .maybeSingle();
    propertyTitle = (prop as { title: string } | null)?.title ?? null;
  }

  // Fetch messages — newest PAGE_SIZE first (then reversed for display)
  const { data: messageRows } = await supabase
    .from("messages")
    .select("id, sender_id, body, message_type, created_at, deleted_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1); // +1 to check hasMore

  const allMessages = (messageRows ?? []) as Array<{
    id: string;
    sender_id: string;
    body: string | null;
    message_type: string;
    created_at: string;
    deleted_at: string | null;
  }>;

  const hasMoreMessages = allMessages.length > PAGE_SIZE;
  const messages = hasMoreMessages ? allMessages.slice(0, PAGE_SIZE) : allMessages;

  // Reverse for chronological display (oldest first)
  messages.reverse();

  return {
    conversation: conv,
    otherParticipant,
    propertyTitle,
    messages,
    hasMoreMessages,
    oldestMessageId: messages.length > 0 ? messages[0].id : null,
  };
}

/**
 * Load older messages for a conversation (cursor-based pagination).
 * Per spec Section 21: "Load earlier messages" or infinite scroll.
 */
export async function getOlderMessages(
  conversationId: string,
  beforeMessageId: string,
): Promise<{
  messages: Array<{
    id: string;
    sender_id: string;
    body: string | null;
    message_type: string;
    created_at: string;
    deleted_at: string | null;
  }>;
  hasMore: boolean;
  oldestMessageId: string | null;
} | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createServerClient();
  if (!supabase) return null;

  // Verify participation
  const { data: participant } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", profile.id)
    .maybeSingle();
  if (!participant) return null;

  // Get the created_at of the cursor message
  const { data: cursorMessage } = await supabase
    .from("messages")
    .select("created_at")
    .eq("id", beforeMessageId)
    .maybeSingle();
  if (!cursorMessage) return null;

  const cursorTime = (cursorMessage as { created_at: string }).created_at;

  // Fetch messages older than the cursor
  const { data: messageRows } = await supabase
    .from("messages")
    .select("id, sender_id, body, message_type, created_at, deleted_at")
    .eq("conversation_id", conversationId)
    .lt("created_at", cursorTime)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1);

  const allMessages = (messageRows ?? []) as Array<{
    id: string;
    sender_id: string;
    body: string | null;
    message_type: string;
    created_at: string;
    deleted_at: string | null;
  }>;

  const hasMore = allMessages.length > PAGE_SIZE;
  const messages = hasMore ? allMessages.slice(0, PAGE_SIZE) : allMessages;
  messages.reverse();

  return {
    messages,
    hasMore,
    oldestMessageId: messages.length > 0 ? messages[0].id : null,
  };
}
