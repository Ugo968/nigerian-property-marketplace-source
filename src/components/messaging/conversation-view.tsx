"use client";

import * as React from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { serverConfig } from "@/lib/security/server-config";
import type { Database } from "@/types";
import type { ConversationDetail } from "@/lib/messaging/fetchers";
import { MessageComposer } from "./message-composer";
import { VerificationBadge } from "@/components/verification-badge";
import { SafetyNotice } from "@/components/layout/safety-notice";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { ChevronLeft, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Conversation view — the full messaging UI for a single conversation.
 *
 * Per spec Sections 12, 13, 14, 15, 19, 20, 21, 33, 45:
 *   * Chronological message display
 *   * Sender vs other participant differentiation
 *   * System messages (distinct styling)
 *   * Real-time subscription via Supabase Realtime
 *   * "Load earlier messages" for pagination
 *   * Safety notice for property conversations
 *   * Mobile: full-height, sticky composer, back button
 *   * Accessible: proper labels, keyboard navigation
 */

interface MessageItem {
  id: string;
  sender_id: string;
  body: string | null;
  message_type: string;
  created_at: string;
  deleted_at: string | null;
}

export function ConversationView({
  conversationId,
  initialData,
  callerProfileId,
}: {
  conversationId: string;
  initialData: ConversationDetail;
  callerProfileId: string;
}) {
  const [messages, setMessages] = React.useState<MessageItem[]>(initialData.messages);
  const [hasMore, setHasMore] = React.useState(initialData.hasMoreMessages);
  const [oldestId, setOldestId] = React.useState<string | null>(initialData.oldestMessageId);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [realtimeConnected, setRealtimeConnected] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const otherParticipant = initialData.otherParticipant;

  // -------------------------------------------------------------------
  // Real-time subscription (spec Section 14, 15)
  // -------------------------------------------------------------------
  React.useEffect(() => {
    const { supabaseUrl, supabaseAnonKey } = serverConfig.supabase;
    if (!supabaseUrl || !supabaseAnonKey) return;

    const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);

    // Subscribe to new messages in this conversation
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as MessageItem;
          // Avoid duplicates (spec Section 14: "duplicate event protection")
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
          // Auto-scroll to bottom
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 50);
        },
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    // Cleanup (spec Section 14: "Unsubscribe when components unmount")
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Auto-scroll to bottom on mount + when messages change
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // -------------------------------------------------------------------
  // Load older messages (spec Section 21)
  // -------------------------------------------------------------------
  async function loadOlder() {
    if (!oldestId || loadingMore) return;
    setLoadingMore(true);

    // Use the browser client to fetch older messages via a server action
    // (we can't call server actions from here — so we use the browser client)
    const { supabaseUrl, supabaseAnonKey } = serverConfig.supabase;
    if (!supabaseUrl || !supabaseAnonKey) {
      setLoadingMore(false);
      return;
    }
    const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);

    // Get the cursor message's created_at
    const cursorMsg = messages[0];
    if (!cursorMsg) {
      setLoadingMore(false);
      return;
    }

    const { data: olderMessages } = await supabase
      .from("messages")
      .select("id, sender_id, body, message_type, created_at, deleted_at")
      .eq("conversation_id", conversationId)
      .lt("created_at", cursorMsg.created_at)
      .order("created_at", { ascending: false })
      .limit(31);

    if (olderMessages && olderMessages.length > 0) {
      const msgs = olderMessages as MessageItem[];
      const hasMoreNew = msgs.length === 31;
      const slice = hasMoreNew ? msgs.slice(0, 30) : msgs;
      slice.reverse();
      setMessages((prev) => [...slice, ...prev]);
      setHasMore(hasMoreNew);
      setOldestId(slice.length > 0 ? slice[0].id : null);
    }

    setLoadingMore(false);
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header (spec Section 19) */}
      <header className="border-b bg-background px-4 py-3 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="sm:hidden" aria-label="Back to messages">
          <Link href="/dashboard/messages">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            {otherParticipant?.full_name ?? "Unknown"}
          </p>
          <div className="flex items-center gap-2">
            <VerificationBadge
              state={(otherParticipant?.verification_state as never) ?? "unverified"}
              hideWhenNotBadged
              compact
            />
            <span className="text-xs text-muted-foreground capitalize">
              {otherParticipant?.role}
            </span>
            {realtimeConnected ? (
              <span className="inline-flex items-center gap-1 text-xs text-success">
                <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
                Live
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {/* Property context (spec Section 3) */}
      {initialData.propertyTitle ? (
        <div className="bg-muted/30 px-4 py-2 border-b">
          <p className="text-xs text-muted-foreground">
            About: <span className="font-medium text-foreground">{initialData.propertyTitle}</span>
          </p>
        </div>
      ) : null}

      {/* Messages (spec Section 12) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {hasMore ? (
          <button
            onClick={loadOlder}
            disabled={loadingMore}
            className="mx-auto block text-xs text-primary hover:underline"
          >
            {loadingMore ? "Loading..." : "Load earlier messages"}
          </button>
        ) : null}

        {messages.map((msg) => {
          const isOwn = msg.sender_id === callerProfileId;
          const isSystem = msg.message_type === "system";

          if (isSystem) {
            return (
              <div key={msg.id} className="text-center">
                <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {msg.body}
                </span>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={cn("flex", isOwn ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                  isOwn
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {msg.deleted_at ? (
                  <span className="italic text-muted-foreground">Message deleted</span>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                )}
                <p className={cn("text-xs mt-1", isOwn ? "text-primary-foreground/60" : "text-muted-foreground")}>
                  {new Date(msg.created_at).toLocaleTimeString("en-NG", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Safety reminder (spec Section 33) */}
      {initialData.conversation.property_id ? (
        <div className="px-4 py-1">
          <SafetyNotice compact />
        </div>
      ) : null}

      {/* Composer (spec Section 11) */}
      <MessageComposer conversationId={conversationId} />
    </div>
  );
}
