"use client";

import * as React from "react";
import Link from "next/link";
import { MapPin, Building2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApplicationStatusBadge } from "./application-status-badge";
import { formatNaira } from "@/lib/subscriptions/plans";
import type { ApplicationWithRelations } from "@/lib/applications/fetchers";
import type { ApplicationStatus } from "@/types";

/**
 * Application card — used in the /dashboard/applications list.
 *
 * Per spec Section 12 + 15:
 *   * Shows property image, title, location, price
 *   * Shows applicant/decision-maker info
 *   * Shows status badge, application date, proposed terms
 *   * Actions depend on the caller's role + application status
 */

interface ApplicationCardProps {
  data: ApplicationWithRelations;
  callerRole: "agent" | "owner";
  onAction?: (action: "accept" | "decline" | "withdraw", applicationId: string) => void;
  pendingActionId?: string | null;
}

export function ApplicationCard({
  data,
  callerRole,
  onAction,
  pendingActionId,
}: ApplicationCardProps) {
  const { application, property, agent, decision_maker } = data;
  const isPending = pendingActionId === application.id;

  const priceDisplay = property.price > 0 ? formatNaira(property.price) : "Price on request";
  const priceSuffix = application.proposed_commission_pct
    ? ` · ${application.proposed_commission_pct}% proposed commission`
    : "";

  const locationText = [property.area, property.city, property.state].filter(Boolean).join(", ");

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <div className="flex gap-3 p-3">
        {/* Property image */}
        <Link href={`/properties/${property.id}`} className="shrink-0">
          {property.featured_image_url ? (
            <img
              src={property.featured_image_url}
              alt={property.title}
              className="h-20 w-20 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Building2 className="h-8 w-8" aria-hidden="true" />
            </div>
          )}
        </Link>

        <div className="flex-1 min-w-0 space-y-1">
          {/* Top row: title + status */}
          <div className="flex items-start justify-between gap-2">
            <Link href={`/properties/${property.id}`} className="flex-1 min-w-0">
              <p className="font-medium text-sm line-clamp-1 hover:underline">{property.title}</p>
            </Link>
            <ApplicationStatusBadge status={application.status as ApplicationStatus} />
          </div>

          {/* Location + price */}
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {locationText || "Location not set"}
          </p>
          <p className="text-sm font-semibold text-primary">
            {priceDisplay}
            {property.price_frequency ? ` / ${property.price_frequency.replace(/_/g, " ")}` : ""}
          </p>

          {/* Agent or owner info depending on caller role */}
          {callerRole === "owner" && agent ? (
            <div className="flex items-center gap-2 text-xs pt-1 border-t">
              <span className="text-muted-foreground">Applicant:</span>
              <Link href={`/agents/${agent.id}`} className="font-medium hover:underline">
                {agent.professional_name ?? agent.full_name}
              </Link>
              {agent.years_of_experience !== null ? (
                <span className="text-muted-foreground">
                  · {agent.years_of_experience} yrs exp
                </span>
              ) : null}
            </div>
          ) : callerRole === "agent" && decision_maker ? (
            <div className="flex items-center gap-2 text-xs pt-1 border-t">
              <span className="text-muted-foreground">Property owner:</span>
              <span className="font-medium">{decision_maker.full_name}</span>
              <span className="text-muted-foreground capitalize">· {decision_maker.role}</span>
            </div>
          ) : null}

          {/* Application date */}
          <p className="text-xs text-muted-foreground">
            Applied {new Date(application.created_at).toLocaleDateString("en-NG", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
            {application.decided_at ? (
              <span> · Decided {new Date(application.decided_at).toLocaleDateString("en-NG")}</span>
            ) : null}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 px-3 pb-3">
        <Button asChild variant="outline" size="sm">
          <Link href={`/dashboard/applications/${application.id}`}>View details</Link>
        </Button>

        {/* Agent actions */}
        {callerRole === "agent" && application.status === "pending" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAction?.("withdraw", application.id)}
            disabled={isPending}
          >
            {isPending ? "Withdrawing..." : "Withdraw"}
          </Button>
        ) : null}
        {callerRole === "agent" && application.status === "accepted" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAction?.("withdraw", application.id)}
            disabled={isPending}
          >
            {isPending ? "Withdrawing..." : "End representation"}
          </Button>
        ) : null}

        {/* Owner actions */}
        {callerRole === "owner" && application.status === "pending" ? (
          <>
            <Button
              size="sm"
              onClick={() => onAction?.("accept", application.id)}
              disabled={isPending}
            >
              {isPending ? "Processing..." : "Accept"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAction?.("decline", application.id)}
              disabled={isPending}
            >
              Decline
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
