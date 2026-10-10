import { NextRequest, NextResponse } from "next/server";
import {
  getMyNotificationPreferences,
  updateMyNotificationPreference,
} from "@/lib/notifications";
import type { PreferenceUpdateInput } from "@/lib/notifications";

/**
 * GET /api/notifications/preferences
 * Returns the caller's preferences (all categories, defaults filled).
 *
 * PATCH /api/notifications/preferences
 * Body: PreferenceUpdateInput — server validates + rejects mandatory
 * category changes.
 */

export async function GET() {
  const result = await getMyNotificationPreferences();
  if (!result.ok) {
    const status = result.requiresAuth ? 401 : 500;
    return NextResponse.json({ error: result.message ?? "FAILED" }, { status });
  }
  return NextResponse.json({ preferences: result.preferences });
}

export async function PATCH(req: NextRequest) {
  let body: PreferenceUpdateInput;
  try {
    body = (await req.json()) as PreferenceUpdateInput;
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const result = await updateMyNotificationPreference(body);
  if (!result.ok) {
    const status = result.message === "Please sign in." ? 401 : 400;
    return NextResponse.json(
      { error: result.message ?? "FAILED", fieldErrors: result.fieldErrors },
      { status },
    );
  }

  return NextResponse.json({ preference: result.preference });
}
