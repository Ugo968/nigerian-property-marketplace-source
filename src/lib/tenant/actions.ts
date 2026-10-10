/**
 * Tenant-to-landlord contact server action (spec Section 5).
 *
 * Implements the "Contact Landlord" flow:
 *   1. Confirm the tenant has an active paid subscription.
 *   2. Confirm the tenant account is active.
 *   3. Confirm the property is available and eligible.
 *   4. Identify the actual landlord/owner.
 *   5. Create or reuse an authorized conversation.
 *   6. Create an initial enquiry message.
 *   7. Notify the recipient.
 *   8. Record the event for audit.
 *
 * CRITICAL: Never exposes private phone/email/address. Uses the platform
 * messaging system exclusively.
 *
 * Anti-spam: rate-limited + respects monthly conversation limits.
 */

"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/supabase";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/server";
import { rateLimiter, RATE_LIMITS } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging";
import { notificationService } from "@/lib/notifications";
import { capabilitiesFor } from "@/lib/capabilities";
import { canContactLandlord } from "./entitlements";

export type ContactLandlordResult =
  | { ok: true; conversationId: string }
  | { ok: false; message?: string; requiresAuth?: boolean; requiresSubscription?: boolean };

export async function contactLandlordAction(input: {
  propertyId: string;
  message: string;
}): Promise<ContactLandlordResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true, message: "Please sign in." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, requiresAuth: true };
  if (profile.role !== "tenant") {
    return { ok: false, message: "Only tenants can use the contact-landlord feature." };
  }
  if (profile.account_status !== "active") {
    return { ok: false, message: `Your account is ${profile.account_status}.` };
  }

  // Validate the message
  const message = input.message?.trim();
  if (!message || message.length < 10) {
    return { ok: false, message: "Please write a message (at least 10 characters)." };
  }
  if (message.length > 2000) {
    return { ok: false, message: "Message is too long (max 2000 characters)." };
  }

  // Check subscription — must be Pro
  if (profile.subscription_tier !== "pro" && profile.subscription_tier !== "premium") {
    return {
      ok: false,
      requiresSubscription: true,
      message: "Subscribe to contact landlords directly.",
    };
  }

  // Rate-limit
  const rl = await rateLimiter.check({
    key: user.id,
    action: "message",
    ...RATE_LIMITS.message,
  });
  if (!rl.ok) {
    return { ok: false, message: "You're sending messages too quickly. Please slow down." };
  }

  // Check monthly conversation limit via capability system
  const caps = capabilitiesFor(profile.role, profile.subscription_tier);
  if (caps.maxNewConversationsPerMonth !== null && caps.maxNewConversationsPerMonth === 0) {
    return { ok: false, message: "Your plan does not allow new conversations." };
  }

  // Authorize contact
  const auth = await canContactLandlord(input.propertyId);
  if (!auth.ok || !auth.recipientProfileId) {
    return { ok: false, message: auth.message ?? "You cannot contact this landlord." };
  }

  // Anti-spam: check monthly conversation count
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "Database not configured." };

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { count: recentConvCount } = await admin
    .from("conversation_participants")
    .select("conversation_id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .gte("joined_at", monthAgo.toISOString());

  if (
    caps.maxNewConversationsPerMonth !== null &&
    (recentConvCount ?? 0) >= caps.maxNewConversationsPerMonth
  ) {
    return {
      ok: false,
      message: `You've reached your monthly limit of ${caps.maxNewConversationsPerMonth} new conversations. Existing conversations continue to work.`,
    };
  }

  // Sanitise the message (XSS prevention)
  const sanitisedMessage = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Create or reuse a conversation between this tenant and the landlord.
  // Conversation type: "marketplace" (property enquiry).
  // RLS: both participants can see the conversation.
  const { data: existingConv } = await admin
    .from("conversations")
    .select("id")
    .or(`and(property_id.eq.${input.propertyId},conversation_type.eq.marketplace)`)
    .in(
      "id",
      (
        await admin
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", profile.id)
      ).data?.map((r: { conversation_id: string }) => r.conversation_id) ?? [],
    )
    .limit(1)
    .maybeSingle();

  let conversationId: string;

  if (existingConv) {
    conversationId = (existingConv as { id: string }).id;
  } else {
    // Create a new conversation
    const { data: newConv, error: convErr } = await admin
      .from("conversations")
      .insert({
        conversation_type: "marketplace",
        property_id: input.propertyId,
      } as never)
      .select("id")
      .single();
    if (convErr || !newConv) {
      logger.error("contactLandlord: conversation create failed", { error: convErr?.message });
      return { ok: false, message: "We couldn't start the conversation." };
    }
    conversationId = (newConv as { id: string }).id;

    // Add both participants
    await admin
      .from("conversation_participants")
      .insert([
        { conversation_id: conversationId, user_id: profile.id, unread_count: 0 },
        { conversation_id: conversationId, user_id: auth.recipientProfileId, unread_count: 1 },
      ] as never);
  }

  // Insert the initial message
  const { error: msgErr } = await admin.from("messages").insert({
    conversation_id: conversationId,
    sender_id: profile.id,
    message_type: "text",
    body: sanitisedMessage,
    status: "sent",
  } as never);
  if (msgErr) {
    logger.error("contactLandlord: message insert failed", { error: msgErr.message });
    return { ok: false, message: "We couldn't send your message." };
  }

  // Update conversation last_message_at
  await admin
    .from("conversations")
    .update({ last_message_at: now.toISOString() } as never)
    .eq("id", conversationId);

  // Notify the landlord
  await notificationService.dispatch({
    recipientId: auth.recipientProfileId,
    type: "message.new",
    title: `New enquiry from ${profile.full_name}`,
    body: `${profile.full_name} sent you an enquiry about your property.`,
    href: `/dashboard/messages`,
    relatedEntityType: "conversation",
    relatedEntityId: conversationId,
    eventKey: `tenant.contact_landlord:${conversationId}:${auth.recipientProfileId}`,
    metadata: {
      conversationId,
      propertyId: input.propertyId,
      senderProfileId: profile.id,
      senderName: profile.full_name,
      isDirectOwner: auth.isDirectOwner,
    },
    emailTemplateInput: {
      senderName: profile.full_name,
      preview: sanitisedMessage.slice(0, 120),
      conversationId,
      unreadCount: 1,
    },
  });

  // Audit log
  await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "tenant.contact_landlord",
    target_type: "property",
    target_id: input.propertyId,
    metadata: {
      conversationId,
      recipientProfileId: auth.recipientProfileId,
      recipientRole: auth.recipientRole,
    },
  } as never);

  revalidatePath("/dashboard/messages", "page");
  return { ok: true, conversationId };
}
