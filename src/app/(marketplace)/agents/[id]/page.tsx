import Link from "next/link";
import { Building2 } from "lucide-react";
import { redirect } from "next/navigation";
import { PublicLayout } from "@/components/layout/public-layout";
import { SafetyNotice } from "@/components/layout/safety-notice";
import { ProfileHeader } from "@/components/profiles/profile-header";
import { SocialLinks } from "@/components/profiles/social-links";
import { Button } from "@/components/ui/button";
import { getPublicProfile } from "@/lib/profiles/public-profile";
import { getCurrentProfile } from "@/lib/auth/server";
import { EmptyState } from "@/components/ui/feedback";
import { ReviewSectionClient } from "@/components/reviews/review-section-client";
import { getReviewsForProfile } from "@/lib/reviews/aggregation";
import { canCreateReview } from "@/lib/reviews/eligibility";

/**
 * Public agent profile page.
 * Server Component — fetches the public profile (public fields only)
 * and renders the layout. No sensitive fields are exposed.
 */
export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getPublicProfile(id);

  if (!profile || profile.role !== "agent") {
    return (
      <PublicLayout>
        <EmptyState
          title="Agent not found"
          description="This agent profile doesn't exist or is no longer available."
          action={
            <Button asChild>
              <Link href="/agents">Browse agents</Link>
            </Button>
          }
        />
      </PublicLayout>
    );
  }

  const agent = profile.agent;
  const professionalName = agent?.professional_name ?? profile.fullName;

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

        {agent ? (
          <section className="rounded-lg border bg-background p-6 space-y-3">
            <h2 className="text-lg font-semibold">Professional information</h2>
            <dl className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Professional name</dt>
                <dd className="font-medium">{professionalName}</dd>
              </div>
              {typeof agent.years_of_experience === "number" ? (
                <div>
                  <dt className="text-muted-foreground">Experience</dt>
                  <dd className="font-medium">
                    {agent.years_of_experience}{" "}
                    {agent.years_of_experience === 1 ? "year" : "years"}
                  </dd>
                </div>
              ) : null}
              {agent.agency_name ? (
                <div>
                  <dt className="text-muted-foreground">Agency</dt>
                  <dd className="font-medium">{agent.agency_name}</dd>
                </div>
              ) : null}
              {agent.license_issuing_body ? (
                <div>
                  <dt className="text-muted-foreground">License issuing body</dt>
                  <dd className="font-medium">{agent.license_issuing_body}</dd>
                </div>
              ) : null}
              {agent.portfolio_url ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Portfolio</dt>
                  <dd>
                    <a
                      href={agent.portfolio_url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-primary hover:underline"
                    >
                      {agent.portfolio_url}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        {profile.areasServed && profile.areasServed.length > 0 ? (
          <section className="rounded-lg border bg-background p-6">
            <h2 className="text-lg font-semibold mb-2">Areas served</h2>
            <div className="flex flex-wrap gap-2">
              {profile.areasServed.map((area) => (
                <span
                  key={area}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                >
                  <Building2 className="h-3 w-3" aria-hidden="true" />
                  {area}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {profile.canShowSocialHandles && profile.socialHandles ? (
          <section className="rounded-lg border bg-background p-6">
            <h2 className="text-lg font-semibold mb-3">Connect</h2>
            <SocialLinks handles={profile.socialHandles} />
          </section>
        ) : null}

        {/* Reviews — real reputation system */}
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
