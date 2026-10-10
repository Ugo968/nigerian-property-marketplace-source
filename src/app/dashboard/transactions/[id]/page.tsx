import { notFound, redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCurrentProfile } from "@/lib/auth/server";
import {
  getTransaction,
  getTransactionParticipants,
  getTransactionStatusHistory,
  getTransactionInspections,
  getTransactionOffers,
} from "@/lib/transactions";
import { TransactionDetailClient } from "@/components/transactions/transaction-detail-client";

export const metadata = { title: "Transaction detail" };

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.account_status === "banned") redirect("/account-suspended?reason=banned");
  if (profile.account_status === "suspended") redirect("/account-suspended?reason=suspended");
  if (!profile.onboarding_completed) redirect(`/onboarding/${profile.role}`);

  const { transactionId } = await params;
  // RLS enforces participant-only access — non-participants get null.
  const transaction = await getTransaction(transactionId);
  if (!transaction) notFound();

  const [participants, history, inspections, offers] = await Promise.all([
    getTransactionParticipants(transactionId),
    getTransactionStatusHistory(transactionId),
    getTransactionInspections(transactionId),
    getTransactionOffers(transactionId),
  ]);

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <TransactionDetailClient
          transaction={transaction}
          participants={participants}
          statusHistory={history}
          inspections={inspections}
          offers={offers}
          callerProfileId={profile.id}
          callerRole={
            transaction.customer_id === profile.id ? "customer"
            : transaction.owner_id === profile.id ? "owner"
            : transaction.managing_agent_id === profile.id ? "managing_agent"
            : transaction.managing_company_id === profile.id ? "managing_company"
            : "listing_creator"
          }
        />
      </div>
    </DashboardLayout>
  );
}
