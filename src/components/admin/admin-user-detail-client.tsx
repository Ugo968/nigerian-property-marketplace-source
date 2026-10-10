"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { StatusBadge } from "./admin-table";
import {
  suspendUserAction,
  reactivateUserAction,
  banUserAction,
} from "@/lib/admin/actions";
import type { AdminUserDetail } from "@/lib/admin/actions";
import type { AdminActionRecordRow } from "@/types";

interface Props {
  detail: AdminUserDetail;
}

export function AdminUserDetailClient({ detail }: Props) {
  const router = useRouter();
  const { profile, email } = detail;
  const [action, setAction] = React.useState<"suspend" | "reactivate" | "ban" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const isSuspended = profile.account_status === "suspended";
  const isBanned = profile.account_status === "banned";
  const isActive = profile.account_status === "active";

  async function handleConfirm(reason: string) {
    setError(null);
    if (!action) return;
    const input = { profileId: profile.id, reason };
    let result;
    if (action === "suspend") result = await suspendUserAction(input);
    else if (action === "reactivate") result = await reactivateUserAction(input);
    else if (action === "ban") result = await banUserAction(input);
    if (result && !result.ok) {
      setError(result.message ?? "Action failed.");
      throw new Error(result.message ?? "Action failed.");
    }
    setAction(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/users">← Back to users</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight mt-2">{profile.full_name}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <StatusBadge status={profile.account_status} />
          <StatusBadge status={profile.verification_state} />
          <span className="text-xs text-muted-foreground capitalize">
            {profile.role} · {profile.subscription_tier} plan
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Profile info */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Name" value={profile.full_name} />
            <InfoRow label="Email" value={email ?? "—"} />
            <InfoRow label="Phone" value={profile.phone ?? "—"} />
            <InfoRow label="Role" value={<span className="capitalize">{profile.role}</span>} />
            <InfoRow label="Account status" value={<StatusBadge status={profile.account_status} />} />
            <InfoRow label="Verification" value={<StatusBadge status={profile.verification_state} />} />
            <InfoRow label="Subscription" value={<span className="capitalize">{profile.subscription_tier}</span>} />
            <InfoRow label="Joined" value={new Date(profile.created_at).toLocaleString("en-NG")} />
            {profile.suspended_at ? (
              <InfoRow
                label="Suspended at"
                value={new Date(profile.suspended_at).toLocaleString("en-NG")}
              />
            ) : null}
            {profile.suspended_reason ? (
              <InfoRow label="Suspension reason" value={profile.suspended_reason} />
            ) : null}
          </CardContent>
        </Card>

        {/* Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Properties" value={String(detail.propertyCount)} />
            <InfoRow label="Applications" value={String(detail.applicationCount)} />
            <InfoRow label="Reviews" value={String(detail.reviewCount)} />
            <InfoRow label="Reports filed" value={String(detail.reportCount)} />
            <InfoRow
              label="Subscription status"
              value={detail.subscriptionStatus ?? "None"}
            />
            <InfoRow
              label="Onboarding complete"
              value={profile.onboarding_completed ? "Yes" : "No"}
            />
          </CardContent>
        </Card>
      </div>

      {/* Moderation actions */}
      <Card>
        <CardHeader>
          <CardTitle>Moderation actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {!isSuspended && !isBanned && (
              <Button variant="outline" onClick={() => setAction("suspend")}>
                Suspend user
              </Button>
            )}
            {isSuspended && (
              <Button variant="outline" onClick={() => setAction("reactivate")}>
                Reactivate user
              </Button>
            )}
            {!isBanned && (
              <Button variant="destructive" onClick={() => setAction("ban")}>
                Ban user
              </Button>
            )}
          </div>
          {error ? <p className="text-sm text-destructive mt-2">{error}</p> : null}
        </CardContent>
      </Card>

      {/* Moderation history */}
      <Card>
        <CardHeader>
          <CardTitle>Moderation history</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.moderationHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No moderation actions recorded.</p>
          ) : (
            <ul className="space-y-2">
              {detail.moderationHistory.map((r) => (
                <ModerationHistoryItem key={r.id} record={r} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={action !== null}
        onOpenChange={(o) => {
          if (!o) setAction(null);
        }}
        title={
          action === "suspend" ? "Suspend user" :
          action === "reactivate" ? "Reactivate user" :
          action === "ban" ? "Ban user" : "Confirm"
        }
        description={
          action === "suspend" ? `Suspend ${profile.full_name}? They will not be able to perform marketplace actions until reactivated.` :
          action === "reactivate" ? `Reactivate ${profile.full_name}? They will regain full marketplace access.` :
          action === "ban" ? `Ban ${profile.full_name}? This is a high-impact action. Their listings and reviews will be preserved for audit.` :
          "Confirm this moderation action."
        }
        actionLabel={
          action === "suspend" ? "Suspend user" :
          action === "reactivate" ? "Reactivate user" :
          action === "ban" ? "Ban user" : "Confirm"
        }
        destructive={action === "ban"}
        requireReason
        reasonMinLength={action === "ban" ? 10 : 3}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function ModerationHistoryItem({ record }: { record: AdminActionRecordRow }) {
  return (
    <li className="border-l-2 border-muted pl-3 py-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{record.action}</span>
        <span className="text-xs text-muted-foreground">
          {new Date(record.created_at).toLocaleString("en-NG")}
        </span>
      </div>
      {record.reason ? (
        <p className="text-xs text-muted-foreground mt-0.5">Reason: {record.reason}</p>
      ) : null}
      {record.previous_state || record.new_state ? (
        <p className="text-xs text-muted-foreground mt-0.5">
          {record.previous_state ?? "—"} → {record.new_state ?? "—"}
        </p>
      ) : null}
    </li>
  );
}
