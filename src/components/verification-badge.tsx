import * as React from "react";
import { Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  VERIFICATION_STATE_LABELS,
  type VerificationState,
  verificationBadgeToken,
} from "@/types";

/**
 * Verification badge.
 *
 * Bronze and Blue are publicly displayed. Other states (pending,
 * rejected, suspended, revoked) render as a smaller muted label OR
 * render nothing at all if `hideWhenNotBadged` is true.
 */
export interface VerificationBadgeProps {
  state: VerificationState;
  /** Hide entirely when the state is not a public badge (bronze / blue). */
  hideWhenNotBadged?: boolean;
  /** Render a smaller compact badge (icon only). */
  compact?: boolean;
  className?: string;
}

const TONE_BY_BADGE: Record<
  "bronze" | "blue",
  { bg: string; fg: string; ring: string; Icon: React.ElementType }
> = {
  bronze: {
    bg: "bg-verification-bronze/10",
    fg: "text-verification-bronze",
    ring: "ring-verification-bronze/30",
    Icon: ShieldCheck,
  },
  blue: {
    bg: "bg-verification-blue/10",
    fg: "text-verification-blue",
    ring: "ring-verification-blue/30",
    Icon: Check,
  },
};

export function VerificationBadge({
  state,
  hideWhenNotBadged = false,
  compact = false,
  className,
}: VerificationBadgeProps) {
  const badgeToken = verificationBadgeToken(state);
  if (!badgeToken) {
    if (hideWhenNotBadged) return null;
    if (state === "unverified") return null;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
          "bg-muted text-muted-foreground",
          className,
        )}
      >
        {VERIFICATION_STATE_LABELS[state]}
      </span>
    );
  }

  const tone = TONE_BY_BADGE[badgeToken];
  const Icon = tone.Icon;

  if (compact) {
    return (
      <span
        title={VERIFICATION_STATE_LABELS[state]}
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-full ring-1",
          tone.bg,
          tone.fg,
          tone.ring,
          className,
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">{VERIFICATION_STATE_LABELS[state]}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1",
        tone.bg,
        tone.fg,
        tone.ring,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {VERIFICATION_STATE_LABELS[state]}
    </span>
  );
}
