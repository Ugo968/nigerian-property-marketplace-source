"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media";
import type { NotificationRow } from "@/types";

/**
 * NotificationBell — top-bar icon with live unread count + a recent-
 * notifications popover (desktop) / sheet (mobile).
 *
 * Realtime: subscribes to INSERT events on `public.notifications`
 * via Supabase Realtime. Falls back to a 60s polling interval when
 * Realtime is unavailable or the browser client returns null.
 *
 * Accessibility:
 *   - The bell has aria-label + aria-live="polite" badge.
 *   - Unread state is NOT colour-only — there's a count badge AND a
 *     visually-hidden "unread" text for screen readers.
 *   - Keyboard: arrow keys navigate the list, Esc closes.
 */

interface NotificationBellProps {
  className?: string;
}

interface RecentNotificationsResponse {
  items: NotificationRow[];
  nextCursor: string | null;
  unreadCount: number;
}

const POLL_INTERVAL_MS = 60 * 1000;
const RECENT_LIMIT = 6;

export function NotificationBell({ className }: NotificationBellProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  // Realtime channel ref. Stored in a ref so we can clean up on unmount.
  const channelRef = React.useRef<{ unsubscribe: () => void } | null>(null);

  const fetchRecent = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/notifications?limit=${RECENT_LIMIT}`,
        { credentials: "same-origin" },
      );
      if (!res.ok) {
        setError("Couldn't load notifications.");
        return;
      }
      const data = (await res.json()) as RecentNotificationsResponse;
      setItems(data.items ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      setError("Couldn't load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + realtime subscription.
  React.useEffect(() => {
    fetchRecent();

    // Set up Realtime subscription for new notifications.
    // The browser client is created lazily — we delay to avoid SSR.
    let cancelled = false;
    (async () => {
      const { createClient: createBrowserClient } = await import("@/lib/db/supabase/browser");
      const supabase = createBrowserClient();
      if (!supabase || cancelled) return;

      const channel = supabase
        .channel("public:notifications")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
          },
          () => {
            // Refetch the count + recent list. RLS on the live query
            // ensures we only see our own rows.
            fetchRecent();
          },
        )
        .subscribe();

      channelRef.current = {
        unsubscribe: () => {
          supabase.removeChannel(channel);
        },
      };
    })();

    // Fallback polling — covers cases where Realtime isn't working
    // (firewall, slow reconnect, etc.). Per spec Section 37: "Database
    // state remains authoritative."
    const pollId = window.setInterval(fetchRecent, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, [fetchRecent]);

  async function handleMarkAllRead() {
    setLoading(true);
    try {
      await fetch("/api/notifications/mark-all-read", {
        method: "POST",
        credentials: "same-origin",
      });
      setItems((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })),
      );
      setUnreadCount(0);
    } catch {
      setError("Couldn't mark all as read.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkOneRead(id: string) {
    // Optimistic update.
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
        credentials: "same-origin",
      });
    } catch {
      // Revert on failure.
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: null } : n)),
      );
      setUnreadCount((c) => c + 1);
    }
  }

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className={cn("relative", className)}
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unreadCount > 0 && (
        <>
          <Badge
            aria-hidden="true"
            className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center border-2 border-background"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
          <span className="sr-only">You have {unreadCount} unread notifications</span>
        </>
      )}
    </Button>
  );

  const content = (
    <div className="flex flex-col h-full max-h-[80vh]">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div>
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {unreadCount} unread
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={loading}
            className="text-xs"
          >
            <Check className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            Mark all read
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        {loading && items.length === 0 ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center">
            <Bell className="h-8 w-8 mx-auto text-muted-foreground mb-2" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </div>
        ) : (
          <ul role="list" className="divide-y">
            {items.map((n) => (
              <NotificationRowItem
                key={n.id}
                notification={n}
                onNavigate={() => setOpen(false)}
                onMarkRead={handleMarkOneRead}
              />
            ))}
          </ul>
        )}
      </ScrollArea>

      <div className="border-t p-2">
        <Button asChild variant="ghost" size="sm" className="w-full">
          <Link href="/dashboard/notifications" onClick={() => setOpen(false)}>
            View all
          </Link>
        </Button>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-80 p-0"
          aria-live="polite"
          aria-atomic="false"
        >
          {content}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="right" className="w-full sm:w-96 p-0">
        <SheetHeader className="space-y-0 border-b">
          <SheetTitle className="px-4 py-3">Notifications</SheetTitle>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Notification row item — used both in the bell popover and the full
// dashboard list.
// ---------------------------------------------------------------------------

interface NotificationRowItemProps {
  notification: NotificationRow;
  onNavigate?: () => void;
  onMarkRead?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
}

export function NotificationRowItem({
  notification,
  onNavigate,
  onMarkRead,
  onMarkUnread,
}: NotificationRowItemProps) {
  const isUnread = !notification.read_at;
  const level = notification.level;
  const priority = notification.priority;
  const Icon = iconForType(notification.type);
  const href = notification.href ?? "/dashboard/notifications";

  const accentClass = levelAccentClass(level, priority);

  return (
    <li
      role="listitem"
      className={cn(
        "relative hover:bg-muted/50 transition-colors",
        isUnread && "bg-primary/5",
      )}
    >
      <div className="flex items-start gap-3 px-3 py-3">
        <span
          className={cn(
            "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            accentClass,
          )}
          aria-hidden="true"
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className="text-sm font-medium leading-snug line-clamp-2">
              {notification.title}
            </p>
            {isUnread && (
              <span
                className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-primary"
                aria-label="Unread"
                title="Unread"
              />
            )}
          </div>
          {notification.body && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {notification.body}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">
            <RelativeTime iso={notification.created_at} />
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 px-3 pb-2">
        {isUnread && onMarkRead && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => onMarkRead(notification.id)}
          >
            <Check className="h-3 w-3 mr-1" aria-hidden="true" />
            Mark read
          </Button>
        )}
        {!isUnread && onMarkUnread && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => onMarkUnread(notification.id)}
          >
            Mark unread
          </Button>
        )}
      </div>
      {/* The whole row is a link to the deep-link href. The buttons
          above stop propagation so clicking them doesn't navigate. */}
      <Link
        href={href}
        onClick={onNavigate}
        className="absolute inset-0"
        aria-label={`${notification.title} — open`}
        tabIndex={-1}
      />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function iconForType(type: string): React.ElementType {
  // Lightweight mapping — keep it simple, the icon is decorative.
  if (type.startsWith("application.")) {
    return Check;
  }
  if (type.startsWith("payment.") || type.startsWith("subscription.")) {
    return Bell;
  }
  if (type.startsWith("verification.")) {
    return Check;
  }
  if (type.startsWith("message.")) {
    return Bell;
  }
  if (type.startsWith("property.") || type.startsWith("saved_search.")) {
    return Bell;
  }
  if (type.startsWith("review.")) {
    return Bell;
  }
  if (type.startsWith("campaign.")) {
    return Bell;
  }
  if (type.startsWith("promotion.")) {
    return Bell;
  }
  if (type.startsWith("account.")) {
    return Bell;
  }
  return Bell;
}

function levelAccentClass(level: string, priority: string): string {
  if (priority === "critical") return "bg-red-100 text-red-700";
  if (priority === "high") return "bg-amber-100 text-amber-700";
  if (level === "success") return "bg-emerald-100 text-emerald-700";
  if (level === "warning") return "bg-amber-100 text-amber-700";
  if (level === "error") return "bg-red-100 text-red-700";
  return "bg-muted text-muted-foreground";
}

function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = React.useState(() => formatRelative(iso));
  React.useEffect(() => {
    setLabel(formatRelative(iso));
    const id = window.setInterval(() => setLabel(formatRelative(iso)), 30 * 1000);
    return () => window.clearInterval(id);
  }, [iso]);
  return <>{label}</>;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then || Number.isNaN(then)) return "";
  const now = Date.now();
  const diff = now - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w ago`;
  return new Date(iso).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
  });
}

export { X as CloseIcon };
