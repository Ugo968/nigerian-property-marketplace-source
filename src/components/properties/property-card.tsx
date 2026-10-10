import * as React from "react";
import Link from "next/link";
import { Building2, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ListingStatus, PropertyRow } from "@/types";

/**
 * Property card — used in the dashboard inventory + public listings grid.
 *
 * Per spec Section 30 + 44:
 *   - Premium, trustworthy appearance
 *   - Property photography is the main visual element
 *   - Status badge clearly visible
 */
export interface PropertyCardProps {
  id: string;
  title: string;
  status: ListingStatus;
  price: number; // minor units (koko)
  priceFrequency: PropertyRow["price_frequency"];
  currency: "NGN" | "USD";
  transactionType: "rent" | "sale" | "shortlet";
  state: string | null;
  city: string | null;
  area: string | null;
  imageUrl?: string | null;
  propertyTypeLabel?: string;
  createdAt: string;
  href: string;
}

const STATUS_TONE: Record<ListingStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  available: "bg-success/10 text-success",
  application_pending: "bg-info/10 text-info",
  under_offer: "bg-warning/10 text-warning",
  rented: "bg-primary/10 text-primary",
  sold: "bg-primary/10 text-primary",
  unavailable: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/10 text-destructive",
  removed: "bg-destructive/10 text-destructive",
};

const STATUS_LABEL: Record<ListingStatus, string> = {
  draft: "Draft",
  available: "Available",
  application_pending: "Application Pending",
  under_offer: "Under Offer",
  rented: "Rented",
  sold: "Sold",
  unavailable: "Unavailable",
  suspended: "Suspended",
  removed: "Removed",
};

export function PropertyCard(props: PropertyCardProps) {
  const priceDisplay = formatPrice(props.price, props.currency);
  const priceSuffix = props.priceFrequency
    ? ` / ${props.priceFrequency.replace(/_/g, " ")}`
    : "";

  return (
    <Link
      href={props.href}
      className="block rounded-lg border bg-background overflow-hidden hover:shadow-md transition group"
    >
      <div className="relative aspect-video bg-muted">
        {props.imageUrl ? (
           
          <img
            src={props.imageUrl}
            alt={props.title}
            className="w-full h-full object-cover group-hover:scale-105 transition"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Building2 className="h-10 w-10" aria-hidden="true" />
          </div>
        )}
        <Badge
          className={cn("absolute top-2 left-2", STATUS_TONE[props.status])}
          variant="secondary"
        >
          {STATUS_LABEL[props.status]}
        </Badge>
      </div>
      <div className="p-3 space-y-1.5">
        <p className="font-medium text-foreground line-clamp-1">{props.title}</p>
        <p className="text-sm font-semibold text-primary">
          {priceDisplay}
          <span className="text-xs font-normal text-muted-foreground">{priceSuffix}</span>
        </p>
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" aria-hidden="true" />
          {[props.area, props.city, props.state].filter(Boolean).join(", ") || "Location not set"}
        </p>
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground capitalize">
            {props.transactionType} · {props.propertyTypeLabel ?? ""}
          </span>
        </div>
      </div>
    </Link>
  );
}

function formatPrice(minorUnits: number, currency: "NGN" | "USD"): string {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(minorUnits);
  } catch {
    return `${minorUnits} ${currency}`;
  }
}
