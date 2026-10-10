import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { getCurrentProfile } from "@/lib/auth/server";
import { logger } from "@/lib/logging";
import type { NotificationRow } from "@/types";

/**
 * GET /api/notifications
 *
 * Returns the caller's notifications, paginated by cursor (created_at).
 *
 * Query params:
 *   - cursor: ISO timestamp of the last item on the previous page. NULL = first page.
 *   - limit:  page size (default 20, max 50).
 *   - filter: 'unread' | 'all' (default 'all').
 *
 * Response shape:
 *   {
 *     items: NotificationRow[],
 *     nextCursor: string | null,  // null when end reached
 *     unreadCount: number,
 *   }
 *
 * RLS enforces recipient_id ownership — the query below looks like it
 * could return other users' rows, but RLS narrows the WHERE clause
 * transparently.
 */
export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (profile.account_status === "banned" || profile.deleted_at) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limitParam = url.searchParams.get("limit") ?? "20";
  const filter = url.searchParams.get("filter") ?? "all";

  const limit = Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 50);

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", profile.id)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit + 1); // fetch 1 extra to detect next page

  if (filter === "unread") {
    query = query.is("read_at", null);
  }
  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) {
    logger.error("notifications list failed", { error: error.message });
    return NextResponse.json({ error: "QUERY_FAILED" }, { status: 500 });
  }

  const rows = (data ?? []) as NotificationRow[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length > 0
    ? items[items.length - 1].created_at
    : null;

  // Lightweight unread count — separate query to keep pagination stable
  // even when notifications are read during paging.
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", profile.id)
    .is("read_at", null)
    .is("dismissed_at", null);

  return NextResponse.json({
    items,
    nextCursor,
    unreadCount: count ?? 0,
  });
}
