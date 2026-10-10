import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AdminLayout } from "@/components/layout/admin-layout";
import { requireAdmin } from "@/lib/admin";
import { adminGetTransaction } from "@/lib/admin/transactions-fetchers";

export const metadata = { title: "Admin · Transaction detail" };

export default async function AdminTransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireAdmin();
  } catch {
    redirect("/forbidden");
  }

  const { id } = await params;
  const detail = await adminGetTransaction(id);
  if (!detail) notFound();

  const { transaction, statusHistory, inspections, offers } = detail;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <header>
          <Link href="/admin/transactions" className="text-sm hover:underline">
            ← Back to transactions
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-2 capitalize">
            {transaction.transaction_type} Transaction
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Transaction ID: <code>{transaction.id}</code>
          </p>
        </header>

        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          <p>
            <strong>Admin note:</strong> This is a read-only view. High-impact admin
            intervention (cancelling a transaction on behalf of a user) is audit-logged
            and requires a reason. Admins must NOT silently modify transaction history.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-md border p-4 space-y-2 text-sm">
            <h2 className="text-sm font-semibold">Transaction</h2>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="capitalize">{transaction.transaction_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="capitalize">{transaction.current_status.replace(/_/g, " ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Started</span>
              <span>{new Date(transaction.created_at).toLocaleString("en-NG")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <Link href={`/admin/users/${transaction.customer_id}`} className="text-xs hover:underline">
                View customer
              </Link>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Owner</span>
              {transaction.owner_id ? (
                <Link href={`/admin/users/${transaction.owner_id}`} className="text-xs hover:underline">
                  View owner
                </Link>
              ) : <span className="text-xs">—</span>}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Property</span>
              <Link href={`/admin/properties/${transaction.property_id}`} className="text-xs hover:underline">
                View property
              </Link>
            </div>
            {transaction.completed_at ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Completed at</span>
                <span>{new Date(transaction.completed_at).toLocaleString("en-NG")}</span>
              </div>
            ) : null}
            {transaction.cancelled_at ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cancelled at</span>
                <span>{new Date(transaction.cancelled_at).toLocaleString("en-NG")}</span>
              </div>
            ) : null}
            {transaction.cancellation_reason ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reason</span>
                <span className="text-right">{transaction.cancellation_reason}</span>
              </div>
            ) : null}
          </div>

          <div className="rounded-md border p-4 space-y-2 text-sm">
            <h2 className="text-sm font-semibold">Status history (append-only)</h2>
            {statusHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground">No history recorded.</p>
            ) : (
              <ul className="space-y-2">
                {statusHistory.map((h) => (
                  <li key={h.id} className="border-l-2 border-muted pl-3 py-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-xs">
                        {h.previous_status ? h.previous_status.replace(/_/g, " ") : "Start"} → <strong>{h.new_status.replace(/_/g, " ")}</strong>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.created_at).toLocaleString("en-NG")}
                      </span>
                    </div>
                    {h.reason ? <p className="text-xs text-muted-foreground mt-0.5">{h.reason}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-md border p-4 space-y-2 text-sm">
          <h2 className="text-sm font-semibold">Inspections ({inspections.length})</h2>
          {inspections.length === 0 ? (
            <p className="text-xs text-muted-foreground">No inspections recorded.</p>
          ) : (
            <ul className="space-y-2">
              {inspections.map((i) => (
                <li key={i.id} className="border-l-2 border-muted pl-3 py-1">
                  <div className="flex justify-between gap-2">
                    <span className="text-xs font-medium capitalize">{i.status.replace(/_/g, " ")}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(i.proposed_at).toLocaleString("en-NG")}
                    </span>
                  </div>
                  {i.notes ? <p className="text-xs text-muted-foreground mt-0.5">{i.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border p-4 space-y-2 text-sm">
          <h2 className="text-sm font-semibold">Offers ({offers.length})</h2>
          {offers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No offers recorded.</p>
          ) : (
            <ul className="space-y-2">
              {offers.map((o) => (
                <li key={o.id} className="border-l-2 border-muted pl-3 py-1">
                  <div className="flex justify-between gap-2">
                    <span className="text-xs font-medium capitalize">{o.status}</span>
                    <span className="text-xs">
                      ₦{(o.offered_amount / 100).toLocaleString("en-NG")}
                      {o.price_frequency ? ` / ${o.price_frequency.replace("per_", "")}` : ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Submitted {new Date(o.created_at).toLocaleString("en-NG")} ·
                    Expires {new Date(o.expires_at).toLocaleString("en-NG")}
                  </p>
                  {o.terms ? <p className="text-xs text-muted-foreground mt-0.5">{o.terms}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
