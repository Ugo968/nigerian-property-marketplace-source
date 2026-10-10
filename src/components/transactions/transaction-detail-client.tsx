"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/admin/admin-table";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FORWARD_PATH,
  TRANSACTION_STATUS_LABELS,
  INSPECTION_STATUS_LABELS,
  OFFER_STATUS_LABELS,
  forwardPathIndex,
  isTerminalStatus,
  isActiveStatus,
} from "@/lib/transactions";
import {
  scheduleInspectionAction,
  confirmInspectionAction,
  rescheduleInspectionAction,
  cancelInspectionAction,
  completeInspectionAction,
  submitOfferAction,
  acceptOfferAction,
  declineOfferAction,
  withdrawOfferAction,
  completeTransactionAction,
  cancelTransactionAction,
} from "@/lib/transactions";
import type {
  TransactionRow,
  TransactionParticipantRow,
  TransactionStatusHistoryRow,
  InspectionRow,
  OfferRow,
} from "@/types";

interface Props {
  transaction: TransactionRow;
  participants: TransactionParticipantRow[];
  statusHistory: TransactionStatusHistoryRow[];
  inspections: InspectionRow[];
  offers: OfferRow[];
  callerProfileId: string;
  callerRole: "customer" | "owner" | "managing_agent" | "managing_company" | "listing_creator";
}

export function TransactionDetailClient({
  transaction,
  participants,
  statusHistory,
  inspections,
  offers,
  callerProfileId,
  callerRole,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [error, setError] = React.useState<string | null>(null);

  // Action state
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [proposedAt, setProposedAt] = React.useState("");
  const [inspectionNotes, setInspectionNotes] = React.useState("");

  const [offerOpen, setOfferOpen] = React.useState(false);
  const [offerAmount, setOfferAmount] = React.useState("");
  const [offerTerms, setOfferTerms] = React.useState("");
  const [offerValidityHours, setOfferValidityHours] = React.useState("72");

  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [completionOpen, setCompletionOpen] = React.useState(false);
  const [completionNotes, setCompletionNotes] = React.useState("");

  const canAccept = callerRole === "owner" || callerRole === "managing_agent" || callerRole === "managing_company";
  const isCompleted = transaction.current_status === "transaction_completed";
  const isTerminal = isTerminalStatus(transaction.current_status);
  const isCustomer = callerRole === "customer";

  // Formatters
  const formatNaira = (minor: number) => `₦${(minor / 100).toLocaleString("en-NG")}`;
  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString("en-NG", { timeZone: "Africa/Lagos" });

  async function handleScheduleInspection() {
    setError(null);
    if (!proposedAt) {
      setError("Please pick a date and time.");
      return;
    }
    const result = await scheduleInspectionAction({
      transactionId: transaction.id,
      proposedAtIso: new Date(proposedAt).toISOString(),
      proposedTimezone: "Africa/Lagos",
      notes: inspectionNotes.trim() || undefined,
    });
    if (!result.ok) {
      setError(result.message ?? "Failed to schedule inspection.");
      return;
    }
    setScheduleOpen(false);
    setProposedAt("");
    setInspectionNotes("");
    toast({ title: "Inspection proposed" });
    router.refresh();
  }

  async function handleConfirmInspection(inspectionId: string) {
    const result = await confirmInspectionAction({ inspectionId });
    if (!result.ok) {
      toast({ title: "Failed", description: result.message, variant: "destructive" });
      return;
    }
    toast({ title: "Inspection confirmed" });
    router.refresh();
  }

  async function handleCompleteInspection(inspectionId: string) {
    const result = await completeInspectionAction({ inspectionId });
    if (!result.ok) {
      toast({ title: "Failed", description: result.message, variant: "destructive" });
      return;
    }
    toast({ title: "Inspection marked completed" });
    router.refresh();
  }

  async function handleSubmitOffer() {
    setError(null);
    const amountNaira = Number(offerAmount);
    if (!amountNaira || amountNaira <= 0) {
      setError("Please enter a valid offer amount in Naira.");
      return;
    }
    const minor = Math.round(amountNaira * 100);
    const result = await submitOfferAction({
      transactionId: transaction.id,
      offeredAmountMinor: minor,
      currency: "NGN",
      priceFrequency:
        transaction.transaction_type === "sale" ? "one_off"
        : transaction.transaction_type === "rent" ? "per_month"
        : "per_day",
      terms: offerTerms.trim() || undefined,
      validityHours: parseInt(offerValidityHours, 10) || 72,
    });
    if (!result.ok) {
      setError(result.message ?? "Failed to submit offer.");
      return;
    }
    setOfferOpen(false);
    setOfferAmount("");
    setOfferTerms("");
    toast({ title: "Offer submitted" });
    router.refresh();
  }

  async function handleAcceptOffer(offerId: string) {
    const result = await acceptOfferAction({
      transactionId: transaction.id,
      offerId,
    });
    if (!result.ok) {
      toast({ title: "Failed", description: result.message, variant: "destructive" });
      return;
    }
    toast({ title: "Offer accepted" });
    router.refresh();
  }

  async function handleDeclineOffer(offerId: string, reason: string) {
    const result = await declineOfferAction({
      transactionId: transaction.id,
      offerId,
      reason,
    });
    if (!result.ok) {
      toast({ title: "Failed", description: result.message, variant: "destructive" });
      throw new Error(result.message);
    }
    toast({ title: "Offer declined" });
    router.refresh();
  }

  async function handleWithdrawOffer(offerId: string, reason: string) {
    const result = await withdrawOfferAction({
      transactionId: transaction.id,
      offerId,
      reason,
    });
    if (!result.ok) {
      toast({ title: "Failed", description: result.message, variant: "destructive" });
      throw new Error(result.message);
    }
    toast({ title: "Offer withdrawn" });
    router.refresh();
  }

  async function handleCompleteTransaction() {
    setError(null);
    const result = await completeTransactionAction({
      transactionId: transaction.id,
      completionNotes: completionNotes.trim() || undefined,
    });
    if (!result.ok) {
      setError(result.message ?? "Failed to complete transaction.");
      return;
    }
    setCompletionOpen(false);
    setCompletionNotes("");
    toast({ title: "Transaction completed" });
    router.refresh();
  }

  async function handleCancelTransaction(reason: string) {
    const result = await cancelTransactionAction({
      transactionId: transaction.id,
      reason,
    });
    if (!result.ok) {
      toast({ title: "Failed", description: result.message, variant: "destructive" });
      throw new Error(result.message);
    }
    toast({ title: "Transaction cancelled" });
    router.refresh();
  }

  const currentIdx = forwardPathIndex(transaction.current_status);

  return (
    <div className="space-y-6">
      <header>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/transactions">← Back to transactions</Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <h1 className="text-2xl font-bold tracking-tight capitalize">
            {transaction.transaction_type} Transaction
          </h1>
          <StatusBadge status={transaction.current_status} />
          {isActiveStatus(transaction.current_status) && (
            <span className="text-xs text-emerald-600 font-medium">● Active</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Transaction ID: <code>{transaction.id}</code> · Started {formatDateTime(transaction.created_at)}
        </p>
      </header>

      {/* Safety warning */}
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
        <p>
          <strong>Stay safe:</strong> Always inspect the property in person and
          independently verify the owner/agent, ownership documents, property
          details, and payment information before making any payment or commitment.
          The platform does NOT hold transaction money in V1.
        </p>
      </div>

      {/* Status timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Status timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3" aria-label="Transaction status timeline">
            {FORWARD_PATH.map((stage, idx) => {
              const isPast = currentIdx >= 0 && idx < currentIdx;
              const isCurrent = idx === currentIdx;
              const isUpcoming = currentIdx >= 0 && idx > currentIdx;
              const label = TRANSACTION_STATUS_LABELS[stage];
              return (
                <li key={stage} className="flex items-center gap-3">
                  <span
                    className={
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold " +
                      (isPast
                        ? "bg-emerald-100 text-emerald-700"
                        : isCurrent
                        ? "bg-blue-100 text-blue-700 ring-2 ring-blue-300"
                        : "bg-muted text-muted-foreground")
                    }
                    aria-current={isCurrent ? "step" : undefined}
                    aria-label={
                      isPast ? `${label} (completed)`
                      : isCurrent ? `${label} (current)`
                      : `${label} (upcoming)`
                    }
                  >
                    {isPast ? "✓" : isCurrent ? "●" : idx + 1}
                  </span>
                  <div>
                    <p className={
                      "text-sm font-medium " +
                      (isPast ? "line-through text-muted-foreground"
                      : isCurrent ? "text-foreground"
                      : "text-muted-foreground")
                    }>
                      {label}
                    </p>
                  </div>
                </li>
              );
            })}
            {isTerminal && (
              <li className="flex items-center gap-3 pt-2 border-t">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-700 text-xs font-bold">
                  ✕
                </span>
                <p className="text-sm font-medium text-red-700">
                  {TRANSACTION_STATUS_LABELS[transaction.current_status]}
                </p>
              </li>
            )}
            {isCompleted && (
              <li className="flex items-center gap-3 pt-2 border-t">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                  ★
                </span>
                <p className="text-sm font-medium text-emerald-700">
                  Transaction completed (user-reported, not platform-verified)
                </p>
              </li>
            )}
          </ol>
        </CardContent>
      </Card>

      {/* Status history (append-only) */}
      {statusHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Status history (append-only)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {statusHistory.map((h) => (
                <li key={h.id} className="border-l-2 border-muted pl-3 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">
                      {h.previous_status ? TRANSACTION_STATUS_LABELS[h.previous_status as keyof typeof TRANSACTION_STATUS_LABELS] : "Start"}
                      {" → "}
                      <span className="font-medium">
                        {TRANSACTION_STATUS_LABELS[h.new_status as keyof typeof TRANSACTION_STATUS_LABELS]}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(h.created_at)}
                    </span>
                  </div>
                  {h.reason ? <p className="text-xs text-muted-foreground mt-0.5">{h.reason}</p> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Inspections */}
      <Card>
        <CardHeader>
          <CardTitle>Inspections ({inspections.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {inspections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inspections scheduled yet.</p>
          ) : (
            inspections.map((insp) => (
              <div key={insp.id} className="border rounded p-3 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium">
                      {formatDateTime(insp.proposed_at)}
                    </p>
                    {insp.proposed_ends_at ? (
                      <p className="text-xs text-muted-foreground">
                        Ends {formatDateTime(insp.proposed_ends_at)}
                      </p>
                    ) : null}
                    {insp.notes ? (
                      <p className="text-xs text-muted-foreground mt-1">{insp.notes}</p>
                    ) : null}
                  </div>
                  <StatusBadge status={insp.status} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {insp.status === "proposed" && insp.proposed_by !== callerProfileId && (
                    <Button size="sm" variant="outline" onClick={() => handleConfirmInspection(insp.id)}>
                      Confirm
                    </Button>
                  )}
                  {insp.status === "confirmed" && (
                    <Button size="sm" onClick={() => handleCompleteInspection(insp.id)}>
                      Mark completed
                    </Button>
                  )}
                  {["proposed", "confirmed", "reschedule_requested"].includes(insp.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const reason = prompt("Reason for reschedule (min 3 chars):");
                        if (reason && reason.trim().length >= 3) {
                          const result = await rescheduleInspectionAction({ inspectionId: insp.id, reason });
                          if (result.ok) router.refresh();
                          else toast({ title: "Failed", description: result.message, variant: "destructive" });
                        }
                      }}
                    >
                      Request reschedule
                    </Button>
                  )}
                  {["proposed", "confirmed", "reschedule_requested"].includes(insp.status) && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        const reason = prompt("Reason for cancellation (min 3 chars):");
                        if (reason && reason.trim().length >= 3) {
                          const result = await cancelInspectionAction({ inspectionId: insp.id, reason });
                          if (result.ok) router.refresh();
                          else toast({ title: "Failed", description: result.message, variant: "destructive" });
                        }
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
          {!isTerminal && !isCompleted && (
            <Button size="sm" variant="outline" onClick={() => setScheduleOpen(!scheduleOpen)}>
              {scheduleOpen ? "Cancel" : "Propose inspection"}
            </Button>
          )}
          {scheduleOpen && (
            <div className="border rounded p-3 space-y-2 bg-muted/30">
              <div>
                <label htmlFor="insp-date" className="text-xs font-medium">Date & time</label>
                <Input
                  id="insp-date"
                  type="datetime-local"
                  value={proposedAt}
                  onChange={(e) => setProposedAt(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="insp-notes" className="text-xs font-medium">Notes (optional)</label>
                <Textarea
                  id="insp-notes"
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  rows={2}
                  placeholder="Any specific instructions for the inspection…"
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button size="sm" onClick={handleScheduleInspection}>Schedule</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Offers */}
      <Card>
        <CardHeader>
          <CardTitle>Offers ({offers.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {offers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No offers yet.</p>
          ) : (
            offers.map((o) => {
              // Privacy: only the offer submitter + counter-party (owner/agent)
              // can see the amount. For the customer viewing other customers'
              // offers, RLS would have already filtered them out — we don't
              // see them at all.
              const isOwnOffer = o.submitted_by === callerProfileId;
              const canSeeAmount = isOwnOffer || canAccept;
              return (
                <div key={o.id} className="border rounded p-3 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {canSeeAmount ? formatNaira(o.offered_amount) : "••••••••"}
                        {o.price_frequency ? ` / ${o.price_frequency.replace("per_", "")}` : ""}
                      </p>
                      {o.terms ? <p className="text-xs text-muted-foreground mt-1">{o.terms}</p> : null}
                      <p className="text-xs text-muted-foreground mt-1">
                        Valid until {formatDateTime(o.expires_at)}
                      </p>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {o.status === "submitted" && canAccept && !isOwnOffer && (
                      <>
                        <Button size="sm" onClick={() => handleAcceptOffer(o.id)}>
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={async () => {
                            const reason = prompt("Reason for declining (min 3 chars):");
                            if (reason && reason.trim().length >= 3) {
                              try {
                                await handleDeclineOffer(o.id, reason);
                              } catch (e) {
                                // toast handled
                              }
                            }
                          }}
                        >
                          Decline
                        </Button>
                      </>
                    )}
                    {o.status === "submitted" && isOwnOffer && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const reason = prompt("Reason for withdrawal (min 3 chars):");
                          if (reason && reason.trim().length >= 3) {
                            try {
                              await handleWithdrawOffer(o.id, reason);
                            } catch (e) {
                              // toast handled
                            }
                          }
                        }}
                      >
                        Withdraw
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {!isTerminal && !isCompleted && (
            <Button size="sm" variant="outline" onClick={() => setOfferOpen(!offerOpen)}>
              {offerOpen ? "Cancel" : "Submit offer"}
            </Button>
          )}
          {offerOpen && (
            <div className="border rounded p-3 space-y-2 bg-muted/30">
              <div>
                <label htmlFor="offer-amount" className="text-xs font-medium">Amount (₦)</label>
                <Input
                  id="offer-amount"
                  type="number"
                  min="0"
                  step="1000"
                  value={offerAmount}
                  onChange={(e) => setOfferAmount(e.target.value)}
                  placeholder="e.g. 5000000"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Note: this is a negotiated amount for tracking only. The platform does NOT collect this money.
                </p>
              </div>
              <div>
                <label htmlFor="offer-validity" className="text-xs font-medium">Validity (hours)</label>
                <Input
                  id="offer-validity"
                  type="number"
                  min="1"
                  max="720"
                  value={offerValidityHours}
                  onChange={(e) => setOfferValidityHours(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="offer-terms" className="text-xs font-medium">Terms (optional)</label>
                <Textarea
                  id="offer-terms"
                  value={offerTerms}
                  onChange={(e) => setOfferTerms(e.target.value)}
                  rows={2}
                  placeholder="Any conditions or context…"
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button size="sm" onClick={handleSubmitOffer}>Submit offer</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Participants */}
      <Card>
        <CardHeader>
          <CardTitle>Participants ({participants.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1">
            {participants.map((p) => (
              <li key={p.id} className="flex justify-between text-sm">
                <span className="capitalize">{p.role.replace(/_/g, " ")}</span>
                {p.user_id === callerProfileId ? (
                  <span className="text-xs text-muted-foreground">You</span>
                ) : (
                  <Link href={`/dashboard/messages`} className="text-xs text-primary hover:underline">
                    Message
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Completion / cancellation actions */}
      {!isTerminal && !isCompleted && (
        <Card>
          <CardHeader>
            <CardTitle>Transaction actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {transaction.current_status === "offer_accepted" && (
                <Button onClick={() => setCompletionOpen(true)}>
                  Mark transaction completed
                </Button>
              )}
              <Button
                variant="destructive"
                onClick={() => setCancelOpen(true)}
              >
                Cancel transaction
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completion dialog */}
      <ConfirmDialog
        open={completionOpen}
        onOpenChange={(o) => { if (!o) setCompletionOpen(false); }}
        title="Mark transaction completed"
        description="Mark this transaction as completed? This is user-reported and not platform-verified. Completing the transaction may also update the property's status (e.g. rented / sold)."
        actionLabel="Mark completed"
        onConfirm={async () => {
          await handleCompleteTransaction();
        }}
      >
        <Textarea
          value={completionNotes}
          onChange={(e) => setCompletionNotes(e.target.value)}
          rows={2}
          placeholder="Optional completion notes…"
        />
      </ConfirmDialog>

      {/* Cancellation dialog */}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={(o) => { if (!o) setCancelOpen(false); }}
        title="Cancel transaction"
        description="Cancel this transaction? This will mark all pending offers as expired. The transaction history is preserved for audit. This action cannot be undone."
        actionLabel="Cancel transaction"
        destructive
        requireReason
        reasonMinLength={5}
        onConfirm={async (reason) => {
          await handleCancelTransaction(reason);
        }}
      />
    </div>
  );
}
