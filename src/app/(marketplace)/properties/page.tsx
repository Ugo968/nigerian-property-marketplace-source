import { PublicLayout } from "@/components/layout/public-layout";
import { PropertySearchPage } from "@/components/search/property-search-page";
import { createServerClient } from "@/lib/db/supabase";
import { getCurrentProfile } from "@/lib/auth/server";
import { parseSearchParams, type SearchParams } from "@/lib/search/params";
import { searchProperties } from "@/lib/search/query-builder";
import { getPropertyTypes, getAmenities } from "@/lib/properties/reference-data";
import { ErrorState } from "@/components/ui/feedback";
import type { Metadata } from "next";

/**
 * /properties — public property discovery page.
 *
 * Per spec Section 4: search, filters, sort, results, pagination, empty/error states.
 *
 * Server Component — does the actual search server-side, then hands the
 * initial results to the client component for interactivity.
 */

export const metadata: Metadata = {
  title: "Browse Properties",
  description:
    "Search properties for rent, sale, and short-let across Nigeria. Filter by location, price, type, and amenities on Shelty.",
  openGraph: {
    title: "Browse Properties — Shelty",
    description:
      "Search properties for rent, sale, and short-let across Nigeria.",
  },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PropertiesPage({ searchParams }: PageProps) {
  const rawParams = await searchParams;
  const filters: SearchParams = parseSearchParams(rawParams);

  // Fetch reference data (property types + amenities)
  const [propertyTypes, amenities] = await Promise.all([
    getPropertyTypes(),
    getAmenities(),
  ]);

  // Fetch the caller's profile (to mark saved properties)
  const callerProfile = await getCurrentProfile();
  const callerProfileId = callerProfile?.id ?? null;
  const callerSignedIn = Boolean(callerProfile);

  // Execute the search
  const supabase = await createServerClient();

  let results = [];
  let total = 0;
  let page = filters.page ?? 1;
  let pageSize = filters.pageSize ?? 12;
  let hasMore = false;
  let searchError: string | null = null;

  if (supabase) {
    try {
      const response = await searchProperties(supabase, filters, callerProfileId);
      results = response.results;
      total = response.total;
      page = response.page;
      pageSize = response.pageSize;
      hasMore = response.hasMore;
    } catch (err) {
      searchError = err instanceof Error ? err.message : "Search failed.";
    }
  }

  return (
    <PublicLayout>
      {searchError ? (
        <div className="container mx-auto px-4 py-8">
          <ErrorState
            title="Search temporarily unavailable"
            description="We couldn't load property results. Please try again."
          />
        </div>
      ) : (
        <PropertySearchPage
          initialResults={results}
          total={total}
          page={page}
          pageSize={pageSize}
          hasMore={hasMore}
          filters={filters}
          propertyTypes={propertyTypes}
          amenities={amenities}
          callerSignedIn={callerSignedIn}
        />
      )}
    </PublicLayout>
  );
}
