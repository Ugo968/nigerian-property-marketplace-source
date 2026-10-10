import { NextRequest, NextResponse } from "next/server";
import { unsubscribeViaEmail } from "@/lib/notifications";
import type { NotificationCategory } from "@/types";
import { NOTIFICATION_CATEGORIES } from "@/types";

/**
 * GET /api/notifications/unsubscribe?email=...&category=...
 *
 * One-click unsubscribe link for non-transactional emails.
 * Per spec Section 34:
 *   - Rejects mandatory categories.
 *   - Cannot modify another user's preferences (the email is personalised
 *     by the renderer at send time).
 *
 * Returns a small HTML page so the user sees confirmation in their
 * mail client's browser window.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const email = url.searchParams.get("email") ?? "";
  const categoryParam = url.searchParams.get("category") ?? "";

  if (!email || !categoryParam) {
    return renderHtml("Invalid link", "This unsubscribe link is missing required parameters.");
  }
  if (!NOTIFICATION_CATEGORIES.includes(categoryParam as NotificationCategory)) {
    return renderHtml("Invalid link", "This unsubscribe link is invalid.");
  }

  const result = await unsubscribeViaEmail({
    email,
    category: categoryParam as NotificationCategory,
  });

  if (!result.ok) {
    return renderHtml("Unsubscribe failed", result.message);
  }

  return renderHtml("Unsubscribed", result.message, /*success*/ true);
}

function renderHtml(title: string, message: string, success = false): NextResponse {
  const color = success ? "#0f766e" : "#dc2626";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escape(title)} · Shelty</title>
  <style>
    body { margin:0; padding:0; background:#f9fafb; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif; color:#111827; }
    .container { max-width:480px; margin:0 auto; padding:48px 24px; text-align:center; }
    .brand { font-size:20px; font-weight:700; color:#0f766e; margin-bottom:24px; }
    .title { font-size:24px; font-weight:600; margin:0 0 16px 0; color:${color}; }
    .message { font-size:15px; line-height:1.6; color:#4b5563; }
    a { color:#0f766e; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">Shelty</div>
    <h1 class="title">${escape(title)}</h1>
    <p class="message">${escape(message)}</p>
    <p class="message"><a href="/">Return to Shelty</a></p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
