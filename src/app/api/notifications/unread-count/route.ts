import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { getCurrentProfile } from "@/lib/auth/server";

/**
 * GET /api/notifications/unread-count
 *
 * Lightweight endpoint the bell polls on a slow interval (and the
 * Realtime subscription uses as a refresh trigger after a push).
 * Returns the caller's unread notification count.
 *
 * RLS narrows to the caller only — even though we filter by
 * recipient_id explicitly, RLS would block cross-user reads anyway.
 */
export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ count: 0 });
  }

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", profile.id)
    .is("read_at", null)
    .is("dismissed_at", null);

  return NextResponse.json({ count: count ?? 0 });
}
