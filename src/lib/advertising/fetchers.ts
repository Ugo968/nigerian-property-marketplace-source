import { createServerClient, createAdminClient } from "@/lib/db/supabase";
import { getCurrentUser } from "@/lib/auth/server";
import type { CampaignStatus } from "./config";

/**
 * Advertising fetchers — used by Server Components.
 *
 * Per spec Sections 10, 16, 21, 23, 24, 29:
 *   * Advertiser dashboard: own businesses + campaigns
 *   * Public: eligible campaigns + approved businesses
 *   * Business profile page
 *   * Ownership resolved server-side
 */

export interface AdvertiserBusiness {
  id: string;
  business_name: string;
  category_id: string;
  category_label: string;
  category_slug: string;
  contact_email: string;
  contact_phone: string | null;
  website: string | null;
  description: string | null;
  logo_url: string | null;
  address: string | null;
  state: string | null;
  city: string | null;
  status: string;
  created_at: string;
}

export interface AdvertiserCampaign {
  id: string;
  business_id: string;
  business_name: string;
  name: string;
  status: CampaignStatus;
  placement_label: string;
  budget_naira: number;
  spent_naira: number;
  impressions: number;
  clicks: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

/**
 * Returns the caller's advertising businesses.
 */
export async function getMyBusinesses(): Promise<AdvertiserBusiness[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();
  if (!supabase) return [];

  const { data: bizRows } = await supabase
    .from("advertising_businesses")
    .select(`
      id, business_name, category_id, contact_email, contact_phone,
      website, description, logo_url, address, state, city, status, created_at,
      advertiser_categories!inner(slug, label)
    `)
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false });

  if (!bizRows) return [];

  return (bizRows as Array<{
    id: string;
    business_name: string;
    category_id: string;
    contact_email: string;
    contact_phone: string | null;
    website: string | null;
    description: string | null;
    logo_url: string | null;
    address: string | null;
    state: string | null;
    city: string | null;
    status: string;
    created_at: string;
    advertiser_categories: { slug: string; label: string };
  }>).map((row) => ({
    id: row.id,
    business_name: row.business_name,
    category_id: row.category_id,
    category_label: row.advertiser_categories.label,
    category_slug: row.advertiser_categories.slug,
    contact_email: row.contact_email,
    contact_phone: row.contact_phone,
    website: row.website,
    description: row.description,
    logo_url: row.logo_url,
    address: row.address,
    state: row.state,
    city: row.city,
    status: row.status,
    created_at: row.created_at,
  }));
}

/**
 * Returns campaigns for the caller's businesses.
 */
export async function getMyCampaigns(): Promise<AdvertiserCampaign[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = createAdminClient();
  if (!supabase) return [];

  const { data: campRows } = await supabase
    .from("advertising_campaigns")
    .select(`
      id, business_id, name, status, budget_naira, spent_naira,
      impressions, clicks, starts_at, ends_at, created_at,
      advertising_businesses!inner(business_name, owner_user_id),
      advertising_placements!inner(label)
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!campRows) return [];

  return (campRows as Array<{
    id: string;
    business_id: string;
    name: string;
    status: string;
    budget_naira: number;
    spent_naira: number;
    impressions: number;
    clicks: number;
    starts_at: string | null;
    ends_at: string | null;
    created_at: string;
    advertising_businesses: { business_name: string; owner_user_id: string };
    advertising_placements: { label: string };
  }>)
    .filter((row) => row.advertising_businesses.owner_user_id === user.id)
    .map((row) => ({
      id: row.id,
      business_id: row.business_id,
      business_name: row.advertising_businesses.business_name,
      name: row.name,
      status: row.status as CampaignStatus,
      placement_label: row.advertising_placements.label,
      budget_naira: row.budget_naira / 100, // kobo → naira
      spent_naira: row.spent_naira / 100,
      impressions: row.impressions,
      clicks: row.clicks,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      created_at: row.created_at,
    }));
}

/**
 * Returns a public business profile by ID.
 * Per spec Section 23: public business profile page.
 * Only approved businesses are publicly visible.
 */
export async function getPublicBusiness(businessId: string) {
  const supabase = await createServerClient();
  if (!supabase) return null;

  const { data: bizRow } = await supabase
    .from("advertising_businesses")
    .select(`
      id, business_name, contact_email, contact_phone, website,
      description, logo_url, address, state, city,
      advertiser_categories!inner(slug, label)
    `)
    .eq("id", businessId)
    .eq("status", "approved")
    .maybeSingle();

  if (!bizRow) return null;

  const biz = bizRow as {
    id: string;
    business_name: string;
    contact_email: string;
    contact_phone: string | null;
    website: string | null;
    description: string | null;
    logo_url: string | null;
    address: string | null;
    state: string | null;
    city: string | null;
    advertiser_categories: { slug: string; label: string };
  };

  return {
    id: biz.id,
    businessName: biz.business_name,
    category: biz.advertiser_categories.label,
    categorySlug: biz.advertiser_categories.slug,
    contactEmail: biz.contact_email,
    contactPhone: biz.contact_phone,
    website: biz.website,
    description: biz.description,
    logoUrl: biz.logo_url,
    address: biz.address,
    state: biz.state,
    city: biz.city,
  };
}

/**
 * Returns eligible campaigns for public serving (spec Section 16).
 * Only active campaigns with approved businesses + valid dates.
 */
export async function getEligibleCampaigns(placementSlug: string, limit: number = 5) {
  const supabase = await createServerClient();
  if (!supabase) return [];

  const now = new Date().toISOString();

  const { data: campRows } = await supabase
    .from("advertising_campaigns")
    .select(`
      id, name, budget_naira, spent_naira,
      advertising_businesses!inner(id, business_name, logo_url, description, status, website, category_id, state, city),
      advertising_placements!inner(slug),
      advertising_creatives(headline, body_text, cta_text, target_url, storage_path)
    `)
    .eq("status", "active")
    .eq("advertising_businesses.status", "approved")
    .eq("advertising_placements.slug", placementSlug)
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .lt("spent_naira", supabase.raw("budget_naira"))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!campRows) return [];

  const campaigns = campRows as Array<{
    id: string;
    name: string;
    budget_naira: number;
    spent_naira: number;
    advertising_businesses: {
      id: string;
      business_name: string;
      logo_url: string | null;
      description: string | null;
      status: string;
      website: string | null;
      category_id: string;
      state: string | null;
      city: string | null;
    };
    advertising_creatives: {
      headline: string | null;
      body_text: string | null;
      cta_text: string | null;
      target_url: string;
      storage_path: string | null;
    } | null;
  }>;

  // Build creative URLs
  return campaigns.map((camp) => {
    let creativeUrl: string | null = null;
    if (camp.advertising_creatives?.storage_path) {
      const { data: urlData } = supabase.storage
        .from("advertising-creatives")
        .getPublicUrl(camp.advertising_creatives.storage_path);
      creativeUrl = urlData.publicUrl;
    }

    return {
      id: camp.id,
      campaignName: camp.name,
      businessId: camp.advertising_businesses.id,
      businessName: camp.advertising_businesses.business_name,
      logoUrl: camp.advertising_businesses.logo_url,
      description: camp.advertising_businesses.description,
      website: camp.advertising_businesses.website,
      state: camp.advertising_businesses.state,
      city: camp.advertising_businesses.city,
      creative: camp.advertising_creatives ? {
        headline: camp.advertising_creatives.headline,
        bodyText: camp.advertising_creatives.body_text,
        ctaText: camp.advertising_creatives.cta_text,
        targetUrl: camp.advertising_creatives.target_url,
        imageUrl: creativeUrl,
      } : null,
    };
  });
}
