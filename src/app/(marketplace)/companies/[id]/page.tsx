import Link from "next/link";
import { PublicLayout } from "@/components/layout/public-layout";
import { SafetyNotice } from "@/components/layout/safety-notice";
import { ProfileHeader } from "@/components/profiles/profile-header";
import { SocialLinks } from "@/components/profiles/social-links";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { getPublicProfile } from "@/lib/profiles/public-profile";
import { getCurrentProfile } from "@/lib/auth/server";
import { ReviewSectionClient } from "@/components/reviews/review-section-client";
import { getReviewsForProfile } from "@/lib/reviews/aggregation";
import { canCreateReview } from "@/lib/reviews/eligibility";

export default async function CompanyProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getPublicProfile(id);

  if (!profile || profile.role !== "company") {
    return (
      <PublicLayout>
        <EmptyState
          title="Company not found"
          description="This company profile doesn't exist or is no longer available."
          action={
            <Button asChild>
              <Link href="/companies">Browse companies</Link>
            </Button>
          }
        />
      </PublicLayout>
    );
  }

  const company = profile.company;

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
        <ProfileHeader
          profile={profile}
          avatarUrlOverride={company?.company_logo_url ?? undefined}
        />

        {company?.company_description ? (
          <section className="rounded-lg border bg-background p-6">
            <h2 className="text-lg font-semibold mb-2">About {company.company_name}</h2>
            <p className="text-sm text-foreground leading-relaxed">
              {company.company_description}
            </p>
          </section>
        ) : null}

        {company ? (
          <section className="rounded-lg border bg-background p-6 space-y-3">
            <h2 className="text-lg font-semibold">Business information</h2>
            <dl className="grid sm:grid-cols-2 gap-4 text-sm">
              {company.office_state ? (
                <div>
                  <dt className="text-muted-foreground">Office state</dt>
                  <dd className="font-medium">{company.office_state}</dd>
                </div>
              ) : null}
              {company.office_lga ? (
                <div>
                  <dt className="text-muted-foreground">Office LGA</dt>
                  <dd className="font-medium">{company.office_lga}</dd>
                </div>
              ) : null}
              {company.website ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Website</dt>
                  <dd>
                    <a
                      href={company.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-primary hover:underline"
                    >
                      {company.website}
                    </a>
                  </dd>
                </div>
              ) : null}
              {company.cac_registered && company.cac_registration_number ? (
                <div>
                  <dt className="text-muted-foreground">CAC registration</dt>
                  <dd className="font-medium">
                    {company.cac_registration_number}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        {profile.canShowSocialHandles && profile.socialHandles ? (
          <section className="rounded-lg border bg-background p-6">
            <h2 className="text-lg font-semibold mb-3">Connect</h2>
            <SocialLinks handles={profile.socialHandles} />
          </section>
        ) : null}

        <ReviewSectionClient
          revieweeId={profile.id}
          revieweeName={company?.company_name ?? profile.fullName}
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
