"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/feedback";
import { reportProperty } from "@/lib/properties/media-actions";

/**
 * Report-property dialog — used on the public property page.
 *
 * Per spec Section 34: integrate the existing reporting system.
 */
export function ReportPropertyDialog({ propertyId }: { propertyId: string }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function handleSubmit() {
    setPending(true);
    setError(null);
    setSuccess(false);
    const result = await reportProperty({
      propertyId,
      reason,
      description,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to submit report");
      return;
    }
    setSuccess(true);
    setTimeout(() => {
      setOpen(false);
      setSuccess(false);
      setReason("");
      setDescription("");
    }, 2000);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Report listing
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this listing</DialogTitle>
          <DialogDescription>
            Help us keep Shelty safe. Tell us what&apos;s wrong with this
            listing. Your report will be reviewed by our moderation team.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
            Thank you. Your report has been submitted.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="report-reason">Reason</Label>
              <Select value={reason || undefined} onValueChange={setReason} disabled={pending}>
                <SelectTrigger id="report-reason">
                  <SelectValue placeholder="Choose a reason..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fake_listing">Fake listing</SelectItem>
                  <SelectItem value="scam_attempt">Scam attempt</SelectItem>
                  <SelectItem value="wrong_property_info">Wrong property information</SelectItem>
                  <SelectItem value="already_sold_rented">Already sold / rented</SelectItem>
                  <SelectItem value="fraudulent_agent">Fraudulent agent</SelectItem>
                  <SelectItem value="fraudulent_owner">Fraudulent owner</SelectItem>
                  <SelectItem value="suspicious_payment_request">
                    Suspicious payment request
                  </SelectItem>
                  <SelectItem value="inappropriate_content">Inappropriate content</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-description">
                Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="report-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Describe what's wrong. Include as much detail as possible."
                disabled={pending}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={pending || !reason || description.trim().length < 10}
          >
            {pending ? (
              <>
                <Spinner className="mr-2" />
                Submitting...
              </>
            ) : (
              "Submit report"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
