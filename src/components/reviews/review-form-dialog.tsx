"use client";

import * as React from "react";
import { AlertCircle, Send } from "lucide-react";
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
import { StarRatingInput } from "./star-rating";
import { createReviewAction } from "@/lib/reviews/actions";
import type { QualifyingInteraction } from "@/lib/reviews/eligibility";

/**
 * Review form dialog.
 *
 * Per spec Section 15, 16, 31:
 *   * Overall rating (required, 1-5 stars)
 *   * Optional title
 *   * Review text (required, min 10 chars)
 *   * Shows why the user is eligible
 *   * Reminder: "Only share truthful information..."
 *   * Accessible star rating input
 *   * Content validated server-side
 */
export function ReviewFormDialog({
  open,
  onOpenChange,
  revieweeId,
  revieweeName,
  qualifyingInteraction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revieweeId: string;
  revieweeName: string;
  qualifyingInteraction?: QualifyingInteraction;
}) {
  const [rating, setRating] = React.useState(0);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});

  async function handleSubmit() {
    setPending(true);
    setError(null);
    setFieldErrors({});

    const result = await createReviewAction({
      revieweeId,
      rating,
      title: title || undefined,
      body,
      applicationId: qualifyingInteraction?.type === "application" ? qualifyingInteraction.id : undefined,
      conversationId: qualifyingInteraction?.type === "conversation" ? qualifyingInteraction.id : undefined,
    });

    setPending(false);

    if (!result.ok) {
      setError(result.message ?? "Failed to submit review.");
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    // Success — close + refresh
    onOpenChange(false);
    setRating(0);
    setTitle("");
    setBody("");
    window.location.reload();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review {revieweeName}</DialogTitle>
          <DialogDescription>
            {qualifyingInteraction?.description ?? "Share your experience based on your marketplace interaction."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Rating */}
          <div className="space-y-1.5">
            <Label>Overall rating *</Label>
            <StarRatingInput value={rating} onChange={setRating} disabled={pending} />
            {fieldErrors.rating ? (
              <p className="text-sm text-destructive">{fieldErrors.rating[0]}</p>
            ) : null}
          </div>

          {/* Title (optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="review-title">Title (optional)</Label>
            <Input
              id="review-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={pending}
              placeholder="Summarise your experience"
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label htmlFor="review-body">
              Review *
            </Label>
            <Textarea
              id="review-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={3000}
              disabled={pending}
              placeholder="Share details about your experience. Be honest and specific."
            />
            <p className="text-xs text-muted-foreground">{body.length} / 3000</p>
            {fieldErrors.body ? (
              <p className="text-sm text-destructive">{fieldErrors.body[0]}</p>
            ) : null}
          </div>

          {/* Reminder (spec Section 15) */}
          <div className="rounded-md border border-info/30 bg-info/5 p-2 text-xs text-info-foreground">
            Only share truthful information based on your actual experience. Do not post private
            information, threats, accusations you cannot substantiate, or abusive content.
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || rating === 0 || body.trim().length < 10}
          >
            {pending ? (
              <>
                <Spinner className="mr-2" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" aria-hidden="true" />
                Submit Review
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
