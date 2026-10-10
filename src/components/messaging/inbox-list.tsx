"use client";

import * as React from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerificationBadge } from "@/components/verification-badge";
import type { InboxItem } from "@/lib/messaging/fetchers";
import { cn } from "@/lib/utils";

/**
 * Inbox list — conversations sorted by last_message_at DESC.
 *
 * Per spec Section 18:
 *   * Conversations with property/context
 *   * Other participant(s)
 *   * Last message preview
 *   * Timestamp
 *   * Unread count
 *   * Verification indicator
 *   * Archived/muted state
 */
export function InboxList({ items }: { items: InboxItem[] }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">
          No conversations yet. Start messaging from a property page or agent application.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {items.map((item) => {
        const lastMsgPreview = item.lastMessage?.deleted_at
          ? "Message deleted"
          : item.lastMessage?.body?.slice(0, 80) ?? "No messages yet";
        const hasUnread = item.unreadCount > 0;

        return (
          <li key={item.conversation.id}>
            <Link
              href={`/dashboard/messages/${item.conversation.id}`}
              className={cn(
                "flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition",
                hasUnread && "bg-primary/5",
              )}
            >
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={item.otherParticipant.avatar_url ?? undefined} alt={item.otherParticipant.full_name} />
                <AvatarFallback className="text-xs">
                  {item.otherParticipant.full_name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={cn("text-sm truncate", hasUnread ? "font-semibold" : "font-medium")}>
                      {item.otherParticipant.full_name}
                    </span>
                    <VerificationBadge
                      state={item.otherParticipant.verification_state as never}
                      hideWhenNotBadged
                      compact
                    />
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {item.lastMessage
                      ? new Date(item.lastMessage.created_at).toLocaleDateString("en-NG", {
                          month: "short",
                          day: "numeric",
                        })
                      : ""}
                  </span>
                </div>

                {item.propertyTitle ? (
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {item.propertyTitle}
                  </p>
                ) : null}

                <p className={cn("text-xs truncate", hasUnread ? "text-foreground" : "text-muted-foreground")}>
                  {lastMsgPreview}
                </p>
              </div>

              {hasUnread ? (
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground"
                  aria-label={`${item.unreadCount} unread messages`}
                >
                  {item.unreadCount}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
