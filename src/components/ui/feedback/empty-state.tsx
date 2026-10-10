import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Empty state — shown when a list has zero items.
 *
 * Visually: centered icon + title + description + optional action.
 * Use this consistently instead of ad-hoc empty table rows.
 */
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Render compactly (no large padding) — used inside small panels. */
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center text-center gap-3",
        compact ? "py-8 px-4" : "py-16 px-6",
        className,
      )}
    >
      {icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
