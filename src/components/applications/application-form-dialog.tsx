"use client";

import * as React from "react";
import { AlertCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";
import { VerificationBadge } from "@/components/verification-badge";
import { submitApplication } from "@/lib/applications/actions";

/**
 * Application form dialog — shown when an agent clicks "Apply to Represent"
 * on a property page.
 *
 * Per spec Sections 8, 9, 39, 40:
 *   * Shows property summary (image, title, location, price)
 *   * Shows applicant summary (name, verification badge)
 *   * Collects: message (required), commission/terms (optional), additional info
 *   * Reminder: "Submitting an application does not guarantee acceptance"
 *   * Accessible dialog with proper labels
 *   * Mobile-friendly full-width controls
 */
export interface ApplicationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: {
    id: string;
    title: string;
    area: string | null;
    city: string | null;
    state: string | null;
    price: number;
    priceFrequency: string | null;
    currency: string;
    transactionType: string;
    imageUrl: string | null;
  };
  agent: {
    fullName: string;
    verificationState: string;
  };
}

export function ApplicationFormDialog({
  open,
  onOpenChange,
  property,
  agent,
}: ApplicationFormDialogProps) {
  const [message, setMessage] = React.useState("");
  const [commissionPct, setCommissionPct] = React.useState<string>("");
  const [additionalInfo, setAdditionalInfo] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  async function handleSubmit() {
    setPending(true);
    setError(null);
    setFieldErrors({});

    const result = await submitApplication({
      propertyId: property.id,
      message,
      proposedCommissionPct: commissionPct ? Number(commissionPct) : undefined,
      additionalInfo: additionalInfo ? { notes: additionalInfo } : undefined,
    });

    setPending(false);

    if (!result.ok) {
      setError(result.message ?? "Failed to submit application.");
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    // Success — close + redirect
    onOpenChange(false);
    setMessage("");
    setCommissionPct("");
    setAdditionalInfo("");
    if (result.redirectTo) {
      window.location.href = result.redirectTo;
    }
  }

  const priceDisplay = property.price > 0
    ? new Intl.NumberFormat("en-NG", { style: "currency", currency: property.currency, maximumFractionDigits: 0 }).format(property.price)
    : "Price on request";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply to represent this property</DialogTitle>
          <DialogDescription>
            Submit your application to the property owner for review.
          </DialogDescription>
        </DialogHeader>

        {/* Property summary */}
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-3">
          {property.imageUrl ? (
            <img
              src={property.imageUrl}
              alt={property.title}
              className="h-16 w-16 rounded-md object-cover"
            />
          ) : null}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm line-clamp-1">{property.title}</p>
            <p className="text-xs text-muted-foreground">
              {[property.area, property.city, property.state].filter(Boolean).join(", ")}
            </p>
            <p className="text-sm font-semibold text-primary mt-0.5">
              {priceDisplay}
              {property.priceFrequency ? ` / ${property.priceFrequency.replace(/_/g, " ")}` : ""}
            </p>
          </div>
        </div>

        {/* Agent summary */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Applying as:</span>
          <span className="font-medium">{agent.fullName}</span>
          <VerificationBadge state={agent.verificationState as never} hideWhenNotBadged compact />
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="app-message">
              Application message <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="app-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Introduce yourself, explain why you're a good fit, and what you can offer."
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.message)}
              aria-describedby={fieldErrors.message ? "app-message-error" : undefined}
            />
            {fieldErrors.message ? (
              <p id="app-message-error" className="text-sm text-destructive">
                {fieldErrors.message[0]}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="commission">Proposed commission (%) — optional</Label>
            <Input
              id="commission"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              placeholder="e.g. 5"
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              The percentage of the transaction you propose as commission.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="additional">Additional information — optional</Label>
            <Textarea
              id="additional"
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Any other relevant information (experience, track record, etc.)"
              disabled={pending}
            />
          </div>
        </div>

        {/* Reminder */}
        <div className="rounded-md border border-info/30 bg-info/5 p-2 text-xs text-info-foreground">
          Submitting an application does not guarantee acceptance or representation rights.
        </div>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={pending || message.trim().length < 10}
          >
            {pending ? (
              <>
                <Spinner className="mr-2" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" aria-hidden="true" />
                Submit Application
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
