"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { StatusBadge } from "./admin-table";
import {
  hideReviewAction,
  removeReviewAction,
  restoreReviewAction,
} from "@/lib/admin";

interface Props {
  review: {
    id: string;
    reviewer_id: string;
    reviewed_id: string;
    rating: number;
    title: string | null;
    body: string;
    status: string;
    moderation_reason: string | null;
    response_text: string | null;
    created_at: string;
  };
  reports: Array<{ id: string; reason: string; status: string; created_at: string }>;
}

export function AdminReviewDetailClient({ review, reports }: Props) {
  const router = useRouter();
  const [action, setAction] = React.useState<"hide" | "remove" | "restore" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleConfirm(reason: string) {
    setError(null);
    if (!action) return;
    const input = { reviewId: review.id, reason };
    let result;
    if (action === "hide") result = await hideReviewAction(input);
    else if (action === "remove") result = await removeReviewAction(input);
    else if (action === "restore") result = await restoreReviewAction(input);
    if (result && !result.ok) {
      setError(result.message ?? "Action failed.");
      throw new Error(result.message ?? "Action failed.");
    }
    setAction(null);
    router.refresh();
  }

  const isPublished = review.status === "published";
  const isHidden = review.status === "hidden";
  const isRemoved = review.status === "removed";

  return (
    <div className="space-y-6">
      <header>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/reviews">← Back to reviews</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight mt-2">
          {review.title ?? "Review"}
        </h1>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <StatusBadge status={review.status} />
          <span className="text-sm font-medium">{review.rating}★</span>
          <span className="text-xs text-muted-foreground">
            {new Date(review.created_at).toLocaleDateString("en-NG")}
          </span>
        </div>
      </header>

      <div className="rounded-md border border-info/30 bg-info/5 p-3 text-xs text-info-foreground">
        <p>
          Moderation can hide / remove / restore reviews but CANNOT alter the star rating
          or rewrite the body. Original content is preserved in audit records when removed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Review content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Rating</p>
            <p className="text-lg font-semibold">{review.rating}★</p>
          </div>
          {review.title ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Title</p>
              <p>{review.title}</p>
            </div>
          ) : null}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Body</p>
            <p className="whitespace-pre-wrap">{review.body}</p>
          </div>
          {review.response_text ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Response from reviewed party</p>
              <p className="whitespace-pre-wrap italic">{review.response_text}</p>
            </div>
          ) : null}
          {review.moderation_reason ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Moderation reason</p>
              <p>{review.moderation_reason}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parties</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reviewer</span>
            <Link href={`/admin/users/${review.reviewer_id}`} className="hover:underline">View profile</Link>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reviewed</span>
            <Link href={`/admin/users/${review.reviewed_id}`} className="hover:underline">View profile</Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reports ({reports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reports filed.</p>
          ) : (
            <ul className="space-y-2">
              {reports.map((r) => (
                <li key={r.id} className="border-l-2 border-muted pl-3 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium capitalize">{r.reason.replace(/_/g, " ")}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(r.created_at).toLocaleString("en-NG")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Moderation actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {isPublished && (
              <>
                <Button variant="outline" onClick={() => setAction("hide")}>Hide review</Button>
                <Button variant="destructive" onClick={() => setAction("remove")}>Remove review</Button>
              </>
            )}
            {(isHidden || isRemoved) && (
              <Button variant="outline" onClick={() => setAction("restore")}>Restore review</Button>
            )}
          </div>
          {error ? <p className="text-sm text-destructive mt-2">{error}</p> : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={action !== null}
        onOpenChange={(o) => { if (!o) setAction(null); }}
        title={
          action === "hide" ? "Hide review" :
          action === "remove" ? "Remove review" :
          action === "restore" ? "Restore review" : "Confirm"
        }
        description={
          action === "hide" ? "Hide this review? It will be invisible to the public but kept in the database." :
          action === "remove" ? "Remove this review? The original content is preserved in audit records for moderation history." :
          action === "restore" ? "Restore this review? It will become visible to the public again." :
          "Confirm this moderation action."
        }
        actionLabel={
          action === "hide" ? "Hide review" :
          action === "remove" ? "Remove review" :
          action === "restore" ? "Restore review" : "Confirm"
        }
        destructive={action === "remove"}
        requireReason
        reasonMinLength={action === "remove" ? 5 : 3}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
