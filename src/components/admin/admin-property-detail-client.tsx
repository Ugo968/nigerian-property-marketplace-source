"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { StatusBadge } from "./admin-table";
import {
  suspendPropertyAction,
  removePropertyAction,
  restorePropertyAction,
} from "@/lib/admin";
import type { AdminActionRecordRow } from "@/types";

interface Props {
  property: {
    id: string;
    title: string;
    description: string | null;
    transaction_type: string;
    price: number;
    currency: string;
    bedrooms: number;
    bathrooms: number;
    status: string;
    deleted_at: string | null;
    published_at: string | null;
    created_at: string;
    listing_creator_id: string;
    owner_profile_id: string | null;
    managing_agent_id: string | null;
    property_type_id: string;
  };
  location: {
    state: string | null;
    city: string | null;
    area: string | null;
    landmark: string | null;
    address_line: string | null;
  } | null;
  media: Array<{ id: string; storage_path: string; media_type: string; file_name: string }>;
  reports: Array<{ id: string; reason: string; status: string; created_at: string }>;
  moderationHistory: AdminActionRecordRow[];
}

export function AdminPropertyDetailClient({
  property,
  location,
  media,
  reports,
  moderationHistory,
}: Props) {
  const router = useRouter();
  const [action, setAction] = React.useState<"suspend" | "remove" | "restore" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleConfirm(reason: string) {
    setError(null);
    if (!action) return;
    const input = { propertyId: property.id, reason };
    let result;
    if (action === "suspend") result = await suspendPropertyAction(input);
    else if (action === "remove") result = await removePropertyAction(input);
    else if (action === "restore") result = await restorePropertyAction(input);
    if (result && !result.ok) {
      setError(result.message ?? "Action failed.");
      throw new Error(result.message ?? "Action failed.");
    }
    setAction(null);
    router.refresh();
  }

  const isRemoved = property.deleted_at !== null;
  const isSuspended = property.status === "suspended";

  return (
    <div className="space-y-6">
      <header>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/properties">← Back to properties</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight mt-2">{property.title}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <StatusBadge status={property.status} />
          <span className="text-xs text-muted-foreground capitalize">
            {property.transaction_type} · ₦{(property.price / 100).toLocaleString("en-NG")} · {property.bedrooms} beds
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Listing details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Title" value={property.title} />
            <InfoRow label="Description" value={property.description ?? "—"} />
            <InfoRow label="Transaction" value={<span className="capitalize">{property.transaction_type}</span>} />
            <InfoRow label="Price" value={`₦${(property.price / 100).toLocaleString("en-NG")}`} />
            <InfoRow label="Bedrooms" value={String(property.bedrooms)} />
            <InfoRow label="Bathrooms" value={String(property.bathrooms)} />
            {location ? (
              <>
                <InfoRow label="State" value={location.state ?? "—"} />
                <InfoRow label="City" value={location.city ?? "—"} />
                <InfoRow label="Area" value={location.area ?? "—"} />
                <InfoRow label="Landmark" value={location.landmark ?? "—"} />
                <InfoRow label="Address" value={location.address_line ?? "—"} />
              </>
            ) : null}
            <InfoRow
              label="Published"
              value={property.published_at ? new Date(property.published_at).toLocaleString("en-NG") : "Not published"}
            />
            <InfoRow
              label="Created"
              value={new Date(property.created_at).toLocaleString("en-NG")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ownership</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow
              label="Listing creator"
              value={
                <Link href={`/admin/users/${property.listing_creator_id}`} className="hover:underline">
                  View creator
                </Link>
              }
            />
            <InfoRow
              label="Owner"
              value={
                property.owner_profile_id ? (
                  <Link href={`/admin/users/${property.owner_profile_id}`} className="hover:underline">
                    View owner
                  </Link>
                ) : "Same as creator"
              }
            />
            <InfoRow
              label="Managing agent"
              value={
                property.managing_agent_id ? (
                  <Link href={`/admin/users/${property.managing_agent_id}`} className="hover:underline">
                    View agent
                  </Link>
                ) : "—"
              }
            />
          </CardContent>
        </Card>
      </div>

      {/* Media */}
      <Card>
        <CardHeader>
          <CardTitle>Media ({media.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {media.length === 0 ? (
            <p className="text-sm text-muted-foreground">No media uploaded.</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {media.map((m) => (
                <li key={m.id} className="text-xs border rounded p-2">
                  <span className="font-medium capitalize">{m.media_type}</span>
                  <br />
                  <span className="text-muted-foreground">{m.file_name}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Reports against this property */}
      <Card>
        <CardHeader>
          <CardTitle>Reports ({reports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reports filed.</p>
          ) : (
            <ul className="space-y-2">
              {reports.map((r) => (
                <li key={r.id} className="border-l-2 border-muted pl-3 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium capitalize">{r.reason.replace(/_/g, " ")}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(r.created_at).toLocaleString("en-NG")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Moderation actions */}
      <Card>
        <CardHeader>
          <CardTitle>Moderation actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {!isSuspended && !isRemoved && (
              <Button variant="outline" onClick={() => setAction("suspend")}>
                Suspend listing
              </Button>
            )}
            {!isRemoved && (
              <Button variant="destructive" onClick={() => setAction("remove")}>
                Remove listing
              </Button>
            )}
            {isRemoved && (
              <Button variant="outline" onClick={() => setAction("restore")}>
                Restore listing
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
                  {r.reason ? (
                    <p className="text-xs text-muted-foreground mt-0.5">Reason: {r.reason}</p>
                  ) : null}
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

      <ConfirmDialog
        open={action !== null}
        onOpenChange={(o) => {
          if (!o) setAction(null);
        }}
        title={
          action === "suspend" ? "Suspend listing" :
          action === "remove" ? "Remove listing" :
          action === "restore" ? "Restore listing" : "Confirm"
        }
        description={
          action === "suspend" ? `Suspend "${property.title}"? The listing will be hidden from public search until restored.` :
          action === "remove" ? `Remove "${property.title}"? The listing will be hidden and marked as removed. Historical records are preserved for audit.` :
          action === "restore" ? `Restore "${property.title}"? The listing will become visible again (status: ${property.published_at ? "available" : "draft"}).` :
          "Confirm this moderation action."
        }
        actionLabel={
          action === "suspend" ? "Suspend listing" :
          action === "remove" ? "Remove listing" :
          action === "restore" ? "Restore listing" : "Confirm"
        }
        destructive={action === "remove"}
        requireReason
        reasonMinLength={action === "remove" ? 10 : 3}
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
