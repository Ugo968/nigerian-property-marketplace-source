import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getCurrentProfile } from "@/lib/auth/server";
import { getPaymentHistory } from "@/lib/payments/payment-service";
import { formatNaira } from "@/lib/subscriptions/plans";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

const STATUS_TONE: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  successful: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  refunded: "bg-info/10 text-info",
  expired: "bg-muted text-muted-foreground",
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  subscription: "Subscription",
  featured_listing: "Featured Listing",
  advertising: "Advertising",
  verification_fee: "Verification Fee",
  topup: "Top-up",
};

export default async function DashboardPaymentsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/dashboard/payments");
  }

  const payments = await getPaymentHistory(profile.id);

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment history</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {payments.length === 0
              ? "No payments yet."
              : `${payments.length} payment${payments.length === 1 ? "" : "s"}`}
          </p>
        </div>

        {payments.length === 0 ? (
          <EmptyState
            title="No payments"
            description="Your payment history will appear here once you make a payment."
            action={
              <Button asChild>
                <Link href="/pricing">View pricing</Link>
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Service</th>
                  <th className="text-right p-3 font-medium">Amount</th>
                  <th className="text-left p-3 font-medium">Provider</th>
                  <th className="text-left p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="p-3 text-muted-foreground">
                      {new Date(p.initiated_at).toLocaleDateString("en-NG", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="p-3">
                      {PAYMENT_TYPE_LABELS[p.payment_type] ?? p.payment_type}
                    </td>
                    <td className="p-3 text-right font-medium">
                      {formatNaira(p.amount)}
                      <span className="text-xs text-muted-foreground"> {p.currency}</span>
                    </td>
                    <td className="p-3 capitalize text-muted-foreground">
                      {p.provider}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[p.status] ?? STATUS_TONE.pending}`}
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
