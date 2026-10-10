import Link from "next/link";
import { Building2, Globe, MapPin, Mail, Phone, ExternalLink } from "lucide-react";
import { PublicLayout } from "@/components/layout/public-layout";
import { SafetyNotice } from "@/components/layout/safety-notice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { getPublicBusiness } from "@/lib/advertising/fetchers";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const business = await getPublicBusiness(id);
  if (!business) {
    return { title: "Business not found" };
  }
  return {
    title: `${business.businessName} — ${business.category}`,
    description: business.description ?? `${business.businessName} — ${business.category} in ${business.city ?? "Nigeria"}`,
    openGraph: {
      title: business.businessName,
      description: business.description ?? undefined,
    },
  };
}

export default async function BusinessProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const business = await getPublicBusiness(id);

  if (!business) {
    return (
      <PublicLayout>
        <EmptyState
          title="Business not found"
          description="This business profile doesn't exist or is not publicly available."
        />
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-8 space-y-6 max-w-3xl">
        {/* Header */}
        <header className="rounded-lg border bg-background p-6 space-y-4">
          <div className="flex items-start gap-4">
            {business.logoUrl ? (
              <img src={business.logoUrl} alt={business.businessName} className="h-16 w-16 rounded-lg object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Building2 className="h-8 w-8" aria-hidden="true" />
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold tracking-tight">{business.businessName}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">{business.category}</Badge>
                <Badge variant="outline">Sponsored</Badge>
              </div>
              {business.state ? (
                <p className="inline-flex items-center gap-1 text-sm text-muted-foreground mt-2">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  {[business.city, business.state].filter(Boolean).join(", ")}
                </p>
              ) : null}
            </div>
          </div>
        </header>

        {/* Description */}
        {business.description ? (
          <section className="rounded-lg border bg-background p-6">
            <h2 className="text-lg font-semibold mb-2">About</h2>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {business.description}
            </p>
          </section>
        ) : null}

        {/* Contact */}
        <section className="rounded-lg border bg-background p-6 space-y-2">
          <h2 className="text-lg font-semibold mb-2">Contact</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {business.contactPhone ? (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span>{business.contactPhone}</span>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span>{business.contactEmail}</span>
            </div>
            {business.website ? (
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <a href={business.website} target="_blank" rel="noopener noreferrer nofollow" className="text-primary hover:underline">
                  {business.website}
                </a>
              </div>
            ) : null}
          </div>
          {business.website ? (
            <Button asChild className="mt-2">
              <a href={business.website} target="_blank" rel="noopener noreferrer nofollow">
                <ExternalLink className="h-4 w-4 mr-1" aria-hidden="true" />
                Visit website
              </a>
            </Button>
          ) : null}
        </section>

        {/* Safety notice */}
        <SafetyNotice />

        {/* Advertising disclaimer */}
        <div className="rounded-md border border-info/30 bg-info/5 p-3 text-xs text-info-foreground">
          <p>
            This is a sponsored business listing. Shelty does not endorse or verify
            the services offered. Always conduct your own due diligence before
            engaging any service provider.
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
