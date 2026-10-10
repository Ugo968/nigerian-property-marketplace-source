import { createServerClient } from "@/lib/db/supabase";
import type { PropertyTypeRow, AmenityRow } from "@/types";

/**
 * Fetch the property-type master list and amenities list.
 * Used by the wizard + edit form + public property page.
 *
 * Both are small (~25 rows each) and rarely change — safe to fetch per
 * request. Future optimisation: cache in Next.js unfresh cache for 1 hour.
 */
export async function getPropertyTypes(): Promise<PropertyTypeRow[]> {
  const supabase = await createServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("property_types")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data as PropertyTypeRow[]) ?? [];
}

export async function getAmenities(): Promise<AmenityRow[]> {
  const supabase = await createServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("amenities")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data as AmenityRow[]) ?? [];
}
