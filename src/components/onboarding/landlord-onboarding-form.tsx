"use client";

import * as React from "react";
import { AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/feedback";
import { OnboardingShell, OnboardingActions } from "./onboarding-shell";
import { submitLandlordOnboarding } from "@/lib/auth/onboarding-actions";
import { computeProfileCompleteness } from "@/lib/profiles/completeness";
import type { ProfileRow, LandlordProfileRow } from "@/types";

/**
 * Landlord onboarding form. Single-page form (no need for multi-step
 * — landlord has the lightest onboarding), but uses the same shell
 * for visual consistency with agent / company onboarding.
 */
interface LandlordOnboardingFormProps {
  profile: ProfileRow;
  landlord: LandlordProfileRow | null;
}

export function LandlordOnboardingForm({
  profile,
  landlord,
}: LandlordOnboardingFormProps) {
  const [avatarUrl, setAvatarUrl] = React.useState(profile.avatar_url ?? "");
  const [bio, setBio] = React.useState(profile.bio ?? "");
  const [preferredLocation, setPreferredLocation] = React.useState(
    profile.preferred_location ?? "",
  );
  const [preferredContactMethod, setPreferredContactMethod] = React.useState<
    "phone" | "email" | "whatsapp" | ""
  >((landlord?.preferred_contact_method ?? "") as never);
  const [preferredContactValue, setPreferredContactValue] = React.useState(
    landlord?.preferred_contact_value ?? "",
  );
  const [ownershipSummary, setOwnershipSummary] = React.useState(
    landlord?.ownership_summary ?? "",
  );

  const [pending, setPending] = React.useState(false);
  const [topError, setTopError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<string, string[]>
  >({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setTopError(null);
    setFieldErrors({});

    const result = await submitLandlordOnboarding({
      avatarUrl,
      bio,
      preferredLocation,
      preferredContactMethod: preferredContactMethod || undefined,
      preferredContactValue,
      ownershipSummary,
    });

    setPending(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      setTopError(result.message ?? null);
      return;
    }

    if (result.redirectTo) {
      window.location.href = result.redirectTo;
    }
  }

  // Live completeness preview
  const completeness = computeProfileCompleteness(
    "landlord",
    {
      ...profile,
      avatar_url: avatarUrl || null,
      bio: bio || null,
      preferred_location: preferredLocation || null,
    },
    landlord
      ? {
          ...landlord,
          preferred_contact_method: (preferredContactMethod ||
            null) as never,
          preferred_contact_value: preferredContactValue || null,
          ownership_summary: ownershipSummary || null,
        }
      : null,
  );

  return (
    <OnboardingShell
      role="landlord"
      roleLabel="Landlord"
      steps={["Profile basics"]}
      currentStep={0}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Tell us about yourself</h2>
          <p className="text-sm text-muted-foreground">
            Full name, email and phone are already on file. Add the rest
            to complete your profile.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="avatarUrl">Profile photo URL</Label>
          <Input
            id="avatarUrl"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            Upload via the dashboard later — for now paste a URL or skip.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="preferredLocation">
            Preferred location <span className="text-destructive">*</span>
          </Label>
          <Input
            id="preferredLocation"
            value={preferredLocation}
            onChange={(e) => setPreferredLocation(e.target.value)}
            placeholder="e.g. Lekki, Lagos"
            required
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.preferredLocation)}
          />
          {fieldErrors.preferredLocation ? (
            <p className="text-sm text-destructive">
              {fieldErrors.preferredLocation[0]}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bio">Short bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short introduction to who you are."
            rows={3}
            maxLength={500}
            disabled={pending}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="preferredContactMethod">Preferred contact</Label>
            <Select
              value={preferredContactMethod || undefined}
              onValueChange={(v) =>
                setPreferredContactMethod(v as "phone" | "email" | "whatsapp")
              }
              disabled={pending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="phone">Phone call</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="preferredContactValue">Contact value</Label>
            <Input
              id="preferredContactValue"
              value={preferredContactValue}
              onChange={(e) => setPreferredContactValue(e.target.value)}
              placeholder="e.g. 0803 123 4567"
              disabled={pending}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ownershipSummary">Ownership summary</Label>
          <Textarea
            id="ownershipSummary"
            value={ownershipSummary}
            onChange={(e) => setOwnershipSummary(e.target.value)}
            placeholder="Briefly describe the kinds of property you own / manage."
            rows={2}
            maxLength={500}
            disabled={pending}
          />
        </div>

        {/* Live completeness */}
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-medium text-foreground">
              Profile completeness
            </span>
            <span className="text-muted-foreground">
              {completeness.percentage}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${completeness.percentage}%` }}
            />
          </div>
        </div>

        {topError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{topError}</span>
          </div>
        ) : null}

        <OnboardingActions
          hideBack
          nextLabel={
            completeness.meetsMinimum ? (
              "Finish & continue"
            ) : (
              "Continue"
            )
          }
          pending={pending}
        />
      </form>
    </OnboardingShell>
  );
}
