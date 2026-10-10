import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Star rating display + input component.
 *
 * Per spec Section 13, 15, 31:
 *   * Accessible (keyboard, screen-reader labels)
 *   * Touch-friendly controls
 *   * Don't rely on color alone
 */

// Display-only star rating
export function StarRatingDisplay({
  rating,
  size = 16,
  className,
}: {
  rating: number;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          style={{ width: size, height: size }}
          className={cn(
            star <= Math.round(rating)
              ? "fill-featured text-featured"
              : "text-muted-foreground/40"
          )}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

// Interactive star rating input
export function StarRatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const displayValue = hover ?? value;

  return (
    <div
      className="inline-flex items-center gap-1"
      role="radiogroup"
      aria-label="Rating"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star > 1 ? "s" : ""}`}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(null)}
          disabled={disabled}
          className="p-1 rounded transition hover:bg-muted/50"
        >
          <Star
            className={cn(
              "h-7 w-7 transition",
              star <= displayValue
                ? "fill-featured text-featured"
                : "text-muted-foreground/30"
            )}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}
