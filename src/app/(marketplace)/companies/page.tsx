import { PublicLayout } from "@/components/layout/public-layout";
import { PageShell } from "@/components/layout/page-shell";

export default function CompaniesPage() {
  return (
    <PublicLayout>
      <PageShell
        title="Real-estate companies"
        description="Company directory and profile pages will be implemented in the Profiles & Onboarding phase."
        backHref="/"
      />
    </PublicLayout>
  );
}
