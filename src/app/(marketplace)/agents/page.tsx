import { PublicLayout } from "@/components/layout/public-layout";
import { PageShell } from "@/components/layout/page-shell";

export default function AgentsPage() {
  return (
    <PublicLayout>
      <PageShell
        title="Find agents"
        description="Agent directory and profile pages will be implemented in the Profiles & Onboarding phase."
        backHref="/"
      />
    </PublicLayout>
  );
}
