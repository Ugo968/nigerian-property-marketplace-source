import { createServerClient } from "@/lib/db/supabase";
import { getCurrentProfile } from "@/lib/auth/server";
import type { PropertyApplicationRow, ProfileRow, PropertyRow, PropertyTypeRow } from "@/types";

/**
 * Application fetchers — used by Server Components to load application data.
 *
 * Per spec Sections 12, 13, 15, 16, 35, 37:
 *   * Agents see only their own submitted applications
 *   * Owners see only applications for their properties
 *   * Application data (messages, proposed terms) is private
 *   * Public users never see application data
 */

export interface ApplicationWithRelations {
  application: PropertyApplicationRow;
  property: {
    id: string;
    title: string;
    status: PropertyRow["status"];
    price: number;
    price_frequency: string | null;
    currency: string;
    transaction_type: string;
    property_type_label: string;
    state: string | null;
    city: string | null;
    area: string | null;
    featured_image_url: string | null;
  };
  agent?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    verification_state: string;
    professional_name: string | null;
    agency_name: string | null;
    years_of_experience: number | null;
  };
  decision_maker?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    verification_state: string;
    role: string;
  };
}

/**
 * Returns applications submitted BY the caller (agent view).
 * Per spec Section 12: agent dashboard shows submitted applications.
 */
export async function getAgentApplications(): Promise<ApplicationWithRelations[]> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "agent") return [];

  const supabase = await createServerClient();
  if (!supabase) return [];

  const { data: apps } = await supabase
    .from("property_applications")
    .select("*")
    .eq("agent_id", profile.id)
    .order("created_at", { ascending: false });

  if (!apps || apps.length === 0) return [];

  // Fetch related properties + agent profile + decision maker
  return enrichApplications(apps as PropertyApplicationRow[], supabase);
}

/**
 * Returns applications received BY the caller (owner/company view).
 * Per spec Section 15: owner dashboard shows received applications.
 */
export async function getOwnerApplications(): Promise<ApplicationWithRelations[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];
  if (profile.role !== "landlord" && profile.role !== "company") return [];

  const supabase = await createServerClient();
  if (!supabase) return [];

  const { data: apps } = await supabase
    .from("property_applications")
    .select("*")
    .eq("decision_maker_id", profile.id)
    .order("created_at", { ascending: false });

  if (!apps || apps.length === 0) return [];

  return enrichApplications(apps as PropertyApplicationRow[], supabase);
}

/**
 * Returns a single application by ID. Verifies that the caller is
 * authorized to view it (either the agent who submitted it or the
 * decision maker who received it).
 */
export async function getApplicationById(
  applicationId: string,
): Promise<ApplicationWithRelations | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createServerClient();
  if (!supabase) return null;

  const { data: appRow } = await supabase
    .from("property_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();

  if (!appRow) return null;

  const app = appRow as PropertyApplicationRow;

  // Authorization: caller must be the agent OR the decision maker
  if (app.agent_id !== profile.id && app.decision_maker_id !== profile.id) {
    return null;
  }

  const enriched = await enrichApplications([app], supabase);
  return enriched[0] ?? null;
}

// ---------------------------------------------------------------------------
// Helper: enrich applications with property + agent + decision-maker info
// ---------------------------------------------------------------------------

async function enrichApplications(
  apps: PropertyApplicationRow[],
  supabase: NonNullable<Awaited<ReturnType<typeof createServerClient>>>,
): Promise<ApplicationWithRelations[]> {
  // Collect all unique IDs
  const propertyIds = Array.from(new Set(apps.map((a) => a.property_id)));
  const agentIds = Array.from(new Set(apps.map((a) => a.agent_id)));
  const decisionMakerIds = Array.from(new Set(apps.map((a) => a.decision_maker_id)));

  // Fetch properties with featured images
  const propertyMap = new Map<string, ApplicationWithRelations["property"]>();
  for (const propId of propertyIds) {
    const { data: propRow } = await supabase
      .from("properties")
      .select(`
        id, title, status, price, price_frequency, currency, transaction_type,
        property_types!inner(label),
        property_locations(state, city, area)
      `)
      .eq("id", propId)
      .maybeSingle();

    if (propRow) {
      const prop = propRow as unknown as {
        id: string;
        title: string;
        status: string;
        price: number;
        price_frequency: string | null;
        currency: string;
        transaction_type: string;
        property_types: { label: string };
        property_locations: { state: string | null; city: string | null; area: string | null } | null;
      };

      // Fetch featured image
      const { data: featured } = await supabase
        .from("property_media")
        .select("storage_path")
        .eq("property_id", propId)
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

      propertyMap.set(propId, {
        id: prop.id,
        title: prop.title,
        status: prop.status as PropertyRow["status"],
        price: prop.price,
        price_frequency: prop.price_frequency,
        currency: prop.currency,
        transaction_type: prop.transaction_type,
        property_type_label: prop.property_types.label,
        state: prop.property_locations?.state ?? null,
        city: prop.property_locations?.city ?? null,
        area: prop.property_locations?.area ?? null,
        featured_image_url: featuredUrl,
      });
    }
  }

  // Fetch agent profiles
  const agentMap = new Map<string, ApplicationWithRelations["agent"]>();
  if (agentIds.length > 0) {
    const { data: agentRows } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, verification_state, role")
      .in("id", agentIds);
    if (agentRows) {
      for (const row of agentRows as Array<{
        id: string;
        full_name: string;
        avatar_url: string | null;
        verification_state: string;
        role: string;
      }>) {
        // Fetch agent-specific profile
        const { data: agentProfile } = await supabase
          .from("agent_profiles")
          .select("professional_name, agency_name, years_of_experience")
          .eq("profile_id", row.id)
          .maybeSingle();
        const ap = agentProfile as {
          professional_name: string | null;
          agency_name: string | null;
          years_of_experience: number | null;
        } | null;
        agentMap.set(row.id, {
          id: row.id,
          full_name: row.full_name,
          avatar_url: row.avatar_url,
          verification_state: row.verification_state,
          professional_name: ap?.professional_name ?? null,
          agency_name: ap?.agency_name ?? null,
          years_of_experience: ap?.years_of_experience ?? null,
        });
      }
    }
  }

  // Fetch decision maker profiles
  const decisionMakerMap = new Map<string, ApplicationWithRelations["decision_maker"]>();
  if (decisionMakerIds.length > 0) {
    const { data: dmRows } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, verification_state, role")
      .in("id", decisionMakerIds);
    if (dmRows) {
      for (const row of dmRows as Array<{
        id: string;
        full_name: string;
        avatar_url: string | null;
        verification_state: string;
        role: string;
      }>) {
        decisionMakerMap.set(row.id, {
          id: row.id,
          full_name: row.full_name,
          avatar_url: row.avatar_url,
          verification_state: row.verification_state,
          role: row.role,
        });
      }
    }
  }

  // Compose
  return apps.map((app) => ({
    application: app,
    property: propertyMap.get(app.property_id) ?? {
      id: app.property_id,
      title: "Property not found",
      status: "removed" as PropertyRow["status"],
      price: 0,
      price_frequency: null,
      currency: "NGN",
      transaction_type: "rent",
      property_type_label: "",
      state: null,
      city: null,
      area: null,
      featured_image_url: null,
    },
    agent: agentMap.get(app.agent_id),
    decision_maker: decisionMakerMap.get(app.decision_maker_id),
  }));
}
