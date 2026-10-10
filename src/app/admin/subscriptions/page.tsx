import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission, adminListSubscriptions } from "@/lib/admin";
import { AdminSubscriptionsClient } from "@/components/admin/admin-subscriptions-client";

export const metadata = { title: "Admin · Subscriptions" };

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await requireAdminPermission("subscriptions.manage");
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
  const result = await adminListSubscriptions(filters);
  if (!result) return <AdminLayout><p>Database not configured.</p></AdminLayout>;

  return (
    <AdminLayout>
      <AdminSubscriptionsClient
        subscriptions={result.subscriptions as never}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        currentFilters={filters}
      />
    </AdminLayout>
  );
}
