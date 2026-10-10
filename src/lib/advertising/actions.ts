"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createAdminClient } from "@/lib/db/supabase";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/server";
import { rateLimiter } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging";
import { initiatePayment } from "@/lib/payments/payment-service";
import { notificationService } from "@/lib/notifications";
import {
  MIN_CAMPAIGN_BUDGET_NAIRA,
  MAX_CAMPAIGNS_PER_BUSINESS,
  MAX_BUSINESSES_PER_USER,
  CAMPAIGN_TRANSITIONS,
  MAX_CREATIVE_TITLE_LENGTH,
  MAX_CREATIVE_DESCRIPTION_LENGTH,
} from "./config";
import type { CampaignStatus } from "./config";
import type { PaymentProvider } from "@/types";

/**
 * Advertising server actions.
 *
 * Per spec Sections 1, 5, 8, 9, 11, 12, 13, 24, 30, 31:
 *   * No fourth marketplace role — advertisers are separate entities
 *   * ₦5,000 minimum budget enforced server-side
 *   * Payment via existing Paystack/Flutterwave abstraction
 *   * Campaign enters pending_review after payment (not auto-active)
 *   * Advertiser ownership enforced server-side
 *   * Rate-limited
 *   * Audit logged
 */

export type AdvertisingActionResult =
  | { ok: true; businessId?: string; campaignId?: string; redirectTo?: string }
  | { ok: false; fieldErrors?: Record<string, string[]>; message?: string; requiresAuth?: boolean };

// ---------------------------------------------------------------------------
// CREATE BUSINESS (spec Section 2)
// ---------------------------------------------------------------------------

export async function createBusinessAction(input: {
  businessName: string;
  categoryId: string;
  contactEmail: string;
  contactPhone?: string;
  website?: string;
  description?: string;
  address?: string;
  state?: string;
  city?: string;
}): Promise<AdvertisingActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, requiresAuth: true, message: "Please sign in." };
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return { ok: false, requiresAuth: true };
  }

  // Validate
  const name = input.businessName?.trim();
  if (!name || name.length < 2) {
    return { ok: false, fieldErrors: { businessName: ["Business name is required (min 2 chars)."] } };
  }
  if (!input.contactEmail?.includes("@")) {
    return { ok: false, fieldErrors: { contactEmail: ["Valid email is required."] } };
  }
  if (!input.categoryId) {
    return { ok: false, fieldErrors: { categoryId: ["Category is required."] } };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, message: "Database not configured." };
  }

  // Anti-abuse: max businesses per user (spec Section 24 concept)
  const { count } = await supabase
    .from("advertising_businesses")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id);

  if ((count ?? 0) >= MAX_BUSINESSES_PER_USER) {
    return { ok: false, message: `You've reached the limit of ${MAX_BUSINESSES_PER_USER} businesses.` };
  }

  // Rate-limit
  const rl = await rateLimiter.check({
    key: user.id,
    action: "business_create",
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many businesses created. Try again later." };
  }

  // Insert
  const { data: business, error } = await supabase
    .from("advertising_businesses")
    .insert({
      owner_user_id: user.id,
      business_name: name,
      category_id: input.categoryId,
      contact_email: input.contactEmail,
      contact_phone: input.contactPhone || null,
      website: input.website || null,
      description: input.description || null,
      address: input.address || null,
      state: input.state || null,
      city: input.city || null,
      status: "pending_review",
    })
    .select("id")
    .single();

  if (error || !business) {
    logger.error("Business creation failed", { error: error?.message });
    return { ok: false, message: "Could not create business profile." };
  }

  const businessId = (business as { id: string }).id;

  // Audit
  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    action: "business_created",
    target_type: "advertising_business",
    target_id: businessId,
    metadata: { name },
  });

  revalidatePath("/dashboard/advertising", "page");
  return { ok: true, businessId, redirectTo: "/dashboard/advertising" };
}

// ---------------------------------------------------------------------------
// UPDATE BUSINESS (spec Section 2, 24)
// ---------------------------------------------------------------------------

export async function updateBusinessAction(input: {
  businessId: string;
  businessName?: string;
  description?: string;
  contactPhone?: string;
  website?: string;
  address?: string;
  state?: string;
  city?: string;
}): Promise<AdvertisingActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  // Verify ownership (spec Section 24)
  const { data: biz } = await supabase
    .from("advertising_businesses")
    .select("id, owner_user_id")
    .eq("id", input.businessId)
    .maybeSingle();

  if (!biz) {
    return { ok: false, message: "Business not found." };
  }

  if ((biz as { owner_user_id: string }).owner_user_id !== user.id) {
    return { ok: false, message: "FORBIDDEN" };
  }

  const updates: Record<string, unknown> = {};
  if (input.businessName !== undefined) updates.business_name = input.businessName.trim();
  if (input.description !== undefined) updates.description = input.description || null;
  if (input.contactPhone !== undefined) updates.contact_phone = input.contactPhone || null;
  if (input.website !== undefined) updates.website = input.website || null;
  if (input.address !== undefined) updates.address = input.address || null;
  if (input.state !== undefined) updates.state = input.state || null;
  if (input.city !== undefined) updates.city = input.city || null;

  if (Object.keys(updates).length === 0) {
    return { ok: false, message: "No fields to update." };
  }

  const { error } = await supabase
    .from("advertising_businesses")
    .update(updates)
    .eq("id", input.businessId);

  if (error) {
    return { ok: false, message: "Could not update business." };
  }

  revalidatePath("/dashboard/advertising", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// CREATE CAMPAIGN (spec Section 4, 5, 11)
// ---------------------------------------------------------------------------

export async function createCampaignAction(input: {
  businessId: string;
  name: string;
  placementId: string;
  budgetNaira: number;
  startsAt?: string;
  endsAt?: string;
  targetStates?: string[];
  targetCities?: string[];
  targetCategories?: string[];
}): Promise<AdvertisingActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true, message: "Please sign in." };

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  // Verify business ownership (spec Section 24)
  const { data: biz } = await supabase
    .from("advertising_businesses")
    .select("id, owner_user_id, status")
    .eq("id", input.businessId)
    .maybeSingle();

  if (!biz) {
    return { ok: false, message: "Business not found." };
  }

  const business = biz as { id: string; owner_user_id: string; status: string };
  if (business.owner_user_id !== user.id) {
    return { ok: false, message: "FORBIDDEN" };
  }

  // Business must be active or pending_review
  if (business.status === "suspended" || business.status === "rejected") {
    return { ok: false, message: `Business is ${business.status}. Cannot create campaigns.` };
  }

  // Validate budget (spec Section 5: ₦5,000 minimum, server-side)
  if (!Number.isInteger(input.budgetNaira) || input.budgetNaira < MIN_CAMPAIGN_BUDGET_NAIRA) {
    return {
      ok: false,
      fieldErrors: { budgetNaira: [`Minimum campaign budget is ₦${MIN_CAMPAIGN_BUDGET_NAIRA.toLocaleString()}.`] },
    };
  }

  // Validate campaign name
  const name = input.name?.trim();
  if (!name || name.length < 3) {
    return { ok: false, fieldErrors: { name: ["Campaign name must be at least 3 characters."] } };
  }

  // Anti-abuse: max campaigns per business
  const { count } = await supabase
    .from("advertising_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("business_id", input.businessId)
    .neq("status", "cancelled");

  if ((count ?? 0) >= MAX_CAMPAIGNS_PER_BUSINESS) {
    return { ok: false, message: `You've reached the limit of ${MAX_CAMPAIGNS_PER_BUSINESS} campaigns per business.` };
  }

  // Rate-limit
  const rl = await rateLimiter.check({
    key: user.id,
    action: "campaign_create",
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return { ok: false, message: "Too many campaigns. Try again later." };
  }

  // Create campaign as draft
  const { data: campaign, error } = await supabase
    .from("advertising_campaigns")
    .insert({
      business_id: input.businessId,
      name,
      placement_id: input.placementId,
      budget_naira: input.budgetNaira * 100, // Convert to kobo for DB storage
      status: "draft",
      target_states: input.targetStates ?? [],
      target_cities: input.targetCities ?? [],
      target_categories: input.targetCategories ?? [],
      starts_at: input.startsAt || null,
      ends_at: input.endsAt || null,
    })
    .select("id")
    .single();

  if (error || !campaign) {
    logger.error("Campaign creation failed", { error: error?.message });
    return { ok: false, message: "Could not create campaign." };
  }

  const campaignId = (campaign as { id: string }).id;

  // Audit
  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    action: "campaign_created",
    target_type: "advertising_campaign",
    target_id: campaignId,
    metadata: { name, budget: input.budgetNaira },
  });

  revalidatePath("/dashboard/advertising", "page");
  return { ok: true, campaignId, redirectTo: "/dashboard/advertising" };
}

// ---------------------------------------------------------------------------
// SUBMIT CAMPAIGN FOR PAYMENT (spec Section 11, 12)
// ---------------------------------------------------------------------------

export async function submitCampaignAction(input: {
  campaignId: string;
  provider: PaymentProvider;
}): Promise<AdvertisingActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, message: "Profile not found." };

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  // Verify campaign ownership
  const { data: campRow } = await supabase
    .from("advertising_campaigns")
    .select(`
      id, status, budget_naira, business_id, name,
      advertising_businesses!inner(owner_user_id)
    `)
    .eq("id", input.campaignId)
    .maybeSingle();

  if (!campRow) {
    return { ok: false, message: "Campaign not found." };
  }

  const camp = campRow as {
    id: string;
    status: string;
    budget_naira: number;
    business_id: string;
    name: string;
    advertising_businesses: { owner_user_id: string };
  };

  if (camp.advertising_businesses.owner_user_id !== user.id) {
    return { ok: false, message: "FORBIDDEN" };
  }

  // Must be in draft status
  if (camp.status !== "draft") {
    return { ok: false, message: `Campaign is already ${camp.status}.` };
  }

  // Server-side price authority (spec Section 13): use the campaign's budget
  const amountInKobo = camp.budget_naira; // already in kobo in DB

  // Update campaign to pending_payment
  await supabase
    .from("advertising_campaigns")
    .update({ status: "pending_payment" })
    .eq("id", input.campaignId);

  // Create payment via existing infrastructure (spec Section 12)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const result = await initiatePayment({
    userId: user.id,
    userEmail: user.email ?? "",
    userFullName: "Advertiser",
    userRole: "landlord", // not relevant for advertising payments
    currentTier: "free",
    requestedTier: "free", // not a subscription upgrade
    provider: input.provider,
    paymentType: "advertising",
    callbackUrl: `${appUrl}/checkout/success?provider=${input.provider}&type=advertising&campaign=${input.campaignId}`,
  });

  if (!result.ok) {
    // Revert to draft
    await supabase
      .from("advertising_campaigns")
      .update({ status: "draft" })
      .eq("id", input.campaignId);
    return { ok: false, message: result.error ?? "Payment could not be initiated." };
  }

  // Link payment to campaign
  if (result.paymentId) {
    await supabase
      .from("advertising_campaigns")
      .update({ payment_id: result.paymentId })
      .eq("id", input.campaignId);
  }

  // Audit
  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    action: "campaign_submitted",
    target_type: "advertising_campaign",
    target_id: input.campaignId,
    metadata: { provider: input.provider, amount: amountInKobo },
  });

  // Notify the advertiser (spec Section 28).
  await notificationService.dispatch({
    recipientId: profile.id,
    type: "campaign.submitted",
    title: `Campaign submitted — ${camp.name}`,
    body: `Your advertising campaign "${camp.name}" has been submitted. Complete payment to launch review.`,
    href: `/dashboard/advertising`,
    relatedEntityType: "advertising_campaign",
    relatedEntityId: input.campaignId,
    eventKey: `campaign.submitted:${input.campaignId}`,
    metadata: {
      campaignId: input.campaignId,
      campaignName: camp.name,
      budgetNaira: camp.budget_naira,
      provider: input.provider,
    },
    emailTemplateInput: {
      campaignName: camp.name,
    },
  });

  return { ok: true, redirectTo: result.authorizationUrl };
}

// ---------------------------------------------------------------------------
// PAUSE / RESUME CAMPAIGN (spec Section 14, 26)
// ---------------------------------------------------------------------------

export async function pauseCampaignAction(campaignId: string): Promise<AdvertisingActionResult> {
  return changeCampaignStatus(campaignId, "paused");
}

export async function resumeCampaignAction(campaignId: string): Promise<AdvertisingActionResult> {
  return changeCampaignStatus(campaignId, "active");
}

export async function cancelCampaignAction(campaignId: string): Promise<AdvertisingActionResult> {
  return changeCampaignStatus(campaignId, "cancelled");
}

async function changeCampaignStatus(
  campaignId: string,
  newStatus: CampaignStatus,
): Promise<AdvertisingActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, requiresAuth: true };

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, message: "Database not configured." };

  const { data: campRow } = await supabase
    .from("advertising_campaigns")
    .select(`
      id, status,
      advertising_businesses!inner(owner_user_id)
    `)
    .eq("id", campaignId)
    .maybeSingle();

  if (!campRow) {
    return { ok: false, message: "Campaign not found." };
  }

  const camp = campRow as {
    id: string;
    status: string;
    advertising_businesses: { owner_user_id: string };
  };

  if (camp.advertising_businesses.owner_user_id !== user.id) {
    return { ok: false, message: "FORBIDDEN" };
  }

  // Validate transition (spec Section 4: "Use state transitions deliberately")
  const currentStatus = camp.status as CampaignStatus;
  const allowed = CAMPAIGN_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    return { ok: false, message: `Cannot transition from "${currentStatus}" to "${newStatus}".` };
  }

  const { error } = await supabase
    .from("advertising_campaigns")
    .update({ status: newStatus })
    .eq("id", campaignId);

  if (error) {
    return { ok: false, message: "Could not update campaign status." };
  }

  // Audit
  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    action: `campaign_${newStatus}`,
    target_type: "advertising_campaign",
    target_id: campaignId,
    metadata: { previous_status: currentStatus, new_status: newStatus },
  });

  revalidatePath("/dashboard/advertising", "page");
  return { ok: true };
}
