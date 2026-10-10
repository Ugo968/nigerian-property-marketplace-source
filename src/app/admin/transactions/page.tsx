import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdminPermission } from "@/lib/admin";
import { adminListTransactions } from "@/lib/admin/transactions-fetchers";
import { AdminTransactionsClient } from "@/components/admin/admin-transactions-client";

export const metadata = { title: "Admin · Transactions" };

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  try {
    await requireAdminPermission("applications.view");
  } catch {
    redirect("/forbidden");
  }

  const params = await searchParams;
  const result = await adminListTransactions({
    status: params.status,
    transactionType: params.type,
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 25,
  });
  if (!result) return <AdminLayout><p>Database not configured.</p></AdminLayout>;

  return (
    <AdminLayout>
      <AdminTransactionsClient
        transactions={result.transactions as never}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        currentFilters={params}
      />
    </AdminLayout>
  );
}
