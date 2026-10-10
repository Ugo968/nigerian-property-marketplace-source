import * as React from "react";
import { cn } from "@/lib/utils";
import { APPLICATION_STATUS_LABELS } from "@/types";
import type { ApplicationStatus } from "@/types";

const STATUS_TONE: Record<ApplicationStatus, string> = {
  pending: "bg-warning/10 text-warning",
  accepted: "bg-success/10 text-success",
  declined: "bg-destructive/10 text-destructive",
  withdrawn: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  completed: "bg-primary/10 text-primary",
};

export function ApplicationStatusBadge({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_TONE[status] ?? STATUS_TONE.pending,
        className,
      )}
      role="status"
      aria-label={`Status: ${APPLICATION_STATUS_LABELS[status]}`}
    >
      {APPLICATION_STATUS_LABELS[status]}
    </span>
  );
}
