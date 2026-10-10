import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Error state — shown when a non-recoverable error occurred loading a
 * list / page / section.
 *
 * Visually similar to EmptyState but uses error color and an alert
 * icon to make the failure obvious. Hides raw error text from users
 * (it's logged server-side instead).
 */
export interface ErrorStateProps {
  title?: string;
  description?: string;
  /** Optional retry action. */
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't complete this action. Please try again.",
  action,
  className,
  compact = false,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center text-center gap-3",
        compact ? "py-8 px-4" : "py-16 px-6",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          {description}
        </p>
      </div>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
