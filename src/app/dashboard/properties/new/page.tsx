import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/server";
import { PropertyWizard } from "@/components/properties/property-wizard";
import { getPropertyTypes, getAmenities } from "@/lib/properties/reference-data";

export default async function NewPropertyPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/dashboard/properties/new");
  }
  if (profile.account_status === "banned") {
    redirect("/account-suspended?reason=banned");
  }
  if (profile.account_status === "suspended") {
    redirect("/account-suspended?reason=suspended");
  }
  if (!profile.onboarding_completed) {
    redirect(`/onboarding/${profile.role}`);
  }

  const [propertyTypes, amenities] = await Promise.all([
    getPropertyTypes(),
    getAmenities(),
  ]);

  return (
    <PropertyWizard
      propertyTypes={propertyTypes}
      amenities={amenities}
      listedBy={{
        fullName: profile.full_name,
        role: profile.role,
        verificationState: profile.verification_state,
      }}
    />
  );
}
