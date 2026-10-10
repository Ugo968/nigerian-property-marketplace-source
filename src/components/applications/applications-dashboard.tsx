"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ApplicationCard } from "@/components/applications/application-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import {
  acceptApplication,
  declineApplication,
  withdrawApplication,
} from "@/lib/applications/actions";
import type { ApplicationWithRelations } from "@/lib/applications/fetchers";
import type { UserRole } from "@/types";

/**
 * Applications dashboard client — renders either the agent's submitted
 * applications or the owner's received applications based on role.
 *
 * Per spec Sections 12, 15, 29:
 *   * Role-aware: agents see "submitted", owners/companies see "received"
 *   * Actions per status (withdraw, accept, decline)
 *   * Limit-reached message with upgrade CTA
 *   * Empty state with clear next steps
 */
export interface ApplicationsDashboardProps {
  applications: ApplicationWithRelations[];
  role: UserRole;
  monthlyLimit: number | null;
  monthlyCount: number;
  upgradeHref?: string;
}

export function ApplicationsDashboard({
  applications,
  role,
  monthlyLimit,
  monthlyCount,
  upgradeHref = "/dashboard/subscription",
}: ApplicationsDashboardProps) {
  const router = useRouter();
  const [pendingActionId, setPendingActionId] = React.useState<string | null>(null);

  async function handleAction(action: "accept" | "decline" | "withdraw", applicationId: string) {
    setPendingActionId(applicationId);
    let result;
    if (action === "accept") {
      result = await acceptApplication(applicationId);
    } else if (action === "decline") {
      result = await declineApplication({ applicationId });
    } else {
      result = await withdrawApplication(applicationId);
    }
    setPendingActionId(null);
    if (!result.ok) {
      alert(result.message ?? "Action failed.");
      return;
    }
    router.refresh();
  }

  const callerRole = role === "agent" ? "agent" : "owner";
  const isAgent = role === "agent";

  // Limit check for agents
  const atLimit = isAgent && monthlyLimit !== null && monthlyCount >= monthlyLimit;

  return (
    <div className="space-y-6">
      {/* Limit info for agents */}
      {isAgent && monthlyLimit !== null ? (
        <div className={`rounded-md border p-3 text-sm ${atLimit ? "border-warning/30 bg-warning/5 text-warning" : "border-info/30 bg-info/5 text-info-foreground"}`}>
          <p>
            <span className="font-medium">{monthlyCount}</span> / {monthlyLimit} applications used this month
          </p>
          {atLimit ? (
            <p className="text-xs mt-1">
              You&apos;ve reached your monthly application limit.{" "}
              <a href={upgradeHref} className="font-medium underline">Upgrade your plan</a> for more applications.
            </p>
          ) : null}
        </div>
      ) : null}

      {applications.length === 0 ? (
        <EmptyState
          title={isAgent ? "No applications submitted" : "No applications received"}
          description={
            isAgent
              ? "Browse properties and apply to represent ones that match your expertise."
              : "When agents apply to represent your properties, they'll appear here."
          }
          action={
            isAgent ? (
              <Button asChild>
                <a href="/properties">Browse properties</a>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4">
          {applications.map((item) => (
            <ApplicationCard
              key={item.application.id}
              data={item}
              callerRole={callerRole as "agent" | "owner"}
              onAction={handleAction}
              pendingActionId={pendingActionId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
