import { NextRequest, NextResponse } from "next/server";
import { matchPropertyToSavedSearches } from "@/lib/notifications";
import { logger } from "@/lib/logging";

/**
 * POST /api/cron/saved-search-matcher
 *
 * Triggered by a scheduled job (Vercel Cron, GitHub Actions, external
 * scheduler) to run the saved-search matcher against recently
 * published properties.
 *
 * Body: { propertyIds: string[] } — the properties to match.
 *       If empty, the endpoint returns 200 with skipped=0 (the caller
 *       can supply the recently-published ids via a join query in the
 *       scheduler itself; this endpoint just runs the matcher).
 *
 * Auth: a shared secret passed via the `X-Cron-Token` header. The
 * secret is read from CRON_SECRET env var. In dev (no secret
 * configured) the endpoint is open so manual testing works.
 *
 * Per spec Section 31: the matcher is idempotent — running it twice
 * for the same property produces no duplicate notifications.
 */
export async function POST(req: NextRequest) {
  // Auth check.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const token = req.headers.get("x-cron-token") ?? "";
    if (token !== cronSecret) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "CRON_SECRET_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  let body: { propertyIds?: string[] };
  try {
    body = (await req.json()) as { propertyIds?: string[] };
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const ids = body.propertyIds ?? [];
  const results: Array<{
    propertyId: string;
    matchedSearches: number;
    dispatchedAlerts: number;
    pendingDigestAlerts: number;
    skipped: number;
    error?: string;
  }> = [];
  for (const id of ids) {
    try {
      const r = await matchPropertyToSavedSearches(id);
      results.push({ propertyId: id, ...r });
    } catch (err) {
      logger.error("saved-search matcher threw", {
        propertyId: id,
        error: err instanceof Error ? err.message : "unknown",
      });
      results.push({
        propertyId: id,
        matchedSearches: 0,
        dispatchedAlerts: 0,
        pendingDigestAlerts: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return NextResponse.json({ results });
}
