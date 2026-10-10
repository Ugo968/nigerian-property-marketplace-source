import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCurrentProfile } from "@/lib/auth/server";
import { getApplicationById } from "@/lib/applications/fetchers";
import { ApplicationStatusBadge } from "@/components/applications/application-status-badge";
import { ApplicationDetailClient } from "@/components/applications/application-detail-client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { VerificationBadge } from "@/components/verification-badge";
import { formatNaira } from "@/lib/subscriptions/plans";

/**
 * /dashboard/applications/[id] — application detail + actions.
 *
 * Per spec Section 13:
 *   * Property details (title, image, location, price, transaction type)
 *   * Application details (date, message, proposed terms, additional info)
 *   * Status + representation explanation if accepted
 *   * Actions: withdraw (agent), accept/decline (owner)
 */
export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect(`/login?next=/dashboard/applications/${id}`);
  }

  const application = await getApplicationById(id);

  if (!application) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-3xl mx-auto">
          <EmptyState
            title="Application not found"
            description="This application doesn't exist or you don't have permission to view it."
            action={
              <Button asChild>
                <Link href="/dashboard/applications">Back to applications</Link>
              </Button>
            }
          />
        </div>
      </DashboardLayout>
    );
  }

  const { application: app, property, agent, decision_maker } = application;
  const isAgent = app.agent_id === profile.id;
  const isOwner = app.decision_maker_id === profile.id;

  const priceDisplay = property.price > 0 ? formatNaira(property.price) : "Price on request";
  const priceSuffix = property.price_frequency
    ? ` / ${property.price_frequency.replace(/_/g, " ")}`
    : "";

  const locationText = [property.area, property.city, property.state]
    .filter(Boolean)
    .join(", ");

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Back link */}
        <Link
          href="/dashboard/applications"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to applications
        </Link>

        {/* Property summary */}
        <div className="rounded-lg border bg-background overflow-hidden">
          <div className="flex gap-4 p-4">
            {property.featured_image_url ? (
              <img
                src={property.featured_image_url}
                alt={property.title}
                className="h-24 w-24 rounded-md object-cover shrink-0"
              />
            ) : null}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <Link href={`/properties/${property.id}`} className="font-medium hover:underline">
                  {property.title}
                </Link>
                <ApplicationStatusBadge status={app.status} />
              </div>
              <p className="text-sm font-semibold text-primary">
                {priceDisplay}
                <span className="text-xs font-normal text-muted-foreground">{priceSuffix}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {locationText || "Location not set"}
              </p>
              <p className="text-xs text-muted-foreground">
                {property.transaction_type} · {property.property_type_label}
              </p>
            </div>
          </div>
        </div>

        {/* Application details */}
        <div className="rounded-lg border bg-background p-4 space-y-3">
          <h2 className="text-lg font-semibold">Application details</h2>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Date submitted</p>
              <p className="font-medium">
                {new Date(app.created_at).toLocaleDateString("en-NG", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            {app.decided_at ? (
              <div>
                <p className="text-xs text-muted-foreground">Decision date</p>
                <p className="font-medium">
                  {new Date(app.decided_at).toLocaleDateString("en-NG")}
                </p>
              </div>
            ) : null}
            {app.proposed_commission_pct ? (
              <div>
                <p className="text-xs text-muted-foreground">Proposed commission</p>
                <p className="font-medium">{app.proposed_commission_pct}%</p>
              </div>
            ) : null}
          </div>

          {app.application_message ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Message</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {app.application_message}
              </p>
            </div>
          ) : null}

          {app.decision_reason ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Decision reason</p>
              <p className="text-sm text-foreground">{app.decision_reason}</p>
            </div>
          ) : null}
        </div>

        {/* Parties */}
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Agent */}
          {agent ? (
            <div className="rounded-lg border bg-background p-4 space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">Agent</p>
              <div className="flex items-center gap-3">
                {agent.avatar_url ? (
                  <img
                    src={agent.avatar_url}
                    alt={agent.full_name}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : null}
                <div>
                  <Link
                    href={`/agents/${agent.id}`}
                    className="font-medium text-sm hover:underline"
                  >
                    {agent.professional_name ?? agent.full_name}
                  </Link>
                  <div className="flex items-center gap-2">
                    <VerificationBadge
                      state={agent.verification_state as never}
                      hideWhenNotBadged
                      compact
                    />
                    {agent.years_of_experience !== null ? (
                      <span className="text-xs text-muted-foreground">
                        {agent.years_of_experience} yrs exp
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Decision maker */}
          {decision_maker ? (
            <div className="rounded-lg border bg-background p-4 space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {isAgent ? "Property owner" : "You (decision maker)"}
              </p>
              <div className="flex items-center gap-3">
                {decision_maker.avatar_url ? (
                  <img
                    src={decision_maker.avatar_url}
                    alt={decision_maker.full_name}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : null}
                <div>
                  <p className="font-medium text-sm">{decision_maker.full_name}</p>
                  <span className="text-xs text-muted-foreground capitalize">
                    {decision_maker.role}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Representation explanation if accepted */}
        {app.status === "accepted" ? (
          <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
            <p className="font-medium">Representation established</p>
            <p className="text-muted-foreground mt-1">
              The agent is now authorised to represent this property. This does
              NOT mean the property has been rented or sold, or that any
              transaction has been completed.
            </p>
          </div>
        ) : null}

        {/* Actions */}
        <ApplicationDetailClient
          applicationId={app.id}
          status={app.status}
          callerRole={isAgent ? "agent" : "owner"}
        />
      </div>
    </DashboardLayout>
  );
}
