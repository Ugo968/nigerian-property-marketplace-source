import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission, adminListCampaigns } from "@/lib/admin";
import { AdminAdvertisingClient } from "@/components/admin/admin-advertising-client";

export const metadata = { title: "Admin · Advertising" };

export default async function AdminAdvertisingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await requireAdminPermission("advertising.manage");
  } catch {
    redirect("/forbidden");
  }

  const params = await searchParams;
  const filters = {
    status: params.status,
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 25,
  };
  const result = await adminListCampaigns(filters);
  if (!result) return <AdminLayout><p>Database not configured.</p></AdminLayout>;

  return (
    <AdminLayout>
      <AdminAdvertisingClient
        campaigns={result.campaigns as never}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        currentFilters={filters}
      />
    </AdminLayout>
  );
}
