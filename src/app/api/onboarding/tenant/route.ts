import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createServerClient } from "@/lib/db/supabase";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/server";
import { logger } from "@/lib/logging";
import { startTenantTrial } from "@/lib/tenant";
import { normalizeNigerianPhone } from "@/lib/utils/phone";

/**
 * POST /api/onboarding/tenant
 *
 * Completes tenant onboarding:
 *   1. Validates the input (full name + phone required)
 *   2. Updates the profile row (full_name + phone + onboarding_completed)
 *   3. Creates a tenant_profiles row with preferences
 *   4. Starts the 7-day free trial
 *   5. Redirects to /dashboard
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "Please sign in." }, { status: 401 });
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ message: "Profile not found." }, { status: 404 });
  }
  if (profile.role !== "tenant") {
    return NextResponse.json({ message: "FORBIDDEN — not a tenant." }, { status: 403 });
  }
  if (profile.onboarding_completed) {
    return NextResponse.json({ message: "Onboarding already completed." }, { status: 400 });
  }

  let body: {
    fullName: string;
    phone: string;
    preferredState?: string;
    preferredCity?: string;
    preferredAreas?: string[];
    preferredPropertyTypes?: string[];
    bedroomsMin?: number;
    bedroomsMax?: number;
    budgetMin?: number;
    budgetMax?: number;
    preferredTransactionType?: string;
    preferredMoveInTimeframe?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid body." }, { status: 400 });
  }

  // Validate required fields
  const fullName = body.fullName?.trim();
  if (!fullName || fullName.length < 2) {
    return NextResponse.json({ message: "Name is too short." }, { status: 400 });
  }

  const normalisedPhone = normalizeNigerianPhone(body.phone ?? "");
  if (!normalisedPhone) {
    return NextResponse.json({ message: "Invalid Nigerian phone number." }, { status: 400 });
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Database not configured." }, { status: 503 });
  }

  // Update profile
  const { error: profileErr } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      phone: normalisedPhone,
      onboarding_completed: true,
      account_status: "active",
    } as never)
    .eq("id", profile.id);

  if (profileErr) {
    logger.error("tenant onboarding: profile update failed", { error: profileErr.message });
    return NextResponse.json({ message: "We couldn't complete onboarding." }, { status: 500 });
  }

  // Create tenant_profiles row
  const admin = createAdminClient();
  if (admin) {
    await admin
      .from("tenant_profiles")
      .upsert({
        profile_id: profile.id,
        preferred_state: body.preferredState ?? null,
        preferred_city: body.preferredCity ?? null,
        preferred_areas: body.preferredAreas ?? null,
        preferred_property_types: body.preferredPropertyTypes ?? null,
        preferred_bedrooms_min: body.bedroomsMin ?? null,
        preferred_bedrooms_max: body.bedroomsMax ?? null,
        preferred_budget_min: body.budgetMin ?? null,
        preferred_budget_max: body.budgetMax ?? null,
        preferred_transaction_type: body.preferredTransactionType ?? null,
        preferred_move_in_timeframe: body.preferredMoveInTimeframe ?? null,
      } as never, { onConflict: "profile_id" });

    // Start the 7-day trial
    await startTenantTrial(profile.id);

    // Dispatch welcome notification
    await import("@/lib/notifications").then(({ notificationService }) =>
      notificationService.dispatch({
        recipientId: profile.id,
        type: "account.welcome",
        title: "Welcome to Shelty",
        body: `Welcome, ${fullName}! Your 7-day free trial has started. Browse up to 10 properties and find your next home.`,
        href: "/dashboard",
        relatedEntityType: "profile",
        relatedEntityId: profile.id,
        eventKey: `account.welcome:${user.id}`,
        metadata: { role: "tenant" },
        emailTemplateInput: { role: "tenant" },
      })
    );
  }

  return NextResponse.json({ ok: true });
}
