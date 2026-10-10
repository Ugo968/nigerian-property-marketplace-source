"use client";

import * as React from "react";
import { ReviewSection } from "./review-section";
import { ReviewFormDialog } from "./review-form-dialog";
import { Button } from "@/components/ui/button";
import type { ReviewWithReviewer, AggregateRating } from "@/lib/reviews/aggregation";
import type { QualifyingInteraction } from "@/lib/reviews/eligibility";

/**
 * Client-side review section wrapper.
 *
 * Wrs the server-rendered ReviewSection with client-side interactivity:
 * - "Write a review" button (opens dialog if eligible)
 * - "Load more" pagination
 *
 * Per spec Section 13, 26:
 *   * Integrates into profile pages
 *   * Shows rating summary + review list
 *   * Eligibility checked server-side (passed as prop)
 */
export function ReviewSectionClient({
  revieweeId,
  revieweeName,
  initialReviews,
  initialAggregate,
  initialHasMore,
  canReview,
  qualifyingInteraction,
  callerSignedIn,
}: {
  revieweeId: string;
  revieweeName: string;
  initialReviews: ReviewWithReviewer[];
  initialAggregate: AggregateRating;
  initialHasMore: boolean;
  canReview: boolean;
  qualifyingInteraction?: QualifyingInteraction;
  callerSignedIn: boolean;
}) {
  const [reviewOpen, setReviewOpen] = React.useState(false);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Reviews</h2>
        {canReview ? (
          <Button size="sm" onClick={() => setReviewOpen(true)}>
            Write a review
          </Button>
        ) : callerSignedIn ? null : (
          <Button size="sm" variant="outline" asChild>
            <a href={`/login?next=${encodeURIComponent(`/agents/${revieweeId}`)}`}>
              Sign in to review
            </a>
          </Button>
        )}
      </div>

      <ReviewSection
        reviews={initialReviews}
        aggregate={initialAggregate}
        hasMore={initialHasMore}
      />

      {canReview ? (
        <ReviewFormDialog
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          revieweeId={revieweeId}
          revieweeName={revieweeName}
          qualifyingInteraction={qualifyingInteraction}
        />
      ) : null}
    </>
  );
}
