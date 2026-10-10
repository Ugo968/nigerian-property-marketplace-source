import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission, adminListPromotions } from "@/lib/admin";
import { AdminPromotionsClient } from "@/components/admin/admin-promotions-client";

export const metadata = { title: "Admin · Promotions" };

export default async function AdminPromotionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await requireAdminPermission("promotions.manage");
  } catch {
    redirect("/forbidden");
  }

  const params = await searchParams;
  const filters = {
    status: params.status,
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 25,
  };
  const result = await adminListPromotions(filters);
  if (!result) return <AdminLayout><p>Database not configured.</p></AdminLayout>;

  return (
    <AdminLayout>
      <AdminPromotionsClient
        promotions={result.promotions as never}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        currentFilters={filters}
      />
    </AdminLayout>
  );
}
