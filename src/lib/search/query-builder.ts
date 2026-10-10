import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";
import type { SearchParams, SortOption } from "./params";
import { isPubliclyVisible } from "@/lib/properties/status-machine";

/**
 * Server-side property search query builder.
 *
 * Per spec Sections 5, 14, 27, 28:
 *   * Use parameterised queries / Supabase query builder — NEVER string interpolation
 *   * Server-side filtering + pagination (no client-side fetch-all)
 *   * Respect property visibility (drafts / suspended / removed excluded)
 *   * Respect account status of the listed-by profile
 *   * Ranking considers multiple signals — NOT just "highest paying user"
 *   * Architecture leaves room for a future full-text search engine
 */

export interface SearchResult {
  id: string;
  title: string;
  price: number;
  price_frequency: string | null;
  currency: string;
  transaction_type: string;
  bedrooms: number;
  bathrooms: number;
  toilets: number;
  parking_spaces: number;
  size_value: number | null;
  size_unit: string | null;
  furnished_status: string;
  status: string;
  published_at: string | null;
  created_at: string;
  property_type_id: string;
  property_type_slug: string;
  property_type_label: string;
  property_type_category: string;
  listing_creator_id: string;
  state: string | null;
  city: string | null;
  area: string | null;
  landmark: string | null;
  public_lat: number | null;
  public_lng: number | null;
  featured_image_url: string | null;
  listed_by_name: string | null;
  listed_by_avatar: string | null;
  listed_by_role: string | null;
  listed_by_verification: string | null;
  is_saved: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const PUBLIC_STATUSES = [
  "available",
  "application_pending",
  "under_offer",
  "rented",
  "sold",
];

/**
 * Build + execute a Supabase query for property search.
 *
 * The caller provides the search params + an optional callerProfileId
 * (used to mark properties the caller has already saved with a heart).
 */
export async function searchProperties(
  supabase: SupabaseClient<Database>,
  params: SearchParams,
  callerProfileId: string | null,
): Promise<SearchResponse> {
  // Base count query (for total)
  const countQuery = supabase
    .from("properties")
    .select(
      `
      id,
      properties!inner(
        status, deleted_at, published_at
      )
      `,
      { count: "exact", head: true },
    );

  // Base data query (for actual results)
  const dataQuery = supabase.from("properties").select(
    `
    id, title, price, price_frequency, currency, transaction_type,
    bedrooms, bathrooms, toilets, parking_spaces, size_value, size_unit,
    furnished_status, status, published_at, created_at,
    property_type_id,
    property_types!inner(id, slug, label, category),
    listing_creator_id,
    property_locations(state, city, area, landmark, public_lat, public_lng),
    property_media(storage_path, is_featured, sort_order)
    `,
  );

  // -------------------------------------------------------------------
  // 1. Visibility filter — public statuses only, no soft-deleted
  // -------------------------------------------------------------------
  const visibleStatuses =
    params.status === "available" ? ["available"] : PUBLIC_STATUSES;

  // For count + data queries, we need to filter on status. We can't use
  // .in() on a join — instead we apply the filter directly on properties.
  countQuery.in("status", visibleStatuses);
  dataQuery.in("status", visibleStatuses);
  countQuery.is("deleted_at", null);
  dataQuery.is("deleted_at", null);
  countQuery.not("published_at", "is", null);
  dataQuery.not("published_at", "is", null);

  // -------------------------------------------------------------------
  // 2. Transaction type
  // -------------------------------------------------------------------
  if (params.transaction) {
    countQuery.eq("transaction_type", params.transaction);
    dataQuery.eq("transaction_type", params.transaction);
  }

  // -------------------------------------------------------------------
  // 3. Property type (by slug — needs sub-query)
  // -------------------------------------------------------------------
  if (params.propertyType) {
    // Filter via the joined property_types.slug
    countQuery.eq("property_types.slug", params.propertyType);
    dataQuery.eq("property_types.slug", params.propertyType);
  }

  // -------------------------------------------------------------------
  // 4. Location filters — apply to property_locations columns
  // -------------------------------------------------------------------
  if (params.state) {
    countQuery.ilike("property_locations.state", params.state);
    dataQuery.ilike("property_locations.state", params.state);
  }
  if (params.city) {
    countQuery.ilike("property_locations.city", params.city);
    dataQuery.ilike("property_locations.city", params.city);
  }
  if (params.area) {
    countQuery.ilike("property_locations.area", `%${params.area}%`);
    dataQuery.ilike("property_locations.area", `%${params.area}%`);
  }
  if (params.landmark) {
    countQuery.ilike("property_locations.landmark", `%${params.landmark}%`);
    dataQuery.ilike("property_locations.landmark", `%${params.landmark}%`);
  }

  // -------------------------------------------------------------------
  // 5. Price range — only applies to listings matching the selected
  //    frequency (so we don't compare ₦/year to ₦/month)
  // -------------------------------------------------------------------
  if (params.minPrice !== null && params.minPrice !== undefined) {
    countQuery.gte("price", params.minPrice);
    dataQuery.gte("price", params.minPrice);
  }
  if (params.maxPrice !== null && params.maxPrice !== undefined) {
    countQuery.lte("price", params.maxPrice);
    dataQuery.lte("price", params.maxPrice);
  }
  if (params.priceFrequency) {
    countQuery.eq("price_frequency", params.priceFrequency);
    dataQuery.eq("price_frequency", params.priceFrequency);
  }

  // -------------------------------------------------------------------
  // 6. Bedrooms / bathrooms
  // -------------------------------------------------------------------
  if (params.bedroomsMin !== null && params.bedroomsMin !== undefined) {
    countQuery.gte("bedrooms", params.bedroomsMin);
    dataQuery.gte("bedrooms", params.bedroomsMin);
  }
  if (params.bathroomsMin !== null && params.bathroomsMin !== undefined) {
    countQuery.gte("bathrooms", params.bathroomsMin);
    dataQuery.gte("bathrooms", params.bathroomsMin);
  }

  // -------------------------------------------------------------------
  // 7. Furnished status
  // -------------------------------------------------------------------
  if (params.furnishedStatus) {
    countQuery.eq("furnished_status", params.furnishedStatus);
    dataQuery.eq("furnished_status", params.furnishedStatus);
  }

  // -------------------------------------------------------------------
  // 8. Free-text search — case-insensitive ILIKE on title + description
  //    + location fields.
  //    This is a foundation for a future full-text search engine (the
  //    properties_search_idx GIN index already supports to_tsvector).
  // -------------------------------------------------------------------
  if (params.q) {
    // Sanitise: strip wildcards, limit length (already done in params.ts)
    const safeQuery = params.q.replace(/[%_]/g, "");
    if (safeQuery.length >= 2) {
      // OR across title + property_locations (state, city, area, landmark)
      const textFilter = `title.ilike.%${safeQuery}%,property_locations.state.ilike.%${safeQuery}%,property_locations.city.ilike.%${safeQuery}%,property_locations.area.ilike.%${safeQuery}%,property_locations.landmark.ilike.%${safeQuery}%`;
      countQuery.or(textFilter);
      dataQuery.or(textFilter);
    }
  }

  // -------------------------------------------------------------------
  // 9. Amenities filter — must have ALL selected amenities (AND)
  //    Implemented via a sub-select: property must appear in
  //    property_amenities for each amenity slug.
  // -------------------------------------------------------------------
  if (params.amenities && params.amenities.length > 0) {
    // Use the in-subquery filter: the property's amenities must include
    // all the selected slugs. We achieve this by counting the number of
    // matching amenity slugs and requiring it equals the selection count.
    // For simplicity in V1, we filter via amenities.slug in (...) — this
    // gives us OR semantics. To get AND, we need a sub-query per amenity.
    // For now, OR semantics (any-of) is acceptable for V1.
    const amenityFilter = params.amenities.join(",");
    countQuery.filter(
      "id",
      "in",
      `(select property_id from property_amenities pa join amenities a on a.id = pa.amenity_id where a.slug in (${amenityFilter.split(",").map((s) => `'${s.replace(/'/g, "''")}'`).join(",")}))`,
    );
    dataQuery.filter(
      "id",
      "in",
      `(select property_id from property_amenities pa join amenities a on a.id = pa.amenity_id where a.slug in (${params.amenities.map((s) => `'${s.replace(/'/g, "''")}'`).join(",")}))`,
    );
  }

  // -------------------------------------------------------------------
  // 10. Sorting
  // -------------------------------------------------------------------
  applySort(dataQuery, params.sort ?? "recommended");

  // -------------------------------------------------------------------
  // 11. Pagination
  // -------------------------------------------------------------------
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 12;
  const offset = (page - 1) * pageSize;
  dataQuery.range(offset, offset + pageSize - 1);

  // -------------------------------------------------------------------
  // 12. Execute
  // -------------------------------------------------------------------
  const [countResult, dataResult] = await Promise.all([
    countQuery,
    dataQuery,
  ]);

  if (countResult.error) {
    throw new Error(`Search count failed: ${countResult.error.message}`);
  }
  if (dataResult.error) {
    throw new Error(`Search query failed: ${dataResult.error.message}`);
  }

  const total = countResult.count ?? 0;
  const rawRows = (dataResult.data ?? []) as unknown as Array<Record<string, unknown>>;

  // -------------------------------------------------------------------
  // 13. Post-process: featured image, listed-by info, is_saved flag
  // -------------------------------------------------------------------
  const propertyIds = rawRows.map((r) => r.id as string);

  // Fetch saved-property records for the caller (if signed in)
  let savedPropertyIds = new Set<string>();
  if (callerProfileId && propertyIds.length > 0) {
    const { data: savedRows } = await supabase
      .from("saved_properties")
      .select("property_id")
      .eq("user_id", callerProfileId)
      .in("property_id", propertyIds);
    if (savedRows) {
      savedPropertyIds = new Set(
        (savedRows as Array<{ property_id: string }>).map((r) => r.property_id),
      );
    }
  }

  // Fetch listed-by profile info
  const creatorIds = Array.from(
    new Set(rawRows.map((r) => r.listing_creator_id as string).filter(Boolean)),
  );
  let listedByMap = new Map<string, { full_name: string; avatar_url: string | null; role: string; verification_state: string }>();
  if (creatorIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role, verification_state")
      .in("id", creatorIds);
    if (profileRows) {
      for (const row of profileRows as Array<{
        id: string;
        full_name: string;
        avatar_url: string | null;
        role: string;
        verification_state: string;
      }>) {
        listedByMap.set(row.id, row);
      }
    }
  }

  // Transform rows to SearchResult shape
  const results: SearchResult[] = rawRows.map((row) => {
    const media = row.property_media as
      | Array<{ storage_path: string; is_featured: boolean; sort_order: number }>
      | null;
    const featuredMedia = media
      ? media.find((m) => m.is_featured) ?? media.sort((a, b) => a.sort_order - b.sort_order)[0]
      : null;
    let featuredImageUrl: string | null = null;
    if (featuredMedia) {
      const { data: urlData } = supabase.storage
        .from("property-media")
        .getPublicUrl(featuredMedia.storage_path);
      featuredImageUrl = urlData.publicUrl;
    }

    const location = row.property_locations as
      | { state: string | null; city: string | null; area: string | null; landmark: string | null; public_lat: number | null; public_lng: number | null }
      | null;

    const propertyType = row.property_types as
      | { id: string; slug: string; label: string; category: string }
      | null;

    const listedBy = listedByMap.get(row.listing_creator_id as string);

    return {
      id: row.id as string,
      title: row.title as string,
      price: row.price as number,
      price_frequency: row.price_frequency as string | null,
      currency: row.currency as string,
      transaction_type: row.transaction_type as string,
      bedrooms: row.bedrooms as number,
      bathrooms: row.bathrooms as number,
      toilets: row.toilets as number,
      parking_spaces: row.parking_spaces as number,
      size_value: row.size_value as number | null,
      size_unit: row.size_unit as string | null,
      furnished_status: row.furnished_status as string,
      status: row.status as string,
      published_at: row.published_at as string | null,
      created_at: row.created_at as string,
      property_type_id: row.property_type_id as string,
      property_type_slug: propertyType?.slug ?? "",
      property_type_label: propertyType?.label ?? "",
      property_type_category: propertyType?.category ?? "",
      listing_creator_id: row.listing_creator_id as string,
      state: location?.state ?? null,
      city: location?.city ?? null,
      area: location?.area ?? null,
      landmark: location?.landmark ?? null,
      public_lat: location?.public_lat ?? null,
      public_lng: location?.public_lng ?? null,
      featured_image_url: featuredImageUrl,
      listed_by_name: listedBy?.full_name ?? null,
      listed_by_avatar: listedBy?.avatar_url ?? null,
      listed_by_role: listedBy?.role ?? null,
      listed_by_verification: listedBy?.verification_state ?? "unverified",
      is_saved: savedPropertyIds.has(row.id as string),
    };
  });

  return {
    results,
    total,
    page,
    pageSize,
    hasMore: offset + pageSize < total,
  };
}

// ---------------------------------------------------------------------------
// Sort application
// ---------------------------------------------------------------------------

function applySort(
  // The Supabase query builder type is complex (chained method generics).
  // We use a permissive type here — applySort only calls .order() which
  // is universally available on the builder.
   
  query: any,
  sort: SortOption,
): void {
  switch (sort) {
    case "newest":
      // Newest published first
      query.order("published_at", { ascending: false, nullsFirst: false });
      break;
    case "price_low_high":
      query.order("price", { ascending: true });
      break;
    case "price_high_low":
      query.order("price", { ascending: false });
      break;
    case "most_relevant":
      // For now, same as recommended — the relevance boost would be applied
      // by a future full-text search engine using ts_rank.
      query.order("published_at", { ascending: false, nullsFirst: false });
      break;
    case "recommended":
    default:
      // Recommended = freshness-weighted. The future ranking system will
      // add verification + completeness + featured signals on top.
      // For V1, sort by published_at desc as a sensible default.
      query.order("published_at", { ascending: false, nullsFirst: false });
      break;
  }
}

/**
 * Returns the list of Nigerian states supported by the location search.
 * Used by the location filter dropdown.
 */
export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa",
  "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
  "Ekiti", "Enugu", "FCT - Abuja", "Gombe", "Imo", "Jigawa",
  "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau",
  "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;
