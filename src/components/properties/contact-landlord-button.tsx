"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/feedback";
import { contactLandlordAction } from "@/lib/tenant/actions";

interface Props {
  propertyId: string;
  /** True if the current user is an eligible subscribed tenant. */
  canContact: boolean;
  /** The reason the user can't contact (for the upgrade prompt). */
  cannotContactReason?: string;
}

/**
 * ContactLandlordButton — the "Contact Landlord" CTA on the property
 * detail page (spec Section 5).
 *
 * - If the user is an eligible subscribed tenant, shows a dialog to
 *   write an enquiry message and sends it via the platform messaging system.
 * - If the user is a trial tenant or not subscribed, shows an upgrade prompt.
 * - Never exposes private phone/email — uses the platform messaging system.
 */
export function ContactLandlordButton({
  propertyId,
  canContact,
  cannotContactReason,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSend() {
    setError(null);
    setPending(true);
    const result = await contactLandlordAction({ propertyId, message });
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to send enquiry.");
      return;
    }
    setOpen(false);
    setMessage("");
    router.push(`/dashboard/messages`);
  }

  if (!canContact) {
    return (
      <div className="space-y-2">
        <Button disabled className="w-full" aria-label="Contact landlord — subscription required">
          Contact Landlord
        </Button>
        <p className="text-xs text-muted-foreground">
          {cannotContactReason ?? "Subscribe to contact landlords directly."}
        </p>
      </div>
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="w-full">
        Contact Landlord
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contact the landlord</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              <p>
                <strong>Stay safe:</strong> Always inspect the property in
                person and independently verify the owner, ownership documents,
                and payment information before making any payment or commitment.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Write a short enquiry. The landlord will receive your message
              through Shelty's secure messaging system. Your phone number
              and email are NOT shared.
            </p>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Hi, I'm interested in this property. Is it still available? When can I schedule an inspection?"
              aria-label="Enquiry message"
            />
            <p className="text-xs text-muted-foreground">
              {message.length}/2000 characters
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={pending || message.trim().length < 10}>
              {pending ? <Spinner className="mr-2" /> : null}
              Send enquiry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
