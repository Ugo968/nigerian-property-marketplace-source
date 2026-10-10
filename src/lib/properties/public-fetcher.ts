import { createServerClient } from "@/lib/db/supabase";
import type {
  PropertyRow,
  PropertyLocationRow,
  PropertyMediaRow,
  AmenityRow,
  ProfileRow,
  LandlordProfileRow,
  AgentProfileRow,
  CompanyProfileRow,
  PropertyTypeRow,
} from "@/types";
import type { UserRole } from "@/types";
import { capabilitiesFor } from "@/lib/capabilities";
import { isPubliclyVisible } from "./status-machine";

/**
 * Public property fetcher.
 *
 * Per spec Section 26 + 32:
 *   * Returns only public-safe fields for a published property
 *   * Explicit column-select (never SELECT *)
 *   * Strips private exact address (only public_lat/lng, area, landmark exposed)
 *   * Honours capability gating for the listed-by profile's social handles
 *   * Returns null for drafts / suspended / removed / soft-deleted listings
 */

export interface PublicProperty {
  id: string;
  title: string;
  description: string | null;
  transactionType: PropertyRow["transaction_type"];
  price: number;
  priceFrequency: PropertyRow["price_frequency"];
  currency: PropertyRow["currency"];
  bedrooms: number;
  bathrooms: number;
  toilets: number;
  parkingSpaces: number;
  yearBuilt: number | null;
  floors: number | null;
  furnishedStatus: PropertyRow["furnished_status"];
  sizeValue: number | null;
  sizeUnit: PropertyRow["size_unit"];
  status: PropertyRow["status"];
  publishedAt: string | null;
  createdAt: string;
  // Type
  propertyType: Pick<PropertyTypeRow, "id" | "slug" | "label" | "category">;
  // Location (public-safe only — no private_lat/lng, no address_line)
  location: {
    country: string;
    state: string;
    city: string;
    area: string | null;
    landmark: string | null;
    publicLat: number | null;
    publicLng: number | null;
  } | null;
  // Media — only published-listing media (RLS handles this)
  media: Array<Pick<PropertyMediaRow, "id" | "media_type" | "storage_path" | "caption" | "alt_text" | "sort_order" | "is_featured">>;
  // Amenities
  amenities: Array<Pick<AmenityRow, "id" | "slug" | "label" | "category">>;
  // Listed-by info (public-safe profile fields)
  listedBy: {
    id: string;
    role: UserRole;
    fullName: string;
    avatarUrl: string | null;
    verificationState: ProfileRow["verification_state"];
    // Role-specific public fields (matches Phase 5 public-profile.ts)
    professionalName?: string | null;
    agencyName?: string | null;
    companyName?: string | null;
    companyLogoUrl?: string | null;
    officeState?: string | null;
    website?: string | null;
    socialHandles?: Record<string, string> | null;
  };
}

/**
 * Fetches a public property by id.
 *
 * Returns null when:
 *   - The property doesn't exist
 *   - The property is soft-deleted
 *   - The property's status is not publicly visible (draft / suspended / removed)
 *   - The listed-by profile is banned / soft-deleted / not onboarded
 *   - Supabase isn't configured (dev foundation fallback)
 */
export async function getPublicProperty(
  propertyId: string,
): Promise<PublicProperty | null> {
  const supabase = await createServerClient();
  if (!supabase) return null;

  // 1. Fetch the property with explicit column-select (no deleted_at / audit fields)
  const { data: propRow, error } = await supabase
    .from("properties")
    .select(
      `
      id, title, description, transaction_type, price, price_frequency, currency,
      bedrooms, bathrooms, toilets, parking_spaces, year_built, floors,
      furnished_status, size_value, size_unit, status, published_at, created_at,
      deleted_at, property_type_id,
      property_types!inner(id, slug, label, category),
      listing_creator_id
      `,
    )
    .eq("id", propertyId)
    .maybeSingle();

  if (error || !propRow) return null;

  const property = propRow as unknown as {
    id: string;
    title: string;
    description: string | null;
    transaction_type: PropertyRow["transaction_type"];
    price: number;
    price_frequency: PropertyRow["price_frequency"];
    currency: PropertyRow["currency"];
    bedrooms: number;
    bathrooms: number;
    toilets: number;
    parking_spaces: number;
    year_built: number | null;
    floors: number | null;
    furnished_status: PropertyRow["furnished_status"];
    size_value: number | null;
    size_unit: PropertyRow["size_unit"];
    status: PropertyRow["status"];
    published_at: string | null;
    created_at: string;
    deleted_at: string | null;
    property_type_id: string;
    property_types: Pick<PropertyTypeRow, "id" | "slug" | "label" | "category">;
    listing_creator_id: string;
  };

  // Hide non-public listings
  if (property.deleted_at) return null;
  if (!isPubliclyVisible(property.status)) return null;

  // 2. Fetch the location (public fields only)
  const { data: locRow } = await supabase
    .from("property_locations")
    .select("country, state, city, area, landmark, public_lat, public_lng")
    .eq("property_id", propertyId)
    .maybeSingle();
  const location = locRow as {
    country: string;
    state: string;
    city: string;
    area: string | null;
    landmark: string | null;
    public_lat: number | null;
    public_lng: number | null;
  } | null;

  // 3. Fetch media (RLS already filters to published listings)
  const { data: mediaRows } = await supabase
    .from("property_media")
    .select("id, media_type, storage_path, caption, alt_text, sort_order, is_featured")
    .eq("property_id", propertyId)
    .order("sort_order", { ascending: true })
    .order("is_featured", { ascending: false });
  const media = (mediaRows ?? []) as Array<{
    id: string;
    media_type: "image" | "video" | "floor_plan" | "document";
    storage_path: string;
    caption: string | null;
    alt_text: string | null;
    sort_order: number;
    is_featured: boolean;
  }>;

  // Convert storage paths to public URLs
  const mediaWithUrls = media.map((m) => {
    const { data: urlData } = supabase.storage
      .from("property-media")
      .getPublicUrl(m.storage_path);
    return { ...m, storage_path: urlData.publicUrl };
  });

  // 4. Fetch amenities via the join table
  const { data: amenityRows } = await supabase
    .from("property_amenities")
    .select("amenity_id, amenities!inner(id, slug, label, category)")
    .eq("property_id", propertyId);
  const amenities = ((amenityRows ?? []) as unknown as Array<{
    amenity_id: string;
    amenities: Pick<AmenityRow, "id" | "slug" | "label" | "category">;
  }>).map((row) => row.amenities);

  // 5. Fetch the listed-by profile (public-safe fields only)
  const { data: profileRow } = await supabase
    .from("profiles")
    .select(
      "id, role, full_name, avatar_url, verification_state, account_status, deleted_at, onboarding_completed, subscription_tier, user_id",
    )
    .eq("id", property.listing_creator_id)
    .maybeSingle();
  const profile = profileRow as {
    id: string;
    role: UserRole;
    full_name: string;
    avatar_url: string | null;
    verification_state: ProfileRow["verification_state"];
    account_status: ProfileRow["account_status"];
    deleted_at: string | null;
    onboarding_completed: boolean;
    subscription_tier: ProfileRow["subscription_tier"];
    user_id: string;
  } | null;

  // Hide listings by banned / soft-deleted / non-onboarded profiles
  if (!profile) return null;
  if (profile.deleted_at) return null;
  if (profile.account_status === "banned" || profile.account_status === "deactivated") {
    return null;
  }
  if (!profile.onboarding_completed) return null;

  // 6. Fetch role-specific row (public-safe fields)
  const roleTable =
    profile.role === "landlord"
      ? "landlord_profiles"
      : profile.role === "agent"
        ? "agent_profiles"
        : "company_profiles";

  const roleSelect =
    profile.role === "landlord"
      ? "ownership_summary"
      : profile.role === "agent"
        ? "professional_name, agency_name"
        : "company_name, company_logo_url, office_state, website";

  const { data: roleRow } = await supabase
    .from(roleTable)
    .select(roleSelect)
    .eq("profile_id", profile.id)
    .maybeSingle();

  // 7. Fetch the listed-by's social_handles — only if capability allows
  const caps = capabilitiesFor(profile.role, profile.subscription_tier);
  let socialHandles: Record<string, string> | null = null;
  if (caps.canShowSocialMediaHandles) {
    const { data: socialRow } = await supabase
      .from("profiles")
      .select("social_handles")
      .eq("id", profile.id)
      .maybeSingle();
    socialHandles = (socialRow as { social_handles: Record<string, string> } | null)?.social_handles ?? null;
  }

  // 8. Compose the public property object
  const listedBy: PublicProperty["listedBy"] = {
    id: profile.id,
    role: profile.role,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    verificationState: profile.verification_state,
    socialHandles,
  };

  if (profile.role === "agent" && roleRow) {
    const agent = roleRow as Pick<AgentProfileRow, "professional_name" | "agency_name">;
    listedBy.professionalName = agent.professional_name;
    listedBy.agencyName = agent.agency_name;
  } else if (profile.role === "company" && roleRow) {
    const company = roleRow as Pick<
      CompanyProfileRow,
      "company_name" | "company_logo_url" | "office_state" | "website"
    >;
    listedBy.companyName = company.company_name;
    listedBy.companyLogoUrl = company.company_logo_url;
    listedBy.officeState = company.office_state;
    listedBy.website = company.website;
  }

  return {
    id: property.id,
    title: property.title,
    description: property.description,
    transactionType: property.transaction_type,
    price: property.price,
    priceFrequency: property.price_frequency,
    currency: property.currency,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    toilets: property.toilets,
    parkingSpaces: property.parking_spaces,
    yearBuilt: property.year_built,
    floors: property.floors,
    furnishedStatus: property.furnished_status,
    sizeValue: property.size_value,
    sizeUnit: property.size_unit,
    status: property.status,
    publishedAt: property.published_at,
    createdAt: property.created_at,
    propertyType: property.property_types,
    location: location
      ? {
          country: location.country,
          state: location.state,
          city: location.city,
          area: location.area,
          landmark: location.landmark,
          publicLat: location.public_lat,
          publicLng: location.public_lng,
        }
      : null,
    media: mediaWithUrls.map((m) => ({
      id: m.id,
      media_type: m.media_type,
      storage_path: m.storage_path,
      caption: m.caption,
      alt_text: m.alt_text,
      sort_order: m.sort_order,
      is_featured: m.is_featured,
    })),
    amenities,
    listedBy,
  };
}
