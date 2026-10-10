"use client";

import * as React from "react";
import { AlertCircle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/feedback";
import { OnboardingShell, OnboardingActions } from "./onboarding-shell";
import { submitAgentOnboarding } from "@/lib/auth/onboarding-actions";
import { computeProfileCompleteness } from "@/lib/profiles/completeness";
import type { ProfileRow, AgentProfileRow } from "@/types";

interface AgentOnboardingFormProps {
  profile: ProfileRow;
  agent: AgentProfileRow | null;
}

const STEPS = ["Profile", "Professional", "Presence"];

export function AgentOnboardingForm({
  profile,
  agent,
}: AgentOnboardingFormProps) {
  const [step, setStep] = React.useState(0);

  const [avatarUrl, setAvatarUrl] = React.useState(profile.avatar_url ?? "");
  const [bio, setBio] = React.useState(
    agent?.professional_description ?? profile.bio ?? "",
  );
  const [professionalName, setProfessionalName] = React.useState(
    agent?.professional_name ?? profile.full_name,
  );
  const [yearsOfExperience, setYearsOfExperience] = React.useState<number | "">(
    agent?.years_of_experience ?? "",
  );
  const [areasServed, setAreasServed] = React.useState<string[]>(
    profile.areas_served ?? [],
  );
  const [agencyName, setAgencyName] = React.useState(agent?.agency_name ?? "");
  const [licenseNumber, setLicenseNumber] = React.useState(
    agent?.license_number ?? "",
  );
  const [licenseIssuingBody, setLicenseIssuingBody] = React.useState(
    agent?.license_issuing_body ?? "",
  );
  const [portfolioUrl, setPortfolioUrl] = React.useState(
    agent?.portfolio_url ?? "",
  );
  const [socialHandles, setSocialHandles] = React.useState<
    Record<string, string>
  >(profile.social_handles ?? {});
  const [newHandleKey, setNewHandleKey] = React.useState("");
  const [newHandleValue, setNewHandleValue] = React.useState("");

  const [pending, setPending] = React.useState(false);
  const [topError, setTopError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<string, string[]>
  >({});
  const [stepError, setStepError] = React.useState<string | null>(null);

  async function handleNext() {
    setStepError(null);

    // Validate the current step before advancing.
    if (step === 0) {
      if (!professionalName.trim()) {
        setStepError("Professional name is required");
        return;
      }
      if (bio.length < 10) {
        setStepError("Bio must be at least 10 characters");
        return;
      }
    } else if (step === 1) {
      if (yearsOfExperience === "" || isNaN(Number(yearsOfExperience))) {
        setStepError("Years of experience is required");
        return;
      }
      if (areasServed.length === 0) {
        setStepError("Add at least one area you serve");
        return;
      }
    }

    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }

    // Final step → submit.
    setPending(true);
    setTopError(null);
    setFieldErrors({});

    const result = await submitAgentOnboarding({
      avatarUrl,
      bio,
      professionalName,
      yearsOfExperience: Number(yearsOfExperience),
      areasServed,
      agencyName,
      licenseNumber,
      licenseIssuingBody,
      portfolioUrl,
      socialHandles,
    });

    setPending(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      setTopError(result.message ?? null);
      // Try to send the user to the step with the first error.
      if (result.fieldErrors) {
        const keys = Object.keys(result.fieldErrors);
        if (
          keys.some((k) =>
            ["bio", "professionalName", "avatarUrl"].includes(k),
          )
        ) {
          setStep(0);
        } else if (
          keys.some((k) =>
            [
              "yearsOfExperience",
              "areasServed",
              "agencyName",
              "licenseNumber",
              "licenseIssuingBody",
            ].includes(k),
          )
        ) {
          setStep(1);
        } else {
          setStep(2);
        }
      }
      return;
    }

    if (result.redirectTo) {
      window.location.href = result.redirectTo;
    }
  }

  function handleBack() {
    setStep(Math.max(0, step - 1));
    setStepError(null);
  }

  function addArea(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (areasServed.includes(trimmed)) return;
    if (areasServed.length >= 20) return;
    setAreasServed([...areasServed, trimmed]);
  }

  function removeArea(idx: number) {
    setAreasServed(areasServed.filter((_, i) => i !== idx));
  }

  function addSocialHandle() {
    const key = newHandleKey.trim().toLowerCase();
    if (!key || !newHandleValue.trim()) return;
    setSocialHandles({ ...socialHandles, [key]: newHandleValue.trim() });
    setNewHandleKey("");
    setNewHandleValue("");
  }

  function removeSocialHandle(key: string) {
    const next = { ...socialHandles };
    delete next[key];
    setSocialHandles(next);
  }

  // Live completeness preview using current form state.
  const completeness = computeProfileCompleteness(
    "agent",
    {
      ...profile,
      avatar_url: avatarUrl || null,
      bio: bio || null,
      areas_served: areasServed,
      social_handles: socialHandles,
    },
    agent
      ? {
          ...agent,
          professional_name: professionalName,
          years_of_experience:
            yearsOfExperience === "" ? null : Number(yearsOfExperience),
          agency_name: agencyName || null,
          license_number: licenseNumber || null,
          license_issuing_body: licenseIssuingBody || null,
          professional_description: bio,
          portfolio_url: portfolioUrl || null,
        }
      : null,
  );

  return (
    <OnboardingShell
      role="agent"
      roleLabel="Agent"
      steps={STEPS}
      currentStep={step}
    >
      <div className="space-y-5">
        {step === 0 ? (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Profile basics</h2>
              <p className="text-sm text-muted-foreground">
                How clients will see you on Shelty.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="professionalName">
                Professional / display name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="professionalName"
                value={professionalName}
                onChange={(e) => setProfessionalName(e.target.value)}
                disabled={pending}
              />
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bio">
                Bio <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="Tell potential clients about your work, your approach, and what makes you stand out."
                disabled={pending}
              />
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Professional information</h2>
              <p className="text-sm text-muted-foreground">
                Your experience and the areas you cover.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="yearsOfExperience">
                  Years of experience <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="yearsOfExperience"
                  type="number"
                  min={0}
                  max={80}
                  value={yearsOfExperience}
                  onChange={(e) =>
                    setYearsOfExperience(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agencyName">Agency / company name</Label>
                <Input
                  id="agencyName"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  disabled={pending}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="licenseNumber">License number</Label>
                <Input
                  id="licenseNumber"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="licenseIssuingBody">Issuing body</Label>
                <Input
                  id="licenseIssuingBody"
                  value={licenseIssuingBody}
                  onChange={(e) => setLicenseIssuingBody(e.target.value)}
                  placeholder="e.g. Nigerian Institution of Estate Surveyors and Valuers"
                  disabled={pending}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                Areas served <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="areaInput"
                  placeholder="e.g. Lekki"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const target = e.target as HTMLInputElement;
                      addArea(target.value);
                      target.value = "";
                    }
                  }}
                  disabled={pending}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const input = document.getElementById(
                      "areaInput",
                    ) as HTMLInputElement | null;
                    if (input) {
                      addArea(input.value);
                      input.value = "";
                    }
                  }}
                  disabled={pending}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add
                </Button>
              </div>
              {areasServed.length > 0 ? (
                <ul className="flex flex-wrap gap-2 pt-1">
                  {areasServed.map((area, idx) => (
                    <li
                      key={`${area}-${idx}`}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                    >
                      {area}
                      <button
                        type="button"
                        aria-label={`Remove ${area}`}
                        onClick={() => removeArea(idx)}
                        className="ml-1"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {fieldErrors.areasServed ? (
                <p className="text-sm text-destructive">
                  {fieldErrors.areasServed[0]}
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Online presence</h2>
              <p className="text-sm text-muted-foreground">
                Optional — but a portfolio + social handles help clients
                trust you.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portfolioUrl">Portfolio / website URL</Label>
              <Input
                id="portfolioUrl"
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
                placeholder="https://..."
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Social media handles</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Platform (e.g. instagram)"
                  value={newHandleKey}
                  onChange={(e) => setNewHandleKey(e.target.value)}
                  disabled={pending}
                />
                <Input
                  placeholder="@handle"
                  value={newHandleValue}
                  onChange={(e) => setNewHandleValue(e.target.value)}
                  disabled={pending}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addSocialHandle}
                  disabled={pending}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              {Object.keys(socialHandles).length > 0 ? (
                <ul className="space-y-1 pt-1">
                  {Object.entries(socialHandles).map(([k, v]) => (
                    <li
                      key={k}
                      className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-1.5 text-sm"
                    >
                      <span>
                        <span className="font-medium">{k}</span>: {v}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${k}`}
                        onClick={() => removeSocialHandle(k)}
                        disabled={pending}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </>
        ) : null}

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

        {stepError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-warning"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{stepError}</span>
          </div>
        ) : null}

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
          onBack={handleBack}
          onNext={handleNext}
          hideBack={step === 0}
          nextLabel={
            pending
              ? "Saving..."
              : step === STEPS.length - 1
                ? "Finish & continue"
                : "Continue"
          }
          pending={pending}
        />
      </div>
    </OnboardingShell>
  );
}
