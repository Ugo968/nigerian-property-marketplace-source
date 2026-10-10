import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { getCurrentProfile } from "@/lib/auth/server";
import { logger } from "@/lib/logging";

/**
 * PATCH /api/notifications/[id]
 *
 * Body: { read: true | false }
 *
 * Uses the SECURITY DEFINER functions mark_notification_read /
 * mark_notification_unread so the row is only mutated when the caller
 * is the recipient. RLS also enforces this.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  const { id } = await params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  let body: { read?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const fnName = body.read === false
    ? "mark_notification_unread"
    : "mark_notification_read";

  const { error } = await supabase.rpc(fnName, {
    notification_uuid: id,
  } as never);
  if (error) {
    logger.error("notification mark failed", {
      fnName,
      id,
      error: error.message,
    });
    return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/notifications/[id]
 *
 * Soft-deletes (dismisses) a notification. Audit history stays intact
 * via notification_events + audit_logs.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  const { error } = await supabase.rpc("dismiss_notification", {
    notification_uuid: id,
  } as never);
  if (error) {
    logger.error("dismiss notification failed", { id, error: error.message });
    return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
