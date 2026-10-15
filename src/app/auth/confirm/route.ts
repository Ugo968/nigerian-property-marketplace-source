import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/db/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    return NextResponse.redirect(
      new URL("/login?error=verification_failed", origin),
    );
  }

  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.redirect(
      new URL("/login?error=verification_failed", origin),
    );
  }

  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error || !data.user) {
    return NextResponse.redirect(
      new URL("/login?error=verification_failed", origin),
    );
  }

  const user = data.user;
  const metadata = user.user_metadata ?? {};

  const role = metadata.role;
  const fullName = metadata.full_name;
  const phone = metadata.phone ?? null;

  if (
    !["landlord", "agent", "company", "tenant"].includes(role) ||
    typeof fullName !== "string" ||
    !fullName.trim()
  ) {
    return NextResponse.redirect(
      new URL("/login?error=profile_setup_failed", origin),
    );
  }

  const { data: existingProfile, error: lookupError } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.redirect(
      new URL("/login?error=profile_setup_failed", origin),
    );
  }

  if (!existingProfile) {
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        user_id: user.id,
        role,
        full_name: fullName.trim(),
        phone,
        email_verified: true,
        account_status: "pending",
        onboarding_completed: false,
      });

    if (profileError) {
      console.error("Profile creation failed:", profileError.message);

      return NextResponse.redirect(
        new URL("/login?error=profile_setup_failed", origin),
      );
    }
  }

  return NextResponse.redirect(new URL("/login?verified=true", origin));
}
