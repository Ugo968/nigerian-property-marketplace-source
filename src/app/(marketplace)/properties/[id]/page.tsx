import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, AlertTriangle } from "lucide-react";
import { PublicLayout } from "@/components/layout/public-layout";
import { SafetyNotice } from "@/components/layout/safety-notice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { VerificationBadge } from "@/components/verification-badge";
import { SponsoredBadge } from "@/components/sponsored-badge";
import { PropertyDetailMap } from "@/components/maps/property-detail-map";
import { PropertyActions } from "@/components/applications/property-actions";
import { getPublicProperty } from "@/lib/properties/public-fetcher";
import { getCurrentProfile } from "@/lib/auth/server";
import { formatNaira } from "@/lib/subscriptions/plans";
import { ReportPropertyDialog } from "@/components/properties/report-property-dialog";

const TRANSACTION_LABEL: Record<string, string> = {
  rent: "For Rent",
  sale: "For Sale",
  shortlet: "Short-let",
};

const FURNISHED_LABEL: Record<string, string> = {
  furnished: "Furnished",
  semi_furnished: "Semi-furnished",
  unfurnished: "Unfurnished",
  not_applicable: "—",
};

export default async function PublicPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await getPublicProperty(id);
  const callerProfile = await getCurrentProfile();

  if (!property) {
    return (
      <PublicLayout>
        <EmptyState
          title="Property not found"
          description="This listing doesn't exist or is no longer available."
          action={
            <Button asChild>
              <Link href="/properties">Browse properties</Link>
            </Button>
          }
        />
      </PublicLayout>
    );
  }

  const featuredImage = property.media.find((m) => m.is_featured) ?? property.media[0];
  const otherImages = property.media.filter((m) => m.id !== featuredImage?.id);

  const priceDisplay =
    property.price > 0 ? formatNaira(property.price) : "Price on request";
  const priceSuffix = property.priceFrequency
    ? ` / ${property.priceFrequency.replace(/_/g, " ")}`
    : "";

  const locationText = property.location
    ? [property.location.area, property.location.city, property.location.state]
        .filter(Boolean)
        .join(", ")
    : "Location not specified";

  return (
    <PublicLayout>
      <article className="container mx-auto px-4 py-8 space-y-6 max-w-5xl">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/properties" className="hover:underline">
            Properties
          </Link>{" "}
          /{" "}
          <span className="capitalize">{property.propertyType.label}</span>
        </nav>

        {/* Header */}
        <header className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="capitalize">
              {TRANSACTION_LABEL[property.transactionType]}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {property.propertyType.label}
            </Badge>
            {(property.status === "rented" || property.status === "sold") && (
              <SponsoredBadge variant={property.status === "rented" ? "featured" : "sponsored"} />
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {property.title}
          </h1>
          <p className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            {locationText}
            {property.location?.landmark
              ? ` · Near ${property.location.landmark}`
              : null}
          </p>
        </header>

        {/* Gallery */}
        {featuredImage ? (
          <div className="space-y-3">
            <div className="aspect-video sm:aspect-[21/9] rounded-lg overflow-hidden bg-muted">
              { }
              <img
                src={featuredImage.storage_path}
                alt={property.title}
                className="w-full h-full object-cover"
                priority
              />
            </div>
            {otherImages.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {otherImages.slice(0, 4).map((img) => (
                  <div
                    key={img.id}
                    className="aspect-video rounded-md overflow-hidden bg-muted"
                  >
                    { }
                    <img
                      src={img.storage_path}
                      alt={img.alt_text ?? property.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Price + key details */}
        <section className="grid sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2 rounded-lg border bg-background p-4 space-y-3">
            <p className="text-2xl font-bold text-primary">
              {priceDisplay}
              <span className="text-sm font-normal text-muted-foreground">
                {priceSuffix}
              </span>
            </p>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Detail label="Bedrooms" value={String(property.bedrooms)} />
              <Detail label="Bathrooms" value={String(property.bathrooms)} />
              <Detail label="Toilets" value={String(property.toilets)} />
              <Detail label="Parking" value={String(property.parkingSpaces)} />
            </dl>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm border-t pt-3">
              {property.sizeValue ? (
                <Detail
                  label="Size"
                  value={`${property.sizeValue} ${property.sizeUnit ?? ""}`.trim()}
                />
              ) : null}
              {property.yearBuilt ? (
                <Detail label="Year built" value={String(property.yearBuilt)} />
              ) : null}
              {property.floors !== null ? (
                <Detail label="Floors" value={String(property.floors)} />
              ) : null}
              <Detail
                label="Furnished"
                value={FURNISHED_LABEL[property.furnishedStatus]}
              />
            </dl>
          </div>

          {/* Listed by card */}
          <aside className="rounded-lg border bg-background p-4 space-y-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Listed by
            </p>
            <div className="flex items-center gap-3">
              {property.listedBy.avatarUrl ? (
                 
                <img
                  src={property.listedBy.avatarUrl}
                  alt={property.listedBy.fullName}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : null}
              <div>
                <p className="font-medium">
                  {property.listedBy.role === "company" && property.listedBy.companyName
                    ? property.listedBy.companyName
                    : property.listedBy.fullName}
                </p>
                <div className="flex items-center gap-2">
                  <VerificationBadge
                    state={property.listedBy.verificationState}
                    hideWhenNotBadged
                    compact
                  />
                  <span className="text-xs text-muted-foreground capitalize">
                    {property.listedBy.role}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <PropertyActions property={property} callerProfile={callerProfile} />
              <ReportPropertyDialog propertyId={property.id} />
            </div>
          </aside>
        </section>

        {/* Description */}
        {property.description ? (
          <section className="rounded-lg border bg-background p-4">
            <h2 className="text-lg font-semibold mb-2">Description</h2>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {property.description}
            </p>
          </section>
        ) : null}

        {/* Amenities */}
        {property.amenities.length > 0 ? (
          <section className="rounded-lg border bg-background p-4">
            <h2 className="text-lg font-semibold mb-3">Amenities</h2>
            <ul className="flex flex-wrap gap-2">
              {property.amenities.map((a) => (
                <li
                  key={a.id}
                  className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                >
                  {a.label}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Map */}
        <PropertyDetailMap
          publicLat={property.location?.publicLat ?? null}
          publicLng={property.location?.publicLng ?? null}
          locationText={locationText}
          landmark={property.location?.landmark}
        />

        {/* Safety warning — every public listing */}
        <SafetyNotice />

        {/* Status indicator */}
        {(property.status === "rented" || property.status === "sold") && (
          <div
            role="status"
            className="rounded-md border border-info/30 bg-info/5 p-3 text-sm text-info-foreground flex items-start gap-2"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              This property is currently marked as <strong>{property.status}</strong>.
              It may no longer be available — contact the lister to confirm.
            </span>
          </div>
        )}
      </article>
    </PublicLayout>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
