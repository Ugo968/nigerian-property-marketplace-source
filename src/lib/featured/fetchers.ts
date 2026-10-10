import { createServerClient } from "@/lib/db/supabase";
import { getCurrentProfile } from "@/lib/auth/server";

/**
 * Featured listing fetchers — used by Server Components.
 *
 * Per spec Sections 25, 34:
 *   * Users see their own promotions + credit history
 *   * Public sees only active featured listings
 */

export interface UserPromotion {
  id: string;
  property_id: string;
  property_title: string;
  placement: string;
  status: string;
  starts_at: string;
  ends_at: string;
  impressions: number;
  clicks: number;
  created_at: string;
}

export interface CreditTransaction {
  id: string;
  amount: number;
  transaction_type: string;
  source: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface UserCredits {
  balance: number;
  transactions: CreditTransaction[];
}

/**
 * Returns the caller's promotions (active, scheduled, completed, cancelled).
 */
export async function getUserPromotions(): Promise<UserPromotion[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = await createServerClient();
  if (!supabase) return [];

  const { data: promoRows } = await supabase
    .from("featured_listings")
    .select(`
      id, property_id, placement, status, starts_at, ends_at,
      impressions, clicks, created_at,
      properties!inner(title)
    `)
    .eq("purchaser_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!promoRows) return [];

  return (promoRows as Array<{
    id: string;
    property_id: string;
    placement: string;
    status: string;
    starts_at: string;
    ends_at: string;
    impressions: number;
    clicks: number;
    created_at: string;
    properties: { title: string };
  }>).map((row) => ({
    id: row.id,
    property_id: row.property_id,
    property_title: row.properties.title,
    placement: row.placement,
    status: row.status,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    impressions: row.impressions,
    clicks: row.clicks,
    created_at: row.created_at,
  }));
}

/**
 * Returns the caller's credit balance + transaction history.
 */
export async function getUserCredits(): Promise<UserCredits> {
  const profile = await getCurrentProfile();
  if (!profile) return { balance: 0, transactions: [] };

  const supabase = await createServerClient();
  if (!supabase) return { balance: 0, transactions: [] };

  // Fetch credit rows
  const { data: creditRows } = await supabase
    .from("featured_listing_credits")
    .select("remaining, expires_at")
    .eq("user_id", profile.id)
    .gt("remaining", 0);

  const now = new Date().toISOString();
  const balance = (creditRows ?? [])
    .filter((c: { expires_at: string | null }) => !c.expires_at || c.expires_at > now)
    .reduce((sum: number, c: { remaining: number }) => sum + c.remaining, 0);

  // Fetch transaction history (append-only ledger)
  const { data: txnRows } = await supabase
    .from("featured_credit_transactions")
    .select("id, amount, transaction_type, source, created_at, metadata")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const transactions: CreditTransaction[] = (txnRows ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    amount: row.amount as number,
    transaction_type: row.transaction_type as string,
    source: row.source as string,
    created_at: row.created_at as string,
    metadata: row.metadata as Record<string, unknown>,
  }));

  return { balance, transactions };
}

/**
 * Returns active featured listing IDs for a given placement + optional property IDs.
 * Used by the search query builder to boost featured properties in results.
 *
 * Per spec Section 20: "Featured properties can receive controlled visibility/ranking benefits."
 * Per spec Section 21: "Hard filters always win" — this just returns IDs;
 * the search query still applies all filters.
 */
export async function getActiveFeaturedPropertyIds(
  placement: string,
  propertyIds?: string[],
): Promise<Set<string>> {
  const supabase = await createServerClient();
  if (!supabase) return new Set();

  const now = new Date().toISOString();

  let query = supabase
    .from("featured_listings")
    .select("property_id")
    .eq("placement", placement)
    .eq("status", "active")
    .lte("starts_at", now)
    .gt("ends_at", now);

  if (propertyIds && propertyIds.length > 0) {
    query = query.in("property_id", propertyIds);
  }

  const { data } = await query;

  return new Set((data ?? []).map((r: { property_id: string }) => r.property_id));
}

/**
 * Returns active homepage featured listings for the homepage section.
 * Per spec Section 22: "show only eligible active promotions"
 * Per spec Section 22: "maintain reasonable rotation"
 */
export async function getHomepageFeaturedListings(limit: number = 6) {
  const supabase = await createServerClient();
  if (!supabase) return [];

  const now = new Date().toISOString();

  const { data: featuredRows } = await supabase
    .from("featured_listings")
    .select(`
      id, property_id,
      properties!inner(
        id, title, price, price_frequency, currency, transaction_type,
        bedrooms, bathrooms, status, published_at, deleted_at,
        property_types!inner(label),
        property_locations(state, city, area)
      )
    `)
    .eq("placement", "homepage")
    .eq("status", "active")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!featuredRows) return [];

  // Fetch featured images for each property
  const results = [];
  for (const row of featuredRows as Array<{
    id: string;
    property_id: string;
    properties: {
      id: string;
      title: string;
      price: number;
      price_frequency: string | null;
      currency: string;
      transaction_type: string;
      bedrooms: number;
      bathrooms: number;
      status: string;
      published_at: string | null;
      deleted_at: string | null;
      property_types: { label: string };
      property_locations: { state: string | null; city: string | null; area: string | null } | null;
    };
  }>) {
    const prop = row.properties;
    if (prop.deleted_at || !prop.published_at) continue;

    // Get featured image
    const { data: media } = await supabase
      .from("property_media")
      .select("storage_path")
      .eq("property_id", prop.id)
      .order("is_featured", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    let imageUrl: string | null = null;
    if (media) {
      const path = (media as { storage_path: string }).storage_path;
      const { data: urlData } = supabase.storage.from("property-media").getPublicUrl(path);
      imageUrl = urlData.publicUrl;
    }

    results.push({
      id: prop.id,
      title: prop.title,
      price: prop.price,
      price_frequency: prop.price_frequency,
      currency: prop.currency,
      transaction_type: prop.transaction_type,
      bedrooms: prop.bedrooms,
      bathrooms: prop.bathrooms,
      property_type_label: prop.property_types.label,
      state: prop.property_locations?.state ?? null,
      city: prop.property_locations?.city ?? null,
      area: prop.property_locations?.area ?? null,
      featured_image_url: imageUrl,
    });
  }

  return results;
}
