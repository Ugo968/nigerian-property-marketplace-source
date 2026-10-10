"use client";

import * as React from "react";
import { Check, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { NotificationRowItem } from "./notification-bell";
import type { NotificationRow } from "@/types";

interface Props {
  filter: "all" | "unread";
}

interface ListResponse {
  items: NotificationRow[];
  nextCursor: string | null;
  unreadCount: number;
}

const PAGE_SIZE = 20;

/**
 * Full notifications list — pagination via cursor (created_at).
 * The bell popover shows the most recent 6; this list shows the
 * full feed and supports "Load more" pagination.
 */
export function NotificationsList({ filter }: Props) {
  const [items, setItems] = React.useState<NotificationRow[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchPage = React.useCallback(
    async (c: string | null, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          filter,
        });
        if (c) params.set("cursor", c);
        const res = await fetch(`/api/notifications?${params}`, {
          credentials: "same-origin",
        });
        if (!res.ok) {
          setError("Couldn't load notifications.");
          return;
        }
        const data = (await res.json()) as ListResponse;
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setHasMore(Boolean(data.nextCursor));
        setCursor(data.nextCursor);
      } catch {
        setError("Couldn't load notifications.");
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [filter],
  );

  // Refetch when the filter changes.
  React.useEffect(() => {
    setCursor(null);
    fetchPage(null, false);
  }, [fetchPage]);

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
    } catch {
      setError("Couldn't mark all as read.");
    } finally {
      setLoading(false);
    }
  }

  function handleMarkRead(id: string) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
    );
    fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
      credentials: "same-origin",
    }).catch(() => {
      // Revert
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: null } : n)),
      );
    });
  }

  function handleMarkUnread(id: string) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: null } : n)),
    );
    fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: false }),
      credentials: "same-origin",
    }).catch(() => {
      // Revert
      setItems((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
        ),
      );
    });
  }

  function handleDismiss(id: string) {
    setItems((prev) => prev.filter((n) => n.id !== id));
    fetch(`/api/notifications/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    }).catch(() => {
      // Re-fetch to restore
      fetchPage(null, false);
    });
  }

  if (loading && items.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => fetchPage(null, false)}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center">
        <Bell className="h-8 w-8 mx-auto text-muted-foreground mb-2" aria-hidden="true" />
        <p className="text-sm font-medium">No notifications</p>
        <p className="text-xs text-muted-foreground mt-1">
          {filter === "unread"
            ? "You're all caught up — no unread notifications."
            : "Activity across Shelty will appear here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {items.length} shown{hasMore ? " · more available" : ""}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkAllRead}
          disabled={loading}
        >
          <Check className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          Mark all read
        </Button>
      </div>

      <ul role="list" className="divide-y rounded-md border bg-background">
        {items.map((n) => (
          <li key={n.id} className="relative">
            <NotificationRowItem
              notification={n}
              onMarkRead={handleMarkRead}
              onMarkUnread={handleMarkUnread}
            />
            <button
              onClick={() => handleDismiss(n.id)}
              className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Dismiss notification"
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchPage(cursor, true)}
            disabled={loadingMore}
          >
            {loadingMore ? <Spinner className="mr-2" /> : null}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
