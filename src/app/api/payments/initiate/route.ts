import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/auth/server";
import { initiatePayment } from "@/lib/payments/payment-service";
import { getPlan } from "@/lib/subscriptions/plans";
import { logger } from "@/lib/logging";
import type { PaymentProvider, SubscriptionTier } from "@/types";

/**
 * Payment initiation API route.
 *
 * Per spec Section 4 (SERVER-SIDE PRICE AUTHORITY):
 *   1. Authenticate user
 *   2. Load profile (role + current tier)
 *   3. Validate requested plan matches role
 *   4. Look up authoritative price from plan config
 *   5. Create pending payment row
 *   6. Call provider to initialize
 *   7. Return checkout URL
 *
 * Never trusts client-supplied amount.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 404 });
  }

  if (profile.account_status !== "active") {
    return NextResponse.json({ ok: false, error: "Account inactive" }, { status: 403 });
  }

  const body = await req.json() as {
    provider: PaymentProvider;
    requestedTier: SubscriptionTier;
  };

  if (!body.provider || !["paystack", "flutterwave"].includes(body.provider)) {
    return NextResponse.json({ ok: false, error: "Invalid provider" }, { status: 400 });
  }

  if (!body.requestedTier || !["pro", "premium"].includes(body.requestedTier)) {
    return NextResponse.json({ ok: false, error: "Invalid tier" }, { status: 400 });
  }

  const plan = getPlan(profile.role, body.requestedTier);
  if (!plan || !plan.sellable) {
    return NextResponse.json({ ok: false, error: "Invalid plan for role" }, { status: 400 });
  }

  if (profile.subscription_tier === body.requestedTier) {
    return NextResponse.json({ ok: false, error: "Already on this plan" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const result = await initiatePayment({
    userId: profile.id,
    userEmail: user.email ?? "",
    userFullName: profile.full_name,
    userRole: profile.role,
    currentTier: profile.subscription_tier,
    requestedTier: body.requestedTier,
    provider: body.provider,
    paymentType: "subscription",
    callbackUrl: `${appUrl}/checkout/success?provider=${body.provider}`,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    authorizationUrl: result.authorizationUrl,
    reference: result.reference,
    paymentId: result.paymentId,
  });
}
