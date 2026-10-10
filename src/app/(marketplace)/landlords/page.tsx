import { PublicLayout } from "@/components/layout/public-layout";
import { PageShell } from "@/components/layout/page-shell";

export default function LandlordsPage() {
  return (
    <PublicLayout>
      <PageShell
        title="Property owners"
        description="The landlord directory will be implemented alongside the property listings phase. For now, browse via property listings."
        backHref="/"
      />
    </PublicLayout>
  );
}
