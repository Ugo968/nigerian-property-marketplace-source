"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/feedback";

/**
 * ConfirmDialog — destructive action confirmation (spec Section 32).
 *
 * Features:
 *   - Action-specific button labels (e.g. "Suspend User", "Reject Verification")
 *   - Reason input for high-impact actions
 *   - Loading state during the action
 *   - Destructive style for ban / remove / revoke
 *
 * Use this for:
 *   - ban user
 *   - suspend user
 *   - remove property
 *   - revoke verification
 *   - reject verification
 *   - remove review
 *   - suspend advertiser
 *   - reject campaign
 */

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Button label — be specific (e.g. "Suspend User", not "Continue"). */
  actionLabel: string;
  /** Whether to render the button in destructive style. */
  destructive?: boolean;
  /** Whether to require a reason. */
  requireReason?: boolean;
  /** Minimum length for the reason (when requireReason is true). */
  reasonMinLength?: number;
  /** Maximum length for the reason. */
  reasonMaxLength?: number;
  /** Called when the action is confirmed. */
  onConfirm: (reason: string) => Promise<void> | void;
  /** Optional content shown below the description (e.g. user info). */
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  destructive = false,
  requireReason = false,
  reasonMinLength = 5,
  reasonMaxLength = 500,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset reason + error whenever the dialog opens.
  React.useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
      setPending(false);
    }
  }, [open]);

  const reasonValid = !requireReason || reason.trim().length >= reasonMinLength;

  async function handleConfirm() {
    setError(null);
    setPending(true);
    try {
      await onConfirm(reason.trim());
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {requireReason ? (
          <div className="space-y-1.5 py-2">
            <label htmlFor="confirm-reason" className="text-sm font-medium">
              Reason
              <span className="text-destructive ml-1" aria-hidden="true">*</span>
            </label>
            <Textarea
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={`Explain why (at least ${reasonMinLength} characters)…`}
              maxLength={reasonMaxLength}
              rows={3}
              disabled={pending}
              aria-required="true"
            />
            <p className="text-xs text-muted-foreground">
              {reason.trim().length}/{reasonMaxLength} characters
            </p>
          </div>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">{error}</p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={pending || !reasonValid}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {pending ? <Spinner className="mr-2" /> : null}
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
