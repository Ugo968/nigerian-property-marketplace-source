import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission, adminListPayments } from "@/lib/admin";
import { AdminPaymentsClient } from "@/components/admin/admin-payments-client";

export const metadata = { title: "Admin · Payments" };

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await requireAdminPermission("payments.view");
  } catch {
    redirect("/forbidden");
  }

  const params = await searchParams;
  const filters = {
    provider: params.provider,
    paymentType: params.type,
    status: params.status,
    q: params.q,
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 25,
  };
  const result = await adminListPayments(filters);
  if (!result) return <AdminLayout><p>Database not configured.</p></AdminLayout>;

  return (
    <AdminLayout>
      <AdminPaymentsClient
        payments={result.payments}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        currentFilters={filters}
      />
    </AdminLayout>
  );
}
