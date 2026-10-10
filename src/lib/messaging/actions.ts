"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createAdminClient } from "@/lib/db/supabase";
import {
  getCurrentUser,
  getCurrentProfile,
} from "@/lib/auth/server";
import { capabilitiesFor } from "@/lib/capabilities";
import { rateLimiter, RATE_LIMITS } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging";
import { notificationService } from "@/lib/notifications";
import type { ProfileRow } from "@/types";

import { MAX_MESSAGE_LENGTH } from "./constants";

/**
 * Messaging server actions.
 *
 * Per spec Sections 9, 10, 26, 27, 28, 29, 31, 34, 35, 36, 37, 42:
 *   * Conversations have context (property, application, representation)
 *   * Duplicate conversations prevented (same property + same participants)
 *   * New-conversation monthly limits enforced via capability system
 *   * Existing conversations NEVER blocked when limit reached (spec Section 26)
 *   * Verification restrictions enforced server-side (never client-supplied)
 *   * sender_id derived from server session — never client-supplied
 *   * Rate-limited (message send: 60/hr, conversation create: 10/hr)
 *   * System messages generated server-side only
 *   * Audit events recorded (metadata only — no message bodies)
 *   * Suspended/banned users cannot initiate or send messages
 */

export type MessagingActionResult =
  | { ok: true; conversationId?: string; messageId?: string; redirectTo?: string }
  | { ok: false; fieldErrors?: Record<string, string[]>; message?: string; limitReached?: boolean; requiresAuth?: boolean };

// ---------------------------------------------------------------------------
// CREATE OR REUSE CONVERSATION
// ---------------------------------------------------------------------------

export async function createOrReuseConversation(input: {
  recipientId: string;
  propertyId?: string;
  applicationId?: string;
  conversationType?: "marketplace" | "application" | "support";
  initialMessage?: string;
}): Promise<MessagingActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, requiresAuth: true, message: "Please sign in to start a conversation." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, requiresAuth: true };
  }

  // Account must be active (spec Section 42)
  if (profile.account_status !== "active") {
    return {
      ok: false,
      message: `Your account is ${profile.account_status}. You cannot start new conversations.`,
    };
  }

  // Can't message yourself
  if (input.recipientId === profile.id) {
    return { ok: false, message: "You cannot start a conversation with yourself." };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Verify recipient exists + is active + is not soft-deleted
  const { data: recipientRow } = await supabase
    .from("profiles")
    .select("id, account_status, deleted_at, role, verification_state, subscription_tier")
    .eq("id", input.recipientId)
    .maybeSingle();

  const recipient = recipientRow as {
    id: string;
    account_status: string;
    deleted_at: string | null;
    role: string;
    verification_state: string;
    subscription_tier: string;
  } | null;

  if (!recipient || recipient.deleted_at) {
    return { ok: false, message: "Recipient not found." };
  }

  if (recipient.account_status === "banned" || recipient.account_status === "deactivated") {
    return { ok: false, message: "This user is not available for messaging." };
  }

  // Verification restriction (spec Section 29)
  // Agents + companies on plans requiring verified recipients:
  // - Agent Free/Pro: "verified users only"
  // - Company Free/Pro: "verified users only"
  // This means the RECIPIENT must be verified (bronze or blue) for
  // agents/companies to start NEW conversations with them.
  const callerCaps = capabilitiesFor(profile.role, profile.subscription_tier);
  const isVerifiedRecipient =
    recipient.verification_state === "bronze" || recipient.verification_state === "blue";

  // For agents and companies, enforce verified-recipient restriction on new conversations
  // (not on existing conversations — those remain usable per spec Section 26)
  if (
    (profile.role === "agent" || profile.role === "company") &&
    !isVerifiedRecipient &&
    profile.verification_state !== "bronze" &&
    profile.verification_state !== "blue"
  ) {
    // The caller is an agent/company who is NOT verified themselves AND
    // the recipient is NOT verified. Per spec: "Verified users only".
    // This applies to Free and Pro plans.
    if (profile.subscription_tier === "free" || profile.subscription_tier === "pro") {
      return {
        ok: false,
        message: "Your plan requires verified users only for new conversations. Get verified or upgrade to Premium.",
      };
    }
  }

  // Check for existing conversation (duplicate prevention — spec Section 10)
  // Find a conversation where both the caller + recipient are participants
  // and (if provided) the property_id + application_id match
  let existingQuery = supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", profile.id);

  if (input.propertyId) {
    // Find conversations with this property_id
    const { data: propConvs } = await supabase
      .from("conversations")
      .select("id")
      .eq("property_id", input.propertyId)
      .eq("conversation_type", input.conversationType ?? "marketplace");

    if (propConvs && propConvs.length > 0) {
      const propConvIds = (propConvs as Array<{ id: string }>).map((c) => c.id);
      // Check if the recipient is also a participant in any of these
      const { data: sharedConvs } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .in("conversation_id", propConvIds)
        .eq("user_id", input.recipientId);

      if (sharedConvs && sharedConvs.length > 0) {
        // Found existing conversation — reuse it
        const existingId = (sharedConvs[0] as { conversation_id: string }).conversation_id;
        return { ok: true, conversationId: existingId, redirectTo: `/dashboard/messages/${existingId}` };
      }
    }
  } else {
    // No property context — check for any existing marketplace conversation
    const { data: myConvs } = await supabase
      .from("conversation_participants")
      .select("conversation_id, conversations!inner(conversation_type, property_id)")
      .eq("user_id", profile.id);

    if (myConvs && myConvs.length > 0) {
      const myConvIds = (myConvs as Array<{ conversation_id: string }>).map((c) => c.conversation_id);
      const { data: sharedConvs } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .in("conversation_id", myConvIds)
        .eq("user_id", input.recipientId);

      if (sharedConvs && sharedConvs.length > 0) {
        const existingId = (sharedConvs[0] as { conversation_id: string }).conversation_id;
        return { ok: true, conversationId: existingId, redirectTo: `/dashboard/messages/${existingId}` };
      }
    }
  }

  // New conversation — check monthly limit (spec Section 27, 28)
  // Only counts genuinely new eligible conversations
  if (callerCaps.maxNewConversationsPerMonth !== null) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Count conversations the caller created this month
    // We use the conversation_participants table joined with conversations
    // to count conversations where the caller joined this month
    const { count } = await supabase
      .from("conversation_participants")
      .select("conversation_id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .gte("joined_at", monthStart.toISOString());

    if ((count ?? 0) >= callerCaps.maxNewConversationsPerMonth) {
      return {
        ok: false,
        limitReached: true,
        message: `You've reached your ${callerCaps.maxNewConversationsPerMonth} new conversation limit for this month on the ${profile.subscription_tier} plan.`,
      };
    }
  }

  // Rate-limit conversation creation (spec Section 31)
  const rl = await rateLimiter.check({
    key: user.id,
    action: "conversation_create",
    limit: 10,
    windowMs: 60 * 60 * 1000, // 10 / hour
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many conversations. Try again later." };
  }

  // Create the conversation
  const convType = input.conversationType ?? "marketplace";
  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .insert({
      property_id: input.propertyId ?? null,
      application_id: input.applicationId ?? null,
      conversation_type: convType,
    })
    .select("id")
    .single();

  if (convError || !conv) {
    logger.error("Conversation creation failed", { userId: user.id, error: convError?.message });
    return { ok: false, message: "We couldn't create the conversation." };
  }

  const conversationId = (conv as { id: string }).id;

  // Add participants
  const { error: participantsError } = await supabase
    .from("conversation_participants")
    .insert([
      { conversation_id: conversationId, user_id: profile.id },
      { conversation_id: conversationId, user_id: input.recipientId },
    ]);

  if (participantsError) {
    logger.error("Participant creation failed", { conversationId, error: participantsError.message });
    return { ok: false, message: "We couldn't set up the conversation." };
  }

  // Audit log (metadata only — no message body)
  const admin = createAdminClient();
  if (admin) {
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "conversation.create",
      target_type: "conversation",
      target_id: conversationId,
      metadata: {
        recipient_id: input.recipientId,
        property_id: input.propertyId,
        conversation_type: convType,
      },
    });
  }

  // Send initial message if provided
  if (input.initialMessage && input.initialMessage.trim().length > 0) {
    const messageResult = await sendMessageAction({
      conversationId,
      body: input.initialMessage,
    });
    if (!messageResult.ok) {
      // The conversation was created but the message failed — return success
      // with the conversation ID so the user can navigate to it
      return { ok: true, conversationId, redirectTo: `/dashboard/messages/${conversationId}` };
    }
  }

  revalidatePath("/dashboard/messages", "page");
  return { ok: true, conversationId, redirectTo: `/dashboard/messages/${conversationId}` };
}

// ---------------------------------------------------------------------------
// SEND MESSAGE
// ---------------------------------------------------------------------------

export async function sendMessageAction(input: {
  conversationId: string;
  body: string;
}): Promise<MessagingActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, requiresAuth: true, message: "Please sign in." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, requiresAuth: true };
  }

  // Account must be active (spec Section 42)
  if (profile.account_status !== "active") {
    return {
      ok: false,
      message: `Your account is ${profile.account_status}. You cannot send messages.`,
    };
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Verify the caller is a participant (spec Section 35)
  const { data: participantRow } = await supabase
    .from("conversation_participants")
    .select("conversation_id, archived_at")
    .eq("conversation_id", input.conversationId)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!participantRow) {
    return { ok: false, message: "FORBIDDEN" };
  }

  // Rate-limit message sending (spec Section 31)
  const rl = await rateLimiter.check({
    key: user.id,
    action: "message",
    ...RATE_LIMITS.message,
  });
  if (!rl.ok) {
    return { ok: false, message: "You're sending messages too quickly. Please slow down." };
  }

  // Validate message body (spec Section 8)
  const body = input.body?.trim();
  if (!body) {
    return { ok: false, fieldErrors: { body: ["Message cannot be empty."] } };
  }
  if (body.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      fieldErrors: { body: [`Message must be at most ${MAX_MESSAGE_LENGTH} characters.`] },
    };
  }

  // Sanitise — escape HTML entities (spec Section 7)
  const sanitizedBody = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Insert the message — sender_id is derived from the server session
  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: profile.id,
      message_type: "text",
      body: sanitizedBody,
      status: "sent",
    })
    .select("id")
    .single();

  if (error || !message) {
    logger.error("Message send failed", {
      conversationId: input.conversationId,
      error: error?.message,
    });
    return { ok: false, message: "We couldn't send the message." };
  }

  // Update conversation's last_message_at + last_message_id
  const messageId = (message as { id: string }).id;
  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_id: messageId,
    })
    .eq("id", input.conversationId);

  // Increment unread_count for OTHER participants
  const { data: otherParticipants } = await supabase
    .from("conversation_participants")
    .select("user_id, unread_count")
    .eq("conversation_id", input.conversationId)
    .neq("user_id", profile.id);

  if (otherParticipants) {
    for (const p of otherParticipants as Array<{ user_id: string; unread_count: number }>) {
      await supabase
        .from("conversation_participants")
        .update({ unread_count: p.unread_count + 1 })
        .eq("conversation_id", input.conversationId)
        .eq("user_id", p.user_id);

      // Notify each other participant of the new message (spec Section 21).
      // Dedupe per (recipient, conversation) per day via the event key
      // (so 4 messages from the same sender within 24h produce 1 notification).
      // The recipient's actual unread_count on the conversation is the
      // source of truth for the bell badge; this notification is for
      // surface-level awareness + optional email.
      const dailyBucket = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const eventKey = `message.new:${p.user_id}:${input.conversationId}:${dailyBucket}`;
      // Build a preview — never expose the full message body in email
      // previews per spec Section 21.
      const preview = sanitizedBody.length > 120
        ? sanitizedBody.slice(0, 120) + "…"
        : sanitizedBody;
      await notificationService.dispatch({
        recipientId: p.user_id,
        type: "message.new",
        title: `${profile.full_name} sent you a message`,
        body: preview,
        href: `/dashboard/messages`,
        relatedEntityType: "conversation",
        relatedEntityId: input.conversationId,
        eventKey,
        metadata: {
          conversationId: input.conversationId,
          messageId,
          senderProfileId: profile.id,
          senderName: profile.full_name,
          unreadCount: p.unread_count + 1,
        },
        emailTemplateInput: {
          senderName: profile.full_name,
          preview,
          conversationId: input.conversationId,
          unreadCount: p.unread_count + 1,
        },
      });
    }
  }

  revalidatePath("/dashboard/messages", "page");
  revalidatePath(`/dashboard/messages/${input.conversationId}`, "page");
  return { ok: true, messageId };
}

// ---------------------------------------------------------------------------
// MARK CONVERSATION AS READ
// ---------------------------------------------------------------------------

export async function markConversationReadAction(conversationId: string): Promise<MessagingActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const supabase = await createServerClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  // Verify participation
  const { data: participant } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_message_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!participant) {
    return { ok: false, message: "FORBIDDEN" };
  }

  // Get the latest message ID in this conversation
  const { data: latestMessage } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestId = (latestMessage as { id: string } | null)?.id ?? null;

  // Update participant: set last_read + reset unread_count
  const { error } = await supabase
    .from("conversation_participants")
    .update({
      last_read_message_id: latestId,
      unread_count: 0,
    })
    .eq("conversation_id", conversationId)
    .eq("user_id", profile.id);

  if (error) {
    return { ok: false, message: "We couldn't mark the conversation as read." };
  }

  revalidatePath("/dashboard/messages", "page");
  revalidatePath(`/dashboard/messages/${conversationId}`, "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// SOFT DELETE MESSAGE
// ---------------------------------------------------------------------------

export async function softDeleteMessageAction(messageId: string): Promise<MessagingActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  const supabase = await createServerClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  // Verify the caller is the sender (spec Section 23)
  const { data: message } = await supabase
    .from("messages")
    .select("id, sender_id, deleted_at")
    .eq("id", messageId)
    .maybeSingle();

  if (!message) {
    return { ok: false, message: "Message not found." };
  }

  const msg = message as { id: string; sender_id: string; deleted_at: string | null };
  if (msg.sender_id !== profile.id) {
    return { ok: false, message: "You can only delete your own messages." };
  }
  if (msg.deleted_at) {
    return { ok: true }; // already deleted
  }

  const { error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId);

  if (error) {
    return { ok: false, message: "We couldn't delete the message." };
  }

  // Audit log (metadata only)
  const admin = createAdminClient();
  if (admin) {
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "message.soft_delete",
      target_type: "message",
      target_id: messageId,
      metadata: {},
    });
  }

  revalidatePath(`/dashboard/messages`, "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// REPORT CONVERSATION
// ---------------------------------------------------------------------------

export async function reportConversationAction(input: {
  conversationId: string;
  reason: string;
  description: string;
}): Promise<MessagingActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  // Validate reason
  const allowedReasons = new Set([
    "scam_attempt", "harassment", "inappropriate_content",
    "fraudulent_agent", "fraudulent_owner", "misrepresentation",
    "spam", "other",
  ]);
  if (!allowedReasons.has(input.reason)) {
    return { ok: false, fieldErrors: { reason: ["Invalid report reason."] } };
  }
  if (input.description.trim().length < 10) {
    return {
      ok: false,
      fieldErrors: { description: ["Please describe the issue (at least 10 characters)."] },
    };
  }

  // Rate-limit
  const rl = await rateLimiter.check({
    key: user.id,
    action: "report",
    ...RATE_LIMITS.report,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many reports. Try again later." };
  }

  const supabase = await createServerClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { error } = await supabase.from("reports").insert({
    reporter_id: profile.id,
    entity_type: "message",
    entity_id: input.conversationId,
    reason: input.reason,
    description: input.description.trim(),
    status: "open",
  });

  if (error) {
    return { ok: false, message: "We couldn't submit your report." };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// BLOCK USER
// ---------------------------------------------------------------------------

export async function blockUserAction(input: {
  blockedId: string;
  reason?: string;
}): Promise<MessagingActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };

  if (input.blockedId === profile.id) {
    return { ok: false, message: "You cannot block yourself." };
  }

  const supabase = await createServerClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  // Check if already blocked
  const { data: existing } = await supabase
    .from("conversation_blocks")
    .select("id")
    .eq("blocker_id", profile.id)
    .eq("blocked_id", input.blockedId)
    .maybeSingle();

  if (existing) {
    return { ok: true }; // already blocked
  }

  const { error } = await supabase.from("conversation_blocks").insert({
    blocker_id: profile.id,
    blocked_id: input.blockedId,
    reason: input.reason?.trim() || null,
  });

  if (error) {
    return { ok: false, message: "We couldn't block this user." };
  }

  // Audit log (metadata only)
  const admin = createAdminClient();
  if (admin) {
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "conversation.block",
      target_type: "profile",
      target_id: input.blockedId,
      metadata: { reason: input.reason },
    });
  }

  return { ok: true };
}
