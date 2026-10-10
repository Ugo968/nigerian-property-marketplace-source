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
 * /dashboard/properties — the user's property inventory.
 *
 * Per spec Section 30:
 *   - Property image, title, type, transaction type, price, status,
 *     location, created/updated date, action menu
 *   - Only show actions valid for the property's current state
 */
export default async function DashboardPropertiesPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/dashboard/properties");
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

  const supabase = await createServerClient();
  let properties: Array<{
    property: PropertyRow;
    propertyType: PropertyTypeRow;
    location: { state: string | null; city: string | null; area: string | null } | null;
    featuredImage: { storage_path: string } | null;
  }> = [];

  if (supabase) {
    // Fetch properties the caller owns, created, or manages (RLS handles authz)
    const { data: propRows } = await supabase
      .from("properties")
      .select(
        `
        *,
        property_types!inner(id, slug, label, category, is_active),
        property_locations(state, city, area)
        `,
      )
      .or(
        `owner_profile_id.eq.${profile.id},listing_creator_id.eq.${profile.id},managing_agent_id.eq.${profile.id}`,
      )
      .order("created_at", { ascending: false });

    if (propRows) {
      // For each property, fetch the featured image URL
      for (const row of propRows) {
        const prop = row as unknown as PropertyRow & {
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
        properties.push({
          property: prop,
          propertyType: prop.property_types,
          location: prop.property_locations,
          featuredImage: featured ? { storage_path: featuredUrl ?? "" } : null,
        });
      }
    }
  }

  const caps = capabilitiesFor(profile.role, profile.subscription_tier);
  const canCreateListings = (caps.maxListingsPerMonth ?? 0) > 0;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Your properties</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {properties.length === 0
                ? "No listings yet."
                : `${properties.length} listing${properties.length === 1 ? "" : "s"}`}
            </p>
          </div>
          {canCreateListings ? (
            <Button asChild>
              <Link href="/dashboard/properties/new">+ New listing</Link>
            </Button>
          ) : null}
        </div>

        {properties.length === 0 ? (
          <EmptyState
            title={canCreateListings ? "No properties yet" : "Cannot create listings"}
            description={
              canCreateListings
                ? "Create your first listing to start receiving inquiries."
                : profile.role === "agent"
                  ? "Agents apply to represent existing listings — they don't create their own."
                  : "Your plan does not allow creating listings. Upgrade your subscription."
            }
            action={
              canCreateListings ? (
                <Button asChild>
                  <Link href="/dashboard/properties/new">Create listing</Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map(({ property, propertyType, location, featuredImage }) => (
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
                href={
                  property.status === "draft"
                    ? `/dashboard/properties/${property.id}/edit`
                    : `/dashboard/properties/${property.id}/edit`
                }
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
