"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./admin-table";
import { setReportStatusAction } from "@/lib/admin";
import { useToast } from "@/hooks/use-toast";
import type { ReportRow, AdminActionRecordRow } from "@/types";

interface Props {
  report: ReportRow;
  moderationHistory: AdminActionRecordRow[];
}

export function AdminReportDetailClient({ report, moderationHistory }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleStatusChange(status: "open" | "in_review" | "resolved" | "dismissed" | "escalated") {
    setPending(status);
    setError(null);
    const result = await setReportStatusAction({
      reportId: report.id,
      status,
    });
    setPending(null);
    if (!result.ok) {
      setError(result.message ?? "Action failed.");
      return;
    }
    toast({
      title: "Report updated",
      description: `Status: ${status.replace(/_/g, " ")}`,
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/reports">← Back to reports</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight mt-2 capitalize">
          {report.reason.replace(/_/g, " ")}
        </h1>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <StatusBadge status={report.status} />
          <span className="text-xs text-muted-foreground capitalize">
            Target: {report.entity_type.replace(/_/g, " ")}
          </span>
          <span className="text-xs text-muted-foreground">
            Filed {new Date(report.created_at).toLocaleString("en-NG")}
          </span>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Report details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Description</p>
            <p className="whitespace-pre-wrap">{report.description}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Target entity ID</p>
            <code className="text-xs">{report.entity_id}</code>
          </div>
          {report.reporter_id ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Reporter (admin view only — not visible to the reported user)</p>
              <Link href={`/admin/users/${report.reporter_id}`} className="text-xs hover:underline">
                View reporter profile
              </Link>
            </div>
          ) : report.reporter_email ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Reporter email (anonymous)</p>
              <p className="text-xs">{report.reporter_email}</p>
            </div>
          ) : null}
          {report.resolution_notes ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Resolution notes</p>
              <p className="whitespace-pre-wrap">{report.resolution_notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Moderation actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {report.status !== "in_review" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange("in_review")}
                disabled={pending !== null}
              >
                Mark under review
              </Button>
            )}
            {report.status !== "escalated" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange("escalated")}
                disabled={pending !== null}
              >
                Escalate
              </Button>
            )}
            {report.status !== "resolved" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange("resolved")}
                disabled={pending !== null}
              >
                Resolve
              </Button>
            )}
            {report.status !== "dismissed" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleStatusChange("dismissed")}
                disabled={pending !== null}
              >
                Dismiss
              </Button>
            )}
          </div>
          {pending ? <p className="text-xs text-muted-foreground mt-2">Working…</p> : null}
          {error ? <p className="text-sm text-destructive mt-2">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Moderation history</CardTitle>
        </CardHeader>
        <CardContent>
          {moderationHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No moderation actions recorded.</p>
          ) : (
            <ul className="space-y-2">
              {moderationHistory.map((r) => (
                <li key={r.id} className="border-l-2 border-muted pl-3 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{r.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("en-NG")}
                    </span>
                  </div>
                  {r.previous_state || r.new_state ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.previous_state ?? "—"} → {r.new_state ?? "—"}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
