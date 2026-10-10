import { createAdminClient } from "@/lib/db/supabase";
import type { CampaignStatus } from "./config";
import { CAMPAIGN_TRANSITIONS } from "./config";

/**
 * Advertising eligibility service.
 *
 * Per spec Section 16:
 *   * Only eligible campaigns should be served publicly
 *   * Expired campaigns stop serving automatically
 *   * Cancelled campaigns stop serving
 *   * Rejected campaigns never serve
 *   * Suspended advertisers don't serve
 */

export interface CampaignEligibility {
  canServe: boolean;
  reason?: string;
}

export async function canServeCampaign(campaignId: string): Promise<CampaignEligibility> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { canServe: false, reason: "Database not configured." };
  }

  const { data: campRow } = await supabase
    .from("advertising_campaigns")
    .select(`
      id, status, starts_at, ends_at, budget_naira, spent_naira,
      advertising_businesses!inner(status)
    `)
    .eq("id", campaignId)
    .maybeSingle();

  if (!campRow) {
    return { canServe: false, reason: "Campaign not found." };
  }

  const camp = campRow as {
    id: string;
    status: string;
    starts_at: string | null;
    ends_at: string | null;
    budget_naira: number;
    spent_naira: number;
    advertising_businesses: { status: string };
  };

  // 1. Campaign status must be "active"
  if (camp.status !== "active") {
    return { canServe: false, reason: `Campaign status is "${camp.status}".` };
  }

  // 2. Advertiser must be approved
  if (camp.advertising_businesses.status !== "approved") {
    return { canServe: false, reason: "Advertiser not approved." };
  }

  // 3. Campaign dates must be valid
  const now = new Date();
  if (camp.starts_at && new Date(camp.starts_at) > now) {
    return { canServe: false, reason: "Campaign hasn't started yet." };
  }
  if (camp.ends_at && new Date(camp.ends_at) < now) {
    return { canServe: false, reason: "Campaign has expired." };
  }

  // 4. Budget must not be exhausted
  if (camp.spent_naira >= camp.budget_naira) {
    return { canServe: false, reason: "Campaign budget exhausted." };
  }

  return { canServe: true };
}

/**
 * Validates a campaign status transition.
 * Per spec Section 4: "Use state transitions deliberately."
 */
export function isValidTransition(
  from: CampaignStatus,
  to: CampaignStatus,
): boolean {
  const allowed = CAMPAIGN_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}
