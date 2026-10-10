import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission, adminListProperties } from "@/lib/admin";
import { AdminPropertiesClient } from "@/components/admin/admin-properties-client";

export const metadata = { title: "Admin · Properties" };

export default async function AdminPropertiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await requireAdminPermission("properties.view");
  } catch {
    redirect("/forbidden");
  }

  const params = await searchParams;
  const filters = {
    q: params.q,
    status: params.status,
    transactionType: params.transaction,
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 25,
  };
  const result = await adminListProperties(filters);
  if (!result) {
    return (
      <AdminLayout>
        <p>Database not configured.</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <AdminPropertiesClient
        properties={result.properties}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        currentFilters={filters}
      />
    </AdminLayout>
  );
}
