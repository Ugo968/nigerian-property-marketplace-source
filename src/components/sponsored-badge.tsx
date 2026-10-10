import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Sponsored" / "Featured" badge.
 *
 * Paid placements must be clearly labeled — never blend into organic
 * results. Uses the gold `featured` token to make the label obvious.
 */
export function SponsoredBadge({
  variant = "featured",
  className,
}: {
  variant?: "featured" | "sponsored";
  className?: string;
}) {
  const label = variant === "featured" ? "Featured" : "Sponsored";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        variant === "featured"
          ? "bg-featured text-featured-foreground"
          : "bg-sponsored text-sponsored-foreground",
        className,
      )}
    >
      <Star className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}
