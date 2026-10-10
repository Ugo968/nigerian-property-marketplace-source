import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCurrentProfile } from "@/lib/auth/server";
import { createServerClient } from "@/lib/db/supabase";
import { PropertyEditForm } from "@/components/properties/property-edit-form";
import { PageShell } from "@/components/layout/page-shell";
import { getPropertyTypes, getAmenities } from "@/lib/properties/reference-data";
import type { PropertyRow, PropertyLocationRow, PropertyMediaRow } from "@/types";

export default async function PropertyEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect(`/login?next=/dashboard/properties/${id}/edit`);
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
  if (!supabase) {
    redirect("/dashboard/properties");
  }

  // Fetch the property — RLS ensures the caller can only see their own
  const { data: propRow } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!propRow) {
    redirect("/dashboard/properties");
  }
  const property = propRow as PropertyRow;

  // Verify ownership (defense in depth — RLS already handles it)
  const isOwner = property.owner_profile_id === profile.id;
  const isCreator = property.listing_creator_id === profile.id;
  const isManagingAgent = property.managing_agent_id === profile.id;
  if (!isOwner && !isCreator && !isManagingAgent) {
    redirect("/dashboard/properties");
  }

  if (property.status === "removed") {
    redirect("/dashboard/properties");
  }

  // Fetch location + media + amenities
  const [propertyTypes, amenities] = await Promise.all([
    getPropertyTypes(),
    getAmenities(),
  ]);

  const { data: locRow } = await supabase
    .from("property_locations")
    .select("*")
    .eq("property_id", id)
    .maybeSingle();
  const location = locRow as PropertyLocationRow | null;

  const { data: mediaRows } = await supabase
    .from("property_media")
    .select("*")
    .eq("property_id", id)
    .order("sort_order", { ascending: true })
    .order("is_featured", { ascending: false });
  const media = (mediaRows as PropertyMediaRow[]) ?? [];

  // Convert media storage_paths to public URLs
  const mediaWithUrls = media.map((m) => {
    const { data: urlData } = supabase.storage
      .from("property-media")
      .getPublicUrl(m.storage_path);
    return { ...m, url: urlData.publicUrl };
  });

  const { data: amenityRows } = await supabase
    .from("property_amenities")
    .select("amenity_id")
    .eq("property_id", id);
  const selectedAmenityIds = ((amenityRows ?? []) as Array<{ amenity_id: string }>).map(
    (r) => r.amenity_id,
  );

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <PropertyEditForm
          property={property}
          location={location}
          media={mediaWithUrls}
          propertyTypes={propertyTypes}
          amenities={amenities}
          selectedAmenityIds={selectedAmenityIds}
          listedBy={{
            fullName: profile.full_name,
            role: profile.role,
            verificationState: profile.verification_state,
          }}
        />
      </div>
    </DashboardLayout>
  );
}
