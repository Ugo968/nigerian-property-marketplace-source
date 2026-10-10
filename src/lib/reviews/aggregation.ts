import { createServerClient } from "@/lib/db/supabase";
import type { ReviewRow } from "@/types";

/**
 * Reputation aggregation service.
 *
 * Per spec Sections 12, 35:
 *   * Calculate average rating + total count + distribution
 *   * Exclude removed/hidden reviews (spec Section 12)
 *   * Do NOT manipulate ratings based on subscription tier (spec Section 12)
 *   * Use efficient queries (avoid N+1)
 *   * Use pagination for review lists
 */

export interface AggregateRating {
  average: number;
  totalCount: number;
  distribution: {
    five: number;
    four: number;
    three: number;
    two: number;
    one: number;
  };
}

const EMPTY_AGGREGATE: AggregateRating = {
  average: 0,
  totalCount: 0,
  distribution: { five: 0, four: 0, three: 0, two: 0, one: 0 },
};

/**
 * Returns the aggregate rating for a user (reviewee).
 * Only counts published reviews.
 */
export async function getAggregateRating(
  revieweeId: string,
): Promise<AggregateRating> {
  const supabase = await createServerClient();
  if (!supabase) return EMPTY_AGGREGATE;

  const { data: reviews } = await supabase
    .from("reviews")
    .select("rating")
    .eq("reviewed_id", revieweeId)
    .eq("status", "published");

  if (!reviews || reviews.length === 0) {
    return EMPTY_AGGREGATE;
  }

  const ratings = (reviews as Array<{ rating: number }>).map((r) => r.rating);
  const total = ratings.length;
  const sum = ratings.reduce((acc, r) => acc + r, 0);

  return {
    average: total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
    totalCount: total,
    distribution: {
      five: ratings.filter((r) => r === 5).length,
      four: ratings.filter((r) => r === 4).length,
      three: ratings.filter((r) => r === 3).length,
      two: ratings.filter((r) => r === 2).length,
      one: ratings.filter((r) => r === 1).length,
    },
  };
}

export interface ReviewWithReviewer {
  review: ReviewRow;
  reviewer: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: string;
    verification_state: string;
  };
  property_title: string | null;
}

const PAGE_SIZE = 10;

/**
 * Returns published reviews for a user, with reviewer info.
 * Paginated (cursor-based via offset).
 */
export async function getReviewsForProfile(
  revieweeId: string,
  page: number = 1,
): Promise<{ reviews: ReviewWithReviewer[]; hasMore: boolean; aggregate: AggregateRating }> {
  const supabase = await createServerClient();
  if (!supabase) return { reviews: [], hasMore: false, aggregate: EMPTY_AGGREGATE };

  // Fetch reviews (paginated)
  const offset = (page - 1) * PAGE_SIZE;
  const { data: reviewRows } = await supabase
    .from("reviews")
    .select("*")
    .eq("reviewed_id", revieweeId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE);

  if (!reviewRows || reviewRows.length === 0) {
    const aggregate = await getAggregateRating(revieweeId);
    return { reviews: [], hasMore: false, aggregate };
  }

  const reviews = reviewRows as ReviewRow[];
  const hasMore = reviews.length > PAGE_SIZE;
  const pageReviews = hasMore ? reviews.slice(0, PAGE_SIZE) : reviews;

  // Batch fetch reviewer profiles
  const reviewerIds = Array.from(new Set(pageReviews.map((r) => r.reviewer_id)));
  const { data: reviewerRows } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role, verification_state")
    .in("id", reviewerIds);

  const reviewerMap = new Map<string, ReviewWithReviewer["reviewer"]>();
  if (reviewerRows) {
    for (const r of reviewerRows as Array<{
      id: string;
      full_name: string;
      avatar_url: string | null;
      role: string;
      verification_state: string;
    }>) {
      reviewerMap.set(r.id, r);
    }
  }

  // Batch fetch property titles
  const propertyIds = Array.from(new Set(pageReviews.map((r) => r.property_id).filter(Boolean) as string[]));
  const propertyTitleMap = new Map<string, string>();
  if (propertyIds.length > 0) {
    const { data: propRows } = await supabase
      .from("properties")
      .select("id, title")
      .in("id", propertyIds);
    if (propRows) {
      for (const p of propRows as Array<{ id: string; title: string }>) {
        propertyTitleMap.set(p.id, p.title);
      }
    }
  }

  // Compose
  const enrichedReviews: ReviewWithReviewer[] = pageReviews.map((review) => ({
    review,
    reviewer: reviewerMap.get(review.reviewer_id) ?? {
      id: review.reviewer_id,
      full_name: "Anonymous",
      avatar_url: null,
      role: "unknown",
      verification_state: "unverified",
    },
    property_title: review.property_id ? propertyTitleMap.get(review.property_id) ?? null : null,
  }));

  // Get aggregate
  const aggregate = await getAggregateRating(revieweeId);

  return { reviews: enrichedReviews, hasMore, aggregate };
}
