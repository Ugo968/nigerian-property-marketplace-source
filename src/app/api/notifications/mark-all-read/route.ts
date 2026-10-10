import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { getCurrentProfile } from "@/lib/auth/server";
import { logger } from "@/lib/logging";

/**
 * POST /api/notifications/mark-all-read
 *
 * Marks every unread notification for the caller as read.
 * Uses the SECURITY DEFINER mark_all_notifications_read() so the
 * update is constrained to recipient_id = caller.
 */
export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) {
    logger.error("mark_all_read failed", { error: error.message });
    return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
