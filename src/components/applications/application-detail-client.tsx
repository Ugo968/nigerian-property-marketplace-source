"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import {
  acceptApplication,
  declineApplication,
  withdrawApplication,
} from "@/lib/applications/actions";
import type { ApplicationStatus } from "@/types";

/**
 * Application detail client — action buttons for the detail page.
 *
 * Per spec Sections 14, 17, 21:
 *   * Agents can withdraw pending/accepted applications
 *   * Owners can accept/decline pending applications
 *   * Actions only shown for valid statuses
 */
export function ApplicationDetailClient({
  applicationId,
  status,
  callerRole,
}: {
  applicationId: string;
  status: ApplicationStatus;
  callerRole: "agent" | "owner";
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleAction(action: "accept" | "decline" | "withdraw") {
    setPending(true);
    let result;
    if (action === "accept") {
      result = await acceptApplication(applicationId);
    } else if (action === "decline") {
      result = await declineApplication({ applicationId });
    } else {
      result = await withdrawApplication(applicationId);
    }
    setPending(false);
    if (!result.ok) {
      alert(result.message ?? "Action failed.");
      return;
    }
    router.refresh();
  }

  // No actions for terminal states
  if (status === "declined" || status === "withdrawn" || status === "expired" || status === "completed") {
    return null;
  }

  return (
    <div className="flex items-center gap-2 pt-2">
      {pending ? <Spinner /> : null}

      {/* Agent actions */}
      {callerRole === "agent" && (status === "pending" || status === "accepted") ? (
        <Button
          variant="outline"
          onClick={() => handleAction("withdraw")}
          disabled={pending}
        >
          {status === "accepted" ? "End representation" : "Withdraw application"}
        </Button>
      ) : null}

      {/* Owner actions */}
      {callerRole === "owner" && status === "pending" ? (
        <>
          <Button onClick={() => handleAction("accept")} disabled={pending}>
            Accept
          </Button>
          <Button
            variant="outline"
            onClick={() => handleAction("decline")}
            disabled={pending}
          >
            Decline
          </Button>
        </>
      ) : null}
    </div>
  );
}
