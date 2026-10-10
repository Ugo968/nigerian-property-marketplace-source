import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCurrentProfile } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import { capabilitiesFor } from "@/lib/capabilities";
import { PropertyCard } from "@/components/properties/property-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import type { PropertyRow, PropertyTypeRow } from "@/types";

/**
 * /dashboard/saved — the user's saved properties.
 *
 * Per spec Section 21: view saved properties. Capability limits are
 * enforced at save-time (the toggleSavedProperty action); this page
 * shows what's already saved without re-checking limits.
 */
export default async function SavedPropertiesPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/dashboard/saved");
  }
  if (profile.account_status === "banned") {
    redirect("/account-suspended?reason=banned");
  }
  if (profile.account_status === "suspended") {
    redirect("/account-suspended?reason=suspended");
  }
  if (!profile.onboarding_completed) {
    redirect(`/onboarding/${profile.role}`);
  }

  const caps = capabilitiesFor(profile.role, profile.subscription_tier);
  const canSave = caps.maxSavedProperties !== 0;

  const supabase = await createServerClient();
  let savedItems: Array<{
    property: PropertyRow;
    propertyType: PropertyTypeRow;
    location: { state: string | null; city: string | null; area: string | null } | null;
    featuredImage: { storage_path: string } | null;
    savedAt: string;
  }> = [];

  if (supabase) {
    const { data: savedRows } = await supabase
      .from("saved_properties")
      .select("property_id, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false });

    if (savedRows && savedRows.length > 0) {
      const savedData = savedRows as Array<{ property_id: string; created_at: string }>;
      for (const row of savedData) {
        const { data: propRow } = await supabase
          .from("properties")
          .select(
            `
            *,
            property_types!inner(id, slug, label, category, is_active),
            property_locations(state, city, area)
            `,
          )
          .eq("id", row.property_id)
          .maybeSingle();
        if (!propRow) continue;
        const prop = propRow as unknown as PropertyRow & {
          property_types: PropertyTypeRow;
          property_locations: { state: string | null; city: string | null; area: string | null } | null;
        };

        const { data: featured } = await supabase
          .from("property_media")
          .select("storage_path")
          .eq("property_id", prop.id)
          .order("is_featured", { ascending: false })
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        let featuredUrl: string | null = null;
        if (featured) {
          const path = (featured as { storage_path: string }).storage_path;
          const { data: urlData } = supabase.storage
            .from("property-media")
            .getPublicUrl(path);
          featuredUrl = urlData.publicUrl;
        }

        savedItems.push({
          property: prop,
          propertyType: prop.property_types,
          location: prop.property_locations,
          featuredImage: featured ? { storage_path: featuredUrl ?? "" } : null,
          savedAt: row.created_at,
        });
      }
    }
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Saved properties</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {savedItems.length === 0
                ? "No saved properties yet."
                : `${savedItems.length} saved ${savedItems.length === 1 ? "property" : "properties"}`}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/properties">Browse properties</Link>
          </Button>
        </div>

        {!canSave ? (
          <EmptyState
            title="Saved properties unavailable"
            description={`Your ${profile.subscription_tier} plan doesn't include saved properties. Upgrade to start tracking properties you're interested in.`}
          />
        ) : savedItems.length === 0 ? (
          <EmptyState
            title="No saved properties"
            description="Tap the heart icon on any property to save it here for later."
            action={
              <Button asChild>
                <Link href="/properties">Browse properties</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {savedItems.map(({ property, propertyType, location, featuredImage }) => (
              <PropertyCard
                key={property.id}
                id={property.id}
                title={property.title}
                status={property.status}
                price={property.price}
                priceFrequency={property.price_frequency}
                currency={property.currency}
                transactionType={property.transaction_type}
                state={location?.state ?? null}
                city={location?.city ?? null}
                area={location?.area ?? null}
                imageUrl={featuredImage?.storage_path || null}
                propertyTypeLabel={propertyType.label}
                createdAt={property.created_at}
                href={`/properties/${property.id}`}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
