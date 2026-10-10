import Link from "next/link";
import { PublicLayout } from "@/components/layout/public-layout";
import { SafetyNotice } from "@/components/layout/safety-notice";
import { ProfileHeader } from "@/components/profiles/profile-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { getPublicProfile } from "@/lib/profiles/public-profile";
import { getCurrentProfile } from "@/lib/auth/server";
import { ReviewSectionClient } from "@/components/reviews/review-section-client";
import { getReviewsForProfile } from "@/lib/reviews/aggregation";
import { canCreateReview } from "@/lib/reviews/eligibility";

export default async function LandlordProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getPublicProfile(id);

  if (!profile || profile.role !== "landlord") {
    return (
      <PublicLayout>
        <EmptyState
          title="Profile not found"
          description="This landlord profile doesn't exist or is no longer available."
          action={
            <Button asChild>
              <Link href="/properties">Browse properties</Link>
            </Button>
          }
        />
      </PublicLayout>
    );
  }

  const landlord = profile.landlord;

  // Fetch reviews + eligibility (parallel)
  const [reviewsData, eligibility, callerProfile] = await Promise.all([
    getReviewsForProfile(profile.id),
    canCreateReview(profile.id),
    getCurrentProfile(),
  ]);
  const callerSignedIn = Boolean(callerProfile);

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-8 space-y-6 max-w-5xl">
        <ProfileHeader profile={profile} />

        {profile.bio ? (
          <section className="rounded-lg border bg-background p-6">
            <h2 className="text-lg font-semibold mb-2">About</h2>
            <p className="text-sm text-foreground leading-relaxed">
              {profile.bio}
            </p>
          </section>
        ) : null}

        {landlord?.ownership_summary ? (
          <section className="rounded-lg border bg-background p-6">
            <h2 className="text-lg font-semibold mb-2">Property ownership</h2>
            <p className="text-sm text-foreground leading-relaxed">
              {landlord.ownership_summary}
            </p>
          </section>
        ) : null}

        <ReviewSectionClient
          revieweeId={profile.id}
          revieweeName={profile.fullName}
          initialReviews={reviewsData.reviews}
          initialAggregate={reviewsData.aggregate}
          initialHasMore={reviewsData.hasMore}
          canReview={eligibility.canReview}
          qualifyingInteraction={eligibility.qualifyingInteraction}
          callerSignedIn={callerSignedIn}
        />

        <SafetyNotice />
      </div>
    </PublicLayout>
  );
}
