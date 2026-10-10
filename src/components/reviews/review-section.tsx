import * as React from "react";
import Link from "next/link";
import { StarRatingDisplay } from "./star-rating";
import { VerificationBadge } from "@/components/verification-badge";
import type { ReviewWithReviewer } from "@/lib/reviews/aggregation";
import type { AggregateRating } from "@/lib/reviews/aggregation";

/**
 * Rating summary — shows average + count + distribution.
 *
 * Per spec Section 12, 13:
 *   * Average rating
 *   * Total review count
 *   * Rating distribution (5★ to 1★)
 *   * No fake ratings (spec Section 36)
 */
export function RatingSummary({ aggregate }: { aggregate: AggregateRating }) {
  if (aggregate.totalCount === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground">
          No reviews yet. Reviews appear after verified marketplace interactions.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Reviews reflect individual experiences and do not replace independent verification.
        </p>
      </div>
    );
  }

  const { average, totalCount, distribution } = aggregate;
  const maxCount = Math.max(distribution.five, distribution.four, distribution.three, distribution.two, distribution.one, 1);

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-center">
      {/* Average */}
      <div className="text-center shrink-0">
        <p className="text-3xl font-bold">{average.toFixed(1)}</p>
        <StarRatingDisplay rating={average} size={16} className="mt-1" />
        <p className="text-xs text-muted-foreground mt-1">{totalCount} review{totalCount === 1 ? "" : "s"}</p>
      </div>

      {/* Distribution */}
      <div className="flex-1 space-y-1 w-full">
        {[
          { label: "5", count: distribution.five },
          { label: "4", count: distribution.four },
          { label: "3", count: distribution.three },
          { label: "2", count: distribution.two },
          { label: "1", count: distribution.one },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-xs">
            <span className="w-4 text-muted-foreground">{row.label}★</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-featured"
                style={{ width: `${(row.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="w-6 text-right text-muted-foreground">{row.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Review card — single review display.
 *
 * Per spec Section 11:
 *   * Reviewer display name + verification badge
 *   * Rating + review text + date
 *   * Property context (title + link if visible)
 *   * Edited indicator
 *   * No private information exposed
 */
export function ReviewCard({ data }: { data: ReviewWithReviewer }) {
  const { review, reviewer, property_title } = data;

  return (
    <article className="rounded-lg border bg-background p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {reviewer.avatar_url ? (
            <img
              src={reviewer.avatar_url}
              alt={reviewer.full_name}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
              {reviewer.full_name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <Link
              href={
                reviewer.role === "agent"
                  ? `/agents/${reviewer.id}`
                  : reviewer.role === "company"
                    ? `/companies/${reviewer.id}`
                    : `/landlords/${reviewer.id}`
              }
              className="text-sm font-medium hover:underline"
            >
              {reviewer.full_name}
            </Link>
            <div className="flex items-center gap-1">
              <VerificationBadge
                state={reviewer.verification_state as never}
                hideWhenNotBadged
                compact
              />
            </div>
          </div>
        </div>
        <div className="text-right">
          <StarRatingDisplay rating={review.rating} size={14} />
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(review.created_at).toLocaleDateString("en-NG", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
      </div>

      {review.title ? (
        <p className="font-medium text-sm">{review.title}</p>
      ) : null}

      <p className="text-sm text-foreground whitespace-pre-wrap">{review.body}</p>

      {review.response_text ? (
        <div className="rounded-md border bg-muted/30 p-3 mt-2">
          <p className="text-xs font-medium text-muted-foreground mb-1">Response:</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{review.response_text}</p>
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-1 border-t">
        {property_title ? (
          <p className="text-xs text-muted-foreground">
            About: <span className="font-medium">{property_title}</span>
          </p>
        ) : (
          <span />
        )}
        <p className="text-xs text-muted-foreground">
          Reviews reflect individual experiences and do not replace independent verification.
        </p>
      </div>
    </article>
  );
}

/**
 * Review section — integrated into profile pages.
 *
 * Per spec Section 13, 26:
 *   * Shows rating summary + review list
 *   * Separate from verification (spec Section 14)
 *   * Empty state when no reviews (spec Section 36: no fake reviews)
 */
export function ReviewSection({
  reviews,
  aggregate,
  hasMore,
  onLoadMore,
  loadingMore,
}: {
  reviews: ReviewWithReviewer[];
  aggregate: AggregateRating;
  hasMore: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}) {
  return (
    <section className="rounded-lg border bg-background p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Reviews</h2>
        {aggregate.totalCount > 0 ? (
          <span className="text-sm text-muted-foreground">
            {aggregate.average.toFixed(1)} ★ · {aggregate.totalCount} review{aggregate.totalCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      <RatingSummary aggregate={aggregate} />

      {reviews.length > 0 ? (
        <div className="space-y-3">
          {reviews.map((item) => (
            <ReviewCard key={item.review.id} data={item} />
          ))}

          {hasMore ? (
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="mx-auto block text-sm text-primary hover:underline"
            >
              {loadingMore ? "Loading..." : "Load more reviews"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
