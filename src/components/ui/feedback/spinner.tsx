import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight spinner. Use inside buttons or wherever space is tight.
 */
export function Spinner({
  className,
  "aria-label": ariaLabel = "Loading",
  size = 16,
}: {
  className?: string;
  "aria-label"?: string;
  size?: number;
}) {
  return (
    <Loader2
      role="status"
      aria-label={ariaLabel}
      className={cn("animate-spin", className)}
      style={{ width: size, height: size }}
    />
  );
}
