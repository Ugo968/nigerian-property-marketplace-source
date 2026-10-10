"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import {
  MANDATORY_CATEGORIES,
  categorySupportsFrequency,
  getNotificationTypeConfig,
  NOTIFICATION_TYPES,
} from "@/lib/notifications";
import type {
  NotificationCategory,
  NotificationPreferenceRow,
  EmailFrequency,
} from "@/types";

/**
 * Notification preferences UI.
 *
 * Pulls all 12 categories from the type catalogue and lets the user
 * toggle in-app + email + (where applicable) frequency.
 *
 * Mandatory categories (security, verification, applications,
 * subscriptions, payments) are shown locked with an explanation.
 */
interface PrefState {
  in_app_enabled: boolean;
  email_enabled: boolean;
  email_frequency: EmailFrequency;
}

export function NotificationPreferences() {
  const [prefs, setPrefs] = React.useState<Record<NotificationCategory, PrefState> | null>(null);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/notifications/preferences", {
        credentials: "same-origin",
      });
      if (!res.ok) {
        setError("Couldn't load preferences.");
        return;
      }
      const data = (await res.json()) as { preferences: NotificationPreferenceRow[] };
      const map = {} as Record<NotificationCategory, PrefState>;
      for (const row of data.preferences) {
        map[row.category] = {
          in_app_enabled: row.in_app_enabled,
          email_enabled: row.email_enabled,
          email_frequency: row.email_frequency,
        };
      }
      setPrefs(map);
    } catch {
      setError("Couldn't load preferences.");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function patch(
    category: NotificationCategory,
    patch: Partial<PrefState>,
  ) {
    if (!prefs) return;
    const next = { ...prefs[category], ...patch };
    setPrefs({ ...prefs, [category]: next });
    setSaving(category);
    setError(null);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, ...next }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't save preference.");
        // Revert on failure.
        setPrefs((prev) => (prev ? { ...prev, [category]: prefs[category] } : prev));
      }
    } catch {
      setError("Couldn't save preference.");
      setPrefs((prev) => (prev ? { ...prev, [category]: prefs[category] } : prev));
    } finally {
      setSaving(null);
    }
  }

  if (!prefs) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  // Render categories in the order from NOTIFICATION_CATEGORIES.
  const categories = Array.from(new Set(NOTIFICATION_TYPES.map((t) => t.category)));

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-md border">
        <div className="grid grid-cols-[1fr_64px_64px_120px] sm:grid-cols-[2fr_80px_80px_140px] gap-2 px-3 py-2 bg-muted/30 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <div>Category</div>
          <div className="text-center">In-app</div>
          <div className="text-center">Email</div>
          <div className="text-center">Frequency</div>
        </div>
        {categories.map((cat) => {
          const isMandatory = MANDATORY_CATEGORIES.has(cat);
          const state = prefs[cat];
          const showFreq = categorySupportsFrequency(cat);
          return (
            <div
              key={cat}
              className="grid grid-cols-[1fr_64px_64px_120px] sm:grid-cols-[2fr_80px_80px_140px] gap-2 px-3 py-3 border-b last:border-b-0 items-center"
            >
              <div>
                <p className="text-sm font-medium capitalize">
                  {formatCategoryLabel(cat)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCategoryDescription(cat)}
                </p>
                {isMandatory && (
                  <p className="text-[10px] text-amber-700 mt-0.5">
                    Mandatory — cannot be disabled.
                  </p>
                )}
              </div>
              <div className="flex justify-center">
                <Switch
                  checked={state.in_app_enabled}
                  disabled={isMandatory || saving === cat}
                  onCheckedChange={(checked) => patch(cat, { in_app_enabled: checked })}
                  aria-label={`In-app notifications for ${cat}`}
                />
              </div>
              <div className="flex justify-center">
                <Switch
                  checked={state.email_enabled}
                  disabled={isMandatory || saving === cat}
                  onCheckedChange={(checked) => patch(cat, { email_enabled: checked })}
                  aria-label={`Email notifications for ${cat}`}
                />
              </div>
              <div className="flex justify-center">
                <select
                  className="text-xs border rounded px-1.5 py-1 bg-background"
                  value={state.email_frequency}
                  disabled={isMandatory || !showFreq || saving === cat || !state.email_enabled}
                  onChange={(e) =>
                    patch(cat, { email_frequency: e.target.value as EmailFrequency })
                  }
                  aria-label={`Email frequency for ${cat}`}
                >
                  <option value="instant">Instant</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="off">Off</option>
                </select>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-md border border-info/30 bg-info/5 p-3 text-xs text-info-foreground">
        <p>
          <strong>Heads up:</strong> transactional emails (verification,
          payment receipts, security events) are always sent instantly
          and cannot be disabled. Marketing emails can be turned off at
          any time. Manage marketing emails via the unsubscribe link in
          any marketing email.
        </p>
      </div>
    </div>
  );
}

function formatCategoryLabel(cat: NotificationCategory): string {
  const map: Record<NotificationCategory, string> = {
    account_security: "Account & Security",
    verification: "Verification",
    properties: "Properties",
    property_alerts: "Property Alerts",
    applications: "Applications",
    messaging: "Messages",
    reviews: "Reviews",
    subscriptions: "Subscriptions",
    payments: "Payments",
    featured: "Featured Listings",
    advertising: "Advertising",
    marketing: "Marketing",
  };
  return map[cat];
}

function formatCategoryDescription(cat: NotificationCategory): string {
  const map: Record<NotificationCategory, string> = {
    account_security: "Login, password changes, security alerts.",
    verification: "Verification status changes.",
    properties: "Your property listings: published, status changes, etc.",
    property_alerts: "Saved-search matches and property alerts.",
    applications: "Agent applications to represent your properties.",
    messaging: "New messages and conversation activity.",
    reviews: "Reviews you receive and submit.",
    subscriptions: "Subscription lifecycle: started, expiring, cancelled.",
    payments: "Payment receipts and failures.",
    featured: "Featured-listing promotions.",
    advertising: "Advertising campaign status.",
    marketing: "Promotional and marketing communication.",
  };
  return map[cat];
}
