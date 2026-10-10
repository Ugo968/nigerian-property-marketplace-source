import * as React from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TrustIndicators } from "./trust-indicators";
import { ContactActions } from "./contact-actions";
import type { PublicProfile } from "@/lib/profiles/public-profile";
import { ROLE_LABELS } from "@/types";

/**
 * Profile header — shared across the public profile pages.
 *
 * Per spec Section 5:
 *   - Photo/logo
 *   - Name
 *   - Role
 *   - Verification badge (in TrustIndicators)
 *   - Short description (bio)
 *   - Location
 *   - Contact/action controls
 */
export interface ProfileHeaderProps {
  profile: PublicProfile;
  /** Optional active listings count for the trust indicators row. */
  activeListings?: number;
  /** Optional rating (only shown when reviews exist). */
  rating?: number | null;
  reviewCount?: number;
  /** Optional caller-supplied avatar URL override (for company logo). */
  avatarUrlOverride?: string;
  className?: string;
}

export function ProfileHeader({
  profile,
  activeListings = 0,
  rating,
  reviewCount = 0,
  avatarUrlOverride,
  className,
}: ProfileHeaderProps) {
  const displayName =
    profile.role === "company" && profile.company?.company_name
      ? profile.company.company_name
      : profile.fullName;

  const avatarUrl = avatarUrlOverride ?? profile.avatarUrl;
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  // Location display
  const location = computeLocation(profile);

  return (
    <header
      className={cn(
        "rounded-lg border bg-background p-6 space-y-4",
        className,
      )}
    >
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <Avatar className="h-20 w-20 sm:h-24 sm:w-24 shrink-0">
          <AvatarImage
            src={avatarUrl ?? undefined}
            alt={displayName}
          />
          <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
            {initials || "?"}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {displayName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {ROLE_LABELS[profile.role]}
            </p>
          </div>

          <TrustIndicators
            profile={profile}
            activeListings={activeListings}
            rating={rating}
            reviewCount={reviewCount}
          />

          {profile.bio ? (
            <p className="text-sm text-foreground max-w-prose">
              {profile.bio}
            </p>
          ) : null}

          {location ? (
            <p className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {location}
            </p>
          ) : null}
        </div>

        <ContactActions profile={profile} />
      </div>
    </header>
  );
}

function computeLocation(profile: PublicProfile): string | null {
  if (profile.role === "company" && profile.company) {
    const parts = [profile.company.office_state, profile.company.office_lga].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  // For landlord / agent, areas_served is the primary "location" display
  if (profile.areasServed && profile.areasServed.length > 0) {
    return profile.areasServed.slice(0, 3).join(", ");
  }
  return null;
}
