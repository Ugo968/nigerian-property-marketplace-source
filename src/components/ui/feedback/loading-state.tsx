import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Loading state — placeholder for a section while data is fetching.
 *
 * Accepts `lines` to render skeleton rows (good for lists and tables)
 * or `lines={0}` + `children` for free-form content.
 */
export interface LoadingStateProps {
  /** Number of skeleton rows to render. Defaults to 3. */
  lines?: number;
  className?: string;
  /** Optional free-form skeleton content (overrides lines). */
  children?: React.ReactNode;
}

export function LoadingState({
  lines = 3,
  className,
  children,
}: LoadingStateProps) {
  if (children) {
    return (
      <div
        role="status"
        aria-busy="true"
        className={cn("animate-pulse", className)}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className={cn("space-y-3 animate-pulse", className)}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 rounded bg-muted"
          style={{ width: `${[90, 70, 80, 60][i % 4]}%` }}
        />
      ))}
    </div>
  );
}
