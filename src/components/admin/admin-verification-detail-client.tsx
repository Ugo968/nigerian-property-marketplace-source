"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "./confirm-dialog";
import { StatusBadge } from "./admin-table";
import {
  approveVerificationApplication,
  rejectVerificationApplication,
} from "@/lib/verification/admin-actions";
import { useToast } from "@/hooks/use-toast";

interface Props {
  application: {
    id: string;
    applicant_id: string;
    tier: string;
    status: string;
    notes?: string | null;
    rejection_reason?: string | null;
    created_at: string;
    updated_at: string;
  };
  documents: Array<{
    id: string;
    document_type: string;
    storage_path: string;
    file_name: string;
    uploaded_at: string;
  }>;
  history: Array<{
    id: string;
    previous_state: string | null;
    new_state: string;
    reason: string | null;
    created_at: string;
  }>;
}

export function AdminVerificationDetailClient({ application, documents, history }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [action, setAction] = React.useState<"approve" | "reject" | null>(null);
  const [reviewerNotes, setReviewerNotes] = React.useState("");
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  async function handleConfirm(_: string) {
    setError(null);
    if (action === "approve") {
      const result = await approveVerificationApplication({
        applicationId: application.id,
        reviewerNotes: reviewerNotes.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.message ?? "Approval failed.");
        throw new Error(result.message ?? "Approval failed.");
      }
      toast({ title: "Verification approved", description: `Tier: ${application.tier}` });
    } else if (action === "reject") {
      const result = await rejectVerificationApplication({
        applicationId: application.id,
        rejectionReason: rejectionReason.trim(),
        reviewerNotes: reviewerNotes.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.message ?? "Rejection failed.");
        throw new Error(result.message ?? "Rejection failed.");
      }
      toast({ title: "Verification rejected" });
    }
    setAction(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/verifications">← Back to verifications</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight mt-2">
          {application.tier === "bronze" ? "Bronze" : "Blue"} verification
        </h1>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <StatusBadge status={application.status} />
          <span className="text-xs text-muted-foreground">
            Submitted {new Date(application.created_at).toLocaleDateString("en-NG")}
          </span>
        </div>
      </header>

      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
        <p>
          <strong>Reminder:</strong> a paid subscription does NOT guarantee verification
          approval. Blue verification requires appropriate professional / business
          verification (incl. CAC for companies). Evaluate evidence on its merits.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Applicant</CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href={`/admin/users/${application.applicant_id}`}
            className="text-sm hover:underline"
          >
            View applicant profile
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents ({documents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents uploaded.</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((d) => (
                <li key={d.id} className="border rounded p-3">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium capitalize">
                      {d.document_type.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(d.uploaded_at).toLocaleDateString("en-NG")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{d.file_name}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Storage path: {d.storage_path}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Documents are stored in a private bucket. Public URLs are NOT generated.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review decision</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label htmlFor="reviewer-notes" className="text-sm font-medium">
              Reviewer notes (internal, optional)
            </label>
            <Textarea
              id="reviewer-notes"
              value={reviewerNotes}
              onChange={(e) => setReviewerNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes about the application…"
            />
          </div>
          {action === "reject" ? (
            <div>
              <label htmlFor="rejection-reason" className="text-sm font-medium">
                Rejection reason (visible to applicant)
                <span className="text-destructive ml-1">*</span>
              </label>
              <Textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                placeholder="Explain what the applicant needs to fix…"
              />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAction("approve")}>
              Approve verification
            </Button>
            <Button variant="destructive" onClick={() => setAction("reject")}>
              Reject verification
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verification history</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history recorded.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="border-l-2 border-muted pl-3 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">
                      {h.previous_state ?? "—"} → {h.new_state}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("en-NG")}
                    </span>
                  </div>
                  {h.reason ? (
                    <p className="text-xs text-muted-foreground mt-0.5">{h.reason}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={action !== null}
        onOpenChange={(o) => { if (!o) setAction(null); }}
        title={action === "approve" ? "Approve verification" : "Reject verification"}
        description={
          action === "approve"
            ? `Approve this ${application.tier} verification? The badge will be visible on the applicant's profile.`
            : `Reject this ${application.tier} verification? The applicant can re-apply after addressing the feedback.`
        }
        actionLabel={action === "approve" ? "Approve verification" : "Reject verification"}
        destructive={action === "reject"}
        requireReason={action === "reject"}
        reasonMinLength={5}
        onConfirm={async (reason) => {
          // Use the rejectionReason textarea when rejecting.
          if (action === "reject" && rejectionReason.trim().length < 5) {
            throw new Error("Rejection reason is required (at least 5 characters).");
          }
          await handleConfirm(reason);
        }}
      />
    </div>
  );
}
