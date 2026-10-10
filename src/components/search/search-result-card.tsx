import Link from "next/link";
import { MapPin, Bed, Bath, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SavePropertyButton } from "@/components/properties/save-property-button";
import { VerificationBadge } from "@/components/verification-badge";
import type { SearchResult } from "@/lib/search/query-builder";
import { formatNaira } from "@/lib/subscriptions/plans";

/**
 * Search result card — used in the /properties grid.
 *
 * Per spec Section 16:
 *   * Primary property image
 *   * Property title
 *   * Price + frequency
 *   * Property type + transaction type
 *   * Location
 *   * Beds/baths (where relevant)
 *   * Key amenities (where available)
 *   * Verification/trust indicators
 *   * Save/heart button
 *   * Listing status badge (where relevant)
 */
export interface SearchResultCardProps {
  result: SearchResult;
  className?: string;
}

const TRANSACTION_LABEL: Record<string, string> = {
  rent: "For Rent",
  sale: "For Sale",
  shortlet: "Short-let",
};

export function SearchResultCard({ result, className }: SearchResultCardProps) {
  const priceDisplay = result.price > 0 ? formatNaira(result.price) : "Price on request";
  const priceSuffix = result.price_frequency
    ? ` / ${result.price_frequency.replace(/_/g, " ")}`
    : "";

  const locationText = [result.area, result.city, result.state]
    .filter(Boolean)
    .join(", ");

  const showBedBath = !["land", "industrial"].includes(result.property_type_category);

  return (
    <article
      className={cn(
        "relative rounded-lg border bg-background overflow-hidden hover:shadow-md transition group",
        className,
      )}
    >
      <Link href={`/properties/${result.id}`} className="block">
        <div className="relative aspect-video bg-muted">
          {result.featured_image_url ? (
             
            <img
              src={result.featured_image_url}
              alt={result.title}
              className="w-full h-full object-cover group-hover:scale-105 transition"
              loading="lazy"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <Building2 className="h-10 w-10" aria-hidden="true" />
            </div>
          )}
          <Badge
            className="absolute top-2 left-2"
            variant="secondary"
          >
            {TRANSACTION_LABEL[result.transaction_type] ?? result.transaction_type}
          </Badge>
          {(result.status === "rented" || result.status === "sold") && (
            <Badge
              className="absolute top-2 left-2 ml-20"
              variant="outline"
            >
              {result.status === "rented" ? "Rented" : "Sold"}
            </Badge>
          )}
        </div>
      </Link>
      <div className="absolute top-2 right-2">
        <SavePropertyButton
          propertyId={result.id}
          isSavedInitially={result.is_saved}
          variant="icon"
        />
      </div>
      <div className="p-3 space-y-1.5">
        <Link href={`/properties/${result.id}`} className="block">
          <p className="font-medium text-foreground line-clamp-1 hover:underline">
            {result.title}
          </p>
        </Link>
        <p className="text-sm font-semibold text-primary">
          {priceDisplay}
          <span className="text-xs font-normal text-muted-foreground">{priceSuffix}</span>
        </p>
        {locationText ? (
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {locationText}
          </p>
        ) : null}
        {showBedBath ? (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {result.bedrooms > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Bed className="h-3 w-3" aria-hidden="true" />
                {result.bedrooms} Bed{result.bedrooms === 1 ? "" : "s"}
              </span>
            ) : null}
            {result.bathrooms > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Bath className="h-3 w-3" aria-hidden="true" />
                {result.bathrooms} Bath{result.bathrooms === 1 ? "" : "s"}
              </span>
            ) : null}
            <span className="text-muted-foreground/70">
              {result.property_type_label}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{result.property_type_label}</p>
        )}
        {result.listed_by_name ? (
          <div className="flex items-center gap-1.5 pt-1 border-t">
            <span className="text-xs text-muted-foreground truncate">
              by {result.listed_by_name}
            </span>
            <VerificationBadge
              state={result.listed_by_verification as never}
              hideWhenNotBadged
              compact
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}
