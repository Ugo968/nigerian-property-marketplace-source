"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Mail, MessageSquare, Phone } from "lucide-react";
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
import { submitProfileReport } from "@/lib/profiles/edit-actions";
import type { PublicProfile } from "@/lib/profiles/public-profile";

/**
 * Contact actions row — appears at the top right of the profile header.
 *
 * Per spec Section 27:
 *   * Message, Call, Email, View Properties actions
 *   * Access respects role / subscription / verification rules / chat
 *     limits / privacy settings
 *
 * The actual messaging system comes in P6. For now, the buttons are
 * wired to placeholder routes / `tel:` / `mailto:` where appropriate.
 * The "View Properties" button links to /properties?owner={id}.
 */

export interface ContactActionsProps {
  profile: PublicProfile;
}

export function ContactActions({ profile }: ContactActionsProps) {
  const isOwnProfile = false; // public profile means not own (own profile is /dashboard/profile)
  const [reportOpen, setReportOpen] = React.useState(false);

  if (isOwnProfile) return null;

  // Build contact info from the profile (respecting privacy + capability)
  const phoneForCall = canShowPhone(profile) ? profilePhone(profile) : null;
  const emailForMail = null; // emails are not exposed publicly by default

  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
      <Button asChild variant="outline" size="sm">
        <Link href={`/properties?owner=${profile.id}`}>
          <Building2 className="h-4 w-4" aria-hidden="true" />
          View properties
        </Link>
      </Button>

      {phoneForCall ? (
        <Button asChild variant="outline" size="sm">
          <a href={`tel:${phoneForCall}`}>
            <Phone className="h-4 w-4" aria-hidden="true" />
            Call
          </a>
        </Button>
      ) : null}

      {emailForMail ? (
        <Button asChild variant="outline" size="sm">
          <a href={`mailto:${emailForMail}`}>
            <Mail className="h-4 w-4" aria-hidden="true" />
            Email
          </a>
        </Button>
      ) : null}

      {/* Message — placeholder until messaging lands in P6 */}
      <Button asChild size="sm">
        <Link href={`/dashboard/messages?new=true&to=${profile.id}`}>
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Message
        </Link>
      </Button>

      <ReportProfileButton
        profileId={profile.id}
        open={reportOpen}
        onOpenChange={setReportOpen}
      />
    </div>
  );
}

function canShowPhone(profile: PublicProfile): boolean {
  // Public profiles don't expose phone by default — only via the
  // messaging system (which respects plan + verification rules).
  // The "Call" button is only shown when the user has explicitly
  // opted in via their privacy settings (future feature). For now,
  // we don't show the call button on public profiles.
  return false;
}

function profilePhone(_profile: PublicProfile): string | null {
  return null;
}

// ---------------------------------------------------------------------------
// Report profile dialog
// ---------------------------------------------------------------------------

function ReportProfileButton({
  profileId,
  open,
  onOpenChange,
}: {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function handleSubmit() {
    setPending(true);
    setError(null);
    setSuccess(false);
    const result = await submitProfileReport({
      reportedProfileId: profileId,
      reason,
      description,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "We couldn't submit your report.");
      return;
    }
    setSuccess(true);
    // Auto-close after 2s
    setTimeout(() => {
      onOpenChange(false);
      setSuccess(false);
      setReason("");
      setDescription("");
    }, 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Report
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this profile</DialogTitle>
          <DialogDescription>
            Help us keep Shelty safe. Tell us what's wrong with this
            profile. Your report will be reviewed by our moderation team.
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
              <Select
                value={reason || undefined}
                onValueChange={setReason}
                disabled={pending}
              >
                <SelectTrigger id="report-reason">
                  <SelectValue placeholder="Choose a reason..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fake_profile">Fake profile</SelectItem>
                  <SelectItem value="fraudulent_agent">Fraudulent agent</SelectItem>
                  <SelectItem value="fraudulent_owner">Fraudulent owner</SelectItem>
                  <SelectItem value="wrong_information">Wrong information</SelectItem>
                  <SelectItem value="harassment">Harassment</SelectItem>
                  <SelectItem value="scam_attempt">Scam attempt</SelectItem>
                  <SelectItem value="suspicious_payment_request">
                    Suspicious payment request
                  </SelectItem>
                  <SelectItem value="inappropriate_content">
                    Inappropriate content
                  </SelectItem>
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
                placeholder="Tell us what happened. Include as much detail as possible."
                disabled={pending}
              />
            </div>

            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
          </div>
        )}

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
