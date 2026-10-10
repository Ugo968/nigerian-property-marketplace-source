"use client";

import * as React from "react";
import { AlertCircle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/feedback";
import { OnboardingShell, OnboardingActions } from "./onboarding-shell";
import { submitCompanyOnboarding } from "@/lib/auth/onboarding-actions";
import { computeProfileCompleteness } from "@/lib/profiles/completeness";
import type { ProfileRow, CompanyProfileRow } from "@/types";

interface CompanyOnboardingFormProps {
  profile: ProfileRow;
  company: CompanyProfileRow | null;
}

const STEPS = ["Company", "Office", "Business"];

const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa",
  "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
  "Ekiti", "Enugu", "FCT - Abuja", "Gombe", "Imo", "Jigawa",
  "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau",
  "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
];

export function CompanyOnboardingForm({
  profile,
  company,
}: CompanyOnboardingFormProps) {
  const [step, setStep] = React.useState(0);

  const [companyName, setCompanyName] = React.useState(
    company?.company_name ?? profile.full_name,
  );
  const [companyLogoUrl, setCompanyLogoUrl] = React.useState(
    company?.company_logo_url ?? "",
  );
  const [companyDescription, setCompanyDescription] = React.useState(
    company?.company_description ?? "",
  );
  const [officeAddress, setOfficeAddress] = React.useState(
    company?.office_address ?? "",
  );
  const [officeState, setOfficeState] = React.useState(
    company?.office_state ?? "",
  );
  const [officeLga, setOfficeLga] = React.useState(company?.office_lga ?? "");
  const [contactPhone, setContactPhone] = React.useState(profile.phone ?? "");
  const [contactEmail, setContactEmail] = React.useState(
    // auth.users.email is not in profiles; client falls back to empty
    // and lets the user re-enter.
    "",
  );
  const [website, setWebsite] = React.useState(company?.website ?? "");
  const [cacRegistered, setCacRegistered] = React.useState(
    company?.cac_registered ?? false,
  );
  const [cacRegistrationNumber, setCacRegistrationNumber] = React.useState(
    company?.cac_registration_number ?? "",
  );
  const [socialHandles, setSocialHandles] = React.useState<
    Record<string, string>
  >(company?.social_handles ?? (profile.social_handles ?? {}));
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

    if (step === 0) {
      if (!companyName.trim()) {
        setStepError("Company name is required");
        return;
      }
      if (companyDescription.length < 20) {
        setStepError("Company description must be at least 20 characters");
        return;
      }
    } else if (step === 1) {
      if (!officeAddress.trim()) {
        setStepError("Office address is required");
        return;
      }
      if (!officeState.trim()) {
        setStepError("Office state is required");
        return;
      }
    }

    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }

    setPending(true);
    setTopError(null);
    setFieldErrors({});

    const result = await submitCompanyOnboarding({
      companyName,
      companyLogoUrl,
      companyDescription,
      officeAddress,
      officeState,
      officeLga,
      contactPhone,
      contactEmail,
      website,
      cacRegistered,
      cacRegistrationNumber,
      socialHandles,
    });

    setPending(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      setTopError(result.message ?? null);
      if (result.fieldErrors) {
        const keys = Object.keys(result.fieldErrors);
        if (
          keys.some((k) =>
            ["companyName", "companyLogoUrl", "companyDescription"].includes(k),
          )
        ) {
          setStep(0);
        } else if (
          keys.some((k) =>
            [
              "officeAddress",
              "officeState",
              "officeLga",
              "contactPhone",
              "contactEmail",
              "website",
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

  // Live completeness preview.
  const completeness = computeProfileCompleteness(
    "company",
    {
      ...profile,
      full_name: companyName,
      phone: contactPhone || null,
      avatar_url: companyLogoUrl || null,
      social_handles: socialHandles,
    },
    company
      ? {
          ...company,
          company_name: companyName,
          company_logo_url: companyLogoUrl || null,
          company_description: companyDescription,
          office_address: officeAddress,
          office_state: officeState,
          office_lga: officeLga || null,
          website: website || null,
          cac_registered: cacRegistered,
          cac_registration_number: cacRegistrationNumber || null,
          social_handles: socialHandles,
        }
      : null,
  );

  return (
    <OnboardingShell
      role="company"
      roleLabel="Company"
      steps={STEPS}
      currentStep={step}
    >
      <div className="space-y-5">
        {step === 0 ? (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Company basics</h2>
              <p className="text-sm text-muted-foreground">
                Tell clients who your company is.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="companyName">
                Company name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="companyLogoUrl">Company logo URL</Label>
              <Input
                id="companyLogoUrl"
                value={companyLogoUrl}
                onChange={(e) => setCompanyLogoUrl(e.target.value)}
                placeholder="https://..."
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="companyDescription">
                Company description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="companyDescription"
                value={companyDescription}
                onChange={(e) => setCompanyDescription(e.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="What does your company do? What kinds of property do you specialise in?"
                disabled={pending}
              />
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Office & contact</h2>
              <p className="text-sm text-muted-foreground">
                Where can clients find you?
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="officeAddress">
                Office address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="officeAddress"
                value={officeAddress}
                onChange={(e) => setOfficeAddress(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="officeState">
                  State <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="officeState"
                  list="nigerian-states"
                  value={officeState}
                  onChange={(e) => setOfficeState(e.target.value)}
                  disabled={pending}
                />
                <datalist id="nigerian-states">
                  {NIGERIAN_STATES.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="officeLga">LGA (optional)</Label>
                <Input
                  id="officeLga"
                  value={officeLga}
                  onChange={(e) => setOfficeLga(e.target.value)}
                  disabled={pending}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="contactPhone">
                  Contact phone <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contactPhone"
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contactEmail">
                  Contact email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="company@example.com"
                  disabled={pending}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="website">Website (optional)</Label>
              <Input
                id="website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
                disabled={pending}
              />
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Business information</h2>
              <p className="text-sm text-muted-foreground">
                CAC registration helps clients trust your business. Adding
                it does NOT automatically grant Blue verification — that
                requires admin review of your CAC certificate.
              </p>
            </div>
            <div className="space-y-3">
              <label
                htmlFor="cacRegistered"
                className="flex items-start gap-3 text-sm cursor-pointer"
              >
                <Checkbox
                  id="cacRegistered"
                  checked={cacRegistered}
                  onCheckedChange={(v) => setCacRegistered(v === true)}
                  disabled={pending}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-foreground">
                    This company is CAC-registered
                  </span>
                  <span className="block text-muted-foreground">
                    Tick this if your company is registered with the
                    Corporate Affairs Commission of Nigeria.
                  </span>
                </span>
              </label>
              {cacRegistered ? (
                <div className="space-y-1.5">
                  <Label htmlFor="cacRegistrationNumber">
                    CAC registration number
                  </Label>
                  <Input
                    id="cacRegistrationNumber"
                    value={cacRegistrationNumber}
                    onChange={(e) =>
                      setCacRegistrationNumber(e.target.value)
                    }
                    placeholder="e.g. RC1234567"
                    disabled={pending}
                  />
                </div>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Social media handles</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Platform (e.g. linkedin)"
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
