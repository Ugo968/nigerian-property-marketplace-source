"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/feedback";
import {
  renameSavedSearch,
  deleteSavedSearch,
  toggleSavedSearchActive,
} from "@/lib/search/actions";
import { serialiseSearchParams } from "@/lib/search/params";
import type { SearchParams } from "@/lib/search/params";

interface SavedSearch {
  id: string;
  name: string;
  criteria: Record<string, unknown>;
  is_active: boolean;
  alert_level: string;
  last_matched_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SavedSearchesClientProps {
  searches: SavedSearch[];
}

export function SavedSearchesClient({ searches }: SavedSearchesClientProps) {
  const router = useRouter();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleRename(id: string) {
    setPending(true);
    setError(null);
    const result = await renameSavedSearch({ savedSearchId: id, name: editName });
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to rename.");
      return;
    }
    setEditingId(null);
    setEditName("");
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this saved search?")) return;
    setPending(true);
    setError(null);
    const result = await deleteSavedSearch(id);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to delete.");
      return;
    }
    router.refresh();
  }

  async function handleToggleActive(id: string) {
    setPending(true);
    const result = await toggleSavedSearchActive(id);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to toggle.");
      return;
    }
    router.refresh();
  }

  function buildSearchUrl(criteria: Record<string, unknown>): string {
    // Convert the stored criteria back to URL params
    const params: SearchParams = {
      q: criteria.q as string | undefined,
      transaction: criteria.transaction as SearchParams["transaction"],
      propertyType: criteria.propertyType as string | undefined,
      state: criteria.state as string | undefined,
      city: criteria.city as string | undefined,
      area: criteria.area as string | undefined,
      landmark: criteria.landmark as string | undefined,
      minPrice: criteria.minPrice as number | undefined,
      maxPrice: criteria.maxPrice as number | undefined,
      priceFrequency: criteria.priceFrequency as SearchParams["priceFrequency"],
      bedroomsMin: criteria.bedroomsMin as number | undefined,
      bathroomsMin: criteria.bathroomsMin as number | undefined,
      furnishedStatus: criteria.furnishedStatus as SearchParams["furnishedStatus"],
      amenities: criteria.amenities as string[] | undefined,
    };
    return `/properties?${serialiseSearchParams(params)}`;
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {searches.map((search) => {
        const searchUrl = buildSearchUrl(search.criteria);
        return (
          <Card key={search.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {editingId === search.id ? (
                    <div className="flex gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={80}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        onClick={() => handleRename(search.id)}
                        disabled={pending || editName.trim().length < 3}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(null);
                          setEditName("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <CardTitle className="text-base">{search.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Created{" "}
                        {new Date(search.created_at).toLocaleDateString("en-NG", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                        {search.last_matched_at
                          ? ` · last matched ${new Date(search.last_matched_at).toLocaleDateString("en-NG")}`
                          : ""}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button asChild size="sm" variant="outline">
                    <Link href={searchUrl}>
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      Run
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(search.id);
                      setEditName(search.name);
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleToggleActive(search.id)}
                    disabled={pending}
                  >
                    {search.is_active ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(search.id)}
                    disabled={pending}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {search.criteria.transaction ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 capitalize">
                    {search.criteria.transaction as string}
                  </span>
                ) : null}
                {search.criteria.propertyType ? (
                  <span className="rounded-full bg-muted px-2 py-0.5">
                    {search.criteria.propertyType as string}
                  </span>
                ) : null}
                {search.criteria.state ? (
                  <span className="rounded-full bg-muted px-2 py-0.5">
                    {search.criteria.state as string}
                  </span>
                ) : null}
                {search.criteria.city ? (
                  <span className="rounded-full bg-muted px-2 py-0.5">
                    {search.criteria.city as string}
                  </span>
                ) : null}
                {search.criteria.bedroomsMin ? (
                  <span className="rounded-full bg-muted px-2 py-0.5">
                    {search.criteria.bedroomsMin as number}+ beds
                  </span>
                ) : null}
                {search.criteria.minPrice || search.criteria.maxPrice ? (
                  <span className="rounded-full bg-muted px-2 py-0.5">
                    Price filter
                  </span>
                ) : null}
                {search.is_active ? (
                  <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">
                    Active
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                    Paused
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
