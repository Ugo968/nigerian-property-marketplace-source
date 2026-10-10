import { AdminLayout } from "@/components/layout/admin-layout";
import { PageShell } from "@/components/layout/page-shell";

export default function AdminVerificationPage() {
  return (
    <AdminLayout>
      <PageShell
        title="Verification review"
        description="Verification application review, approval, and revocation will be implemented in the Verification System phase."
        backHref="/admin"
        backLabel="Back to admin overview"
      />
    </AdminLayout>
  );
}
