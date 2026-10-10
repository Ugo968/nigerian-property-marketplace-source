"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { updatePlatformSettingAction } from "@/lib/admin/actions";
import type { PlatformSettingRow, ReportCategoryRow } from "@/types";

interface Props {
  settings: PlatformSettingRow[];
  reportCategories: ReportCategoryRow[];
}

export function AdminSettingsClient({ settings, reportCategories }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [draftValues, setDraftValues] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  // Initialize draft values from settings on mount.
  React.useEffect(() => {
    const drafts: Record<string, string> = {};
    for (const s of settings) {
      const v = s.value;
      if (typeof v === "string") drafts[s.key] = v;
      else if (typeof v === "number") drafts[s.key] = String(v);
      else if (typeof v === "boolean") drafts[s.key] = v ? "true" : "false";
      else drafts[s.key] = JSON.stringify(v);
    }
    setDraftValues(drafts);
  }, [settings]);

  async function handleSave(key: string) {
    setError(null);
    setPendingKey(key);
    const value = draftValues[key] ?? "";
    const result = await updatePlatformSettingAction({ key, value });
    setPendingKey(null);
    if (!result.ok) {
      setError(result.message ?? `Failed to save ${key}.`);
      return;
    }
    toast({ title: "Setting updated", description: key });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Platform settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure operational platform values. Settings are stored in the
          <code className="text-xs mx-1">platform_settings</code>
          table and applied at the application config layer.
        </p>
      </header>

      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
        <p>
          Secrets are NEVER stored here. Provider API keys, webhook hashes, and service-role
          credentials remain in server-only environment variables — the admin UI cannot
          modify them.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configurable values</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No settings configured.</p>
          ) : (
            settings.map((s) => (
              <div key={s.key} className="flex flex-col sm:flex-row sm:items-end gap-2 pb-3 border-b last:border-b-0">
                <div className="flex-1">
                  <label htmlFor={`setting-${s.key}`} className="text-sm font-medium">
                    {s.key}
                  </label>
                  <p className="text-xs text-muted-foreground mb-1">{s.description}</p>
                  <Input
                    id={`setting-${s.key}`}
                    value={draftValues[s.key] ?? ""}
                    onChange={(e) =>
                      setDraftValues((d) => ({ ...d, [s.key]: e.target.value }))
                    }
                    disabled={!s.is_editable || pendingKey === s.key}
                    className="text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => handleSave(s.key)}
                  disabled={!s.is_editable || pendingKey === s.key}
                >
                  {pendingKey === s.key ? "Saving…" : "Save"}
                </Button>
              </div>
            ))
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Report categories ({reportCategories.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {reportCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No report categories configured.</p>
          ) : (
            <ul className="space-y-1">
              {reportCategories.map((c) => (
                <li key={c.id} className="flex justify-between items-center py-1 border-b last:border-b-0">
                  <div>
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.description ?? "—"}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Severity: {c.severity} · Sort: {c.sort_order}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
