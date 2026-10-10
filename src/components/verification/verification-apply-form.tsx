"use client";

import * as React from "react";
import { AlertCircle, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/feedback";
import { OnboardingShell, OnboardingActions } from "@/components/onboarding/onboarding-shell";
import {
  submitVerificationApplication,
  createDraftApplication,
  uploadVerificationDocument,
} from "@/lib/verification/actions";
import type { VerificationTier } from "@/types";
import type { EligibilityResult } from "@/lib/verification/eligibility";

const DOCUMENT_TYPES = [
  { value: "government_id", label: "Government-issued ID" },
  { value: "utility_bill", label: "Utility bill (proof of address)" },
  { value: "proof_of_address", label: "Proof of address" },
  { value: "cac_certificate", label: "CAC registration certificate" },
  { value: "business_license", label: "Business license" },
  { value: "professional_certification", label: "Professional certification" },
  { value: "agent_license", label: "Real-estate agent license" },
  { value: "office_lease", label: "Office lease / proof of office" },
  { value: "other", label: "Other supporting document" },
] as const;

interface VerificationApplyFormProps {
  tier: VerificationTier;
  eligibility: EligibilityResult;
}

export function VerificationApplyForm({
  tier,
  eligibility,
}: VerificationApplyFormProps) {
  const [applicantSummary, setApplicantSummary] = React.useState("");
  const [applicationId, setApplicationId] = React.useState<string | null>(null);
  const [documents, setDocuments] = React.useState<
    Array<{
      id: string;
      documentType: string;
      fileName: string;
      storagePath: string;
    }>
  >([]);
  const [uploading, setUploading] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [topError, setTopError] = React.useState<string | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  // Initialise: create a draft application so documents can be uploaded
  // before the final submit.
  React.useEffect(() => {
    if (applicationId) return;
    if (!eligibility.canApply) return;
    let cancelled = false;
    (async () => {
      const result = await createDraftApplication(tier);
      if (cancelled) return;
      if (result.ok && result.applicationId) {
        setApplicationId(result.applicationId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tier, eligibility.canApply, applicationId]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!applicationId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    // Read the first 16 bytes for MIME sniffing + the full buffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const first16 = bytes.slice(0, 16);
    const firstBytesBase64 = btoa(String.fromCharCode(...first16));
    const fileBufferBase64 = btoa(String.fromCharCode(...bytes));

    const result = await uploadVerificationDocument({
      applicationId,
      documentType: (e.target.dataset.docType as string) ?? "other",
      fileName: file.name,
      clientMimeType: file.type,
      fileSize: file.size,
      firstBytesBase64,
      fileBufferBase64,
    });

    setUploading(false);
    e.target.value = ""; // reset input

    if (!result.ok) {
      setUploadError(result.message ?? "Upload failed.");
      return;
    }

    // Refresh document list (in a real implementation we'd fetch from DB;
    // here we keep a local list for the demo)
    setDocuments((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        documentType: e.target.dataset.docType ?? "other",
        fileName: file.name,
        storagePath: "",
      },
    ]);
  }

  async function handleSubmit() {
    if (!applicationId) {
      setTopError("Application not initialised. Please refresh the page.");
      return;
    }
    setPending(true);
    setTopError(null);
    const result = await submitVerificationApplication({
      tier,
      applicantSummary,
    });
    setPending(false);
    if (!result.ok) {
      setTopError(result.message ?? "Submission failed.");
      return;
    }
    if (result.redirectTo) {
      window.location.href = result.redirectTo;
    }
  }

  if (!eligibility.canApply) {
    return (
      <OnboardingShell
        role={"landlord" as never}
        roleLabel={tier === "bronze" ? "Bronze" : "Blue"}
        steps={["Eligibility", "Documents", "Submit"]}
        currentStep={0}
      >
        <div className="space-y-4">
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-warning flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">You&apos;re not eligible yet</p>
              <p className="mt-1 text-muted-foreground">
                Address the following before applying:
              </p>
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            {eligibility.blockingReasons.map((reason, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 rounded-md border bg-muted/30 p-2"
              >
                <X
                  className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                {reason}
              </li>
            ))}
          </ul>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      role={"landlord" as never}
      roleLabel={tier === "bronze" ? "Bronze" : "Blue"}
      steps={["Eligibility", "Documents", "Submit"]}
      currentStep={1}
    >
      <form className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {tier === "bronze" ? "Bronze" : "Blue"} verification application
          </h2>
          <p className="text-sm text-muted-foreground">
            Upload the required documents and submit your application for review.
          </p>
        </div>

        {/* Requirements summary */}
        <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-xs font-medium text-foreground mb-2">
            Requirements
          </p>
          <ul className="space-y-1">
            {eligibility.checklist.map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-xs text-muted-foreground"
              >
                {item.complete ? (
                  <span className="text-success">✓</span>
                ) : (
                  <span className="text-warning">○</span>
                )}
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        {/* Document upload */}
        <div className="space-y-2">
          <Label htmlFor="doc-upload">Upload documents</Label>
          <p className="text-xs text-muted-foreground">
            Allowed: JPEG, PNG, WebP, PDF. Max 10 MB per file.
          </p>
          <div className="flex flex-wrap gap-2">
            {DOCUMENT_TYPES.map((dt) => (
              <label
                key={dt.value}
                htmlFor={`doc-${dt.value}`}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <Upload className="h-3 w-3" aria-hidden="true" />
                {dt.label}
                <input
                  id={`doc-${dt.value}`}
                  type="file"
                  className="sr-only"
                  data-doc-type={dt.value}
                  onChange={handleFileChange}
                  disabled={uploading}
                  accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                />
              </label>
            ))}
          </div>

          {uploading ? (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Spinner /> Uploading...
            </p>
          ) : null}

          {uploadError ? (
            <p className="text-sm text-destructive">{uploadError}</p>
          ) : null}

          {documents.length > 0 ? (
            <ul className="space-y-1 pt-2">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between rounded-md border bg-background px-3 py-1.5 text-sm"
                >
                  <span>
                    <span className="font-medium">{doc.documentType}</span>: {doc.fileName}
                  </span>
                  <button
                    type="button"
                    aria-label="Remove document"
                    onClick={() => setDocuments((prev) => prev.filter((d) => d.id !== doc.id))}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* Applicant summary */}
        <div className="space-y-1.5">
          <Label htmlFor="applicantSummary">Summary (optional)</Label>
          <Textarea
            id="applicantSummary"
            value={applicantSummary}
            onChange={(e) => setApplicantSummary(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Anything you'd like the reviewer to know?"
          />
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
          onNext={handleSubmit}
          nextLabel={
            pending ? (
              <>
                <Spinner className="mr-2" />
                Submitting...
              </>
            ) : (
              "Submit application"
            )
          }
          pending={pending}
        />
      </form>
    </OnboardingShell>
  );
}
