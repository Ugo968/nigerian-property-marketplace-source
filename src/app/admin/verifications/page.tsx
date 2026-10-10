import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission, adminListVerifications } from "@/lib/admin";
import { AdminVerificationsClient } from "@/components/admin/admin-verifications-client";

export const metadata = { title: "Admin · Verifications" };

export default async function AdminVerificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await requireAdminPermission("verification.review");
  } catch {
    redirect("/forbidden");
  }

  const params = await searchParams;
  const filters = {
    status: params.status,
    tier: params.tier,
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 25,
  };
  const result = await adminListVerifications(filters);
  if (!result) {
    return (
      <AdminLayout><p>Database not configured.</p></AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <AdminVerificationsClient
        applications={result.applications as never}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        currentFilters={filters}
      />
    </AdminLayout>
  );
}
