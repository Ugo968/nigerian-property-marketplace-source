import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCurrentProfile } from "@/lib/auth/server";
import { listMyTransactions } from "@/lib/transactions";
import { TransactionsListClient } from "@/components/transactions/transactions-list-client";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/dashboard/transactions");
  if (profile.account_status === "banned") redirect("/account-suspended?reason=banned");
  if (profile.account_status === "suspended") redirect("/account-suspended?reason=suspended");
  if (profile.deleted_at) redirect("/account-suspended?reason=deactivated");
  if (!profile.onboarding_completed) redirect(`/onboarding/${profile.role}`);

  const params = await searchParams;
  const result = await listMyTransactions({
    status: params.status,
    transactionType: params.type,
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 25,
  });
  if (!result) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <p className="text-sm text-muted-foreground">Database not configured.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <TransactionsListClient
          transactions={result.transactions}
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          currentFilters={{ status: params.status, transactionType: params.type }}
        />
      </div>
    </DashboardLayout>
  );
}
