import * as React from "react";
import { BadgeCheck, Mail, Phone, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { VerificationBadge } from "@/components/verification-badge";
import type { PublicProfile } from "@/lib/profiles/public-profile";

/**
 * Trust indicators — reusable row of badges + status chips.
 *
 * Per spec Section 25:
 *   * Never show a trust indicator unless the underlying condition is
 *     actually true.
 *   * No generic green checkmarks that imply more than they mean.
 *
 * Each indicator has its own visual treatment so users can distinguish
 * "Bronze Verified" from "Email verified" — they mean different things.
 */

export interface TrustIndicatorsProps {
  profile: Pick<
    PublicProfile,
    | "verificationState"
    | "createdAt"
    | "accountStatus"
    | "canShowSocialHandles"
  >;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  activeListings?: number;
  rating?: number | null;
  reviewCount?: number;
  className?: string;
}

export function TrustIndicators({
  profile,
  emailVerified,
  phoneVerified,
  activeListings = 0,
  rating,
  reviewCount = 0,
  className,
}: TrustIndicatorsProps) {
  // Member since — formatted Nigerian-friendly: "Member since Jan 2026"
  const memberSince = formatMemberSince(profile.createdAt);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <VerificationBadge state={profile.verificationState} hideWhenNotBadged />

      {emailVerified ? (
        <Chip icon={<Mail className="h-3 w-3" aria-hidden="true" />} label="Email verified" tone="info" />
      ) : null}

      {phoneVerified ? (
        <Chip icon={<Phone className="h-3 w-3" aria-hidden="true" />} label="Phone verified" tone="info" />
      ) : null}

      <Chip
        icon={<CalendarClock className="h-3 w-3" aria-hidden="true" />}
        label={memberSince}
        tone="muted"
      />

      {activeListings > 0 ? (
        <Chip
          icon={<BadgeCheck className="h-3 w-3" aria-hidden="true" />}
          label={`${activeListings} active ${activeListings === 1 ? "listing" : "listings"}`}
          tone="muted"
        />
      ) : null}

      {/* Ratings — only show when there ARE reviews. NEVER fabricate. */}
      {typeof rating === "number" && reviewCount > 0 ? (
        <Chip
          label={`${rating.toFixed(1)} ★ (${reviewCount})`}
          tone="default"
        />
      ) : null}
    </div>
  );
}

function formatMemberSince(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    const month = d.toLocaleString("en-NG", { month: "short" });
    return `Member since ${month} ${d.getFullYear()}`;
  } catch {
    return "Verified member";
  }
}

function Chip({
  icon,
  label,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  tone?: "default" | "muted" | "info" | "success";
}) {
  const cls: Record<string, string> = {
    default: "bg-muted text-muted-foreground",
    muted: "bg-muted text-muted-foreground",
    info: "bg-info/10 text-info",
    success: "bg-success/10 text-success",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        cls[tone ?? "default"],
      )}
    >
      {icon}
      {label}
    </span>
  );
}
