"use client";

import * as React from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toggleSavedProperty } from "@/lib/search/actions";

/**
 * Save-property button — heart with optimistic UI.
 *
 * Per spec Sections 16, 22, 31:
 *   * Heart icon with accessible label ("Save property" / "Remove from saved")
 *   * Optimistic state (UI updates immediately, server confirms)
 *   * Logged-out users are prompted to sign in (no fake anonymous saves)
 *   * Handles network failure + duplicate-save race conditions
 */
export interface SavePropertyButtonProps {
  propertyId: string;
  isSavedInitially: boolean;
  className?: string;
  variant?: "icon" | "button";
}

export function SavePropertyButton({
  propertyId,
  isSavedInitially,
  className,
  variant = "icon",
}: SavePropertyButtonProps) {
  const router = useRouter();
  const [isSaved, setIsSaved] = React.useState(isSavedInitially);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = React.useState(false);

  async function handleClick() {
    // Optimistic update
    const previousState = isSaved;
    setIsSaved(!isSaved);
    setPending(true);
    setError(null);

    const result = await toggleSavedProperty(propertyId);
    setPending(false);

    // Auth required → prompt sign-in
    if (result.requiresAuth) {
      setIsSaved(previousState); // revert
      setShowAuthPrompt(true);
      return;
    }

    if (!result.ok) {
      // Revert + show error
      setIsSaved(previousState);
      if (result.limitReached) {
        setError(result.message ?? "Save limit reached.");
      } else {
        setError(result.message ?? "We couldn't save the property.");
      }
      return;
    }

    // Server confirmed — update state to match
    setIsSaved(result.saved ?? !previousState);
    router.refresh();
  }

  if (variant === "icon") {
    return (
      <>
        <button
          type="button"
          aria-label={isSaved ? "Remove from saved" : "Save property"}
          aria-pressed={isSaved}
          onClick={handleClick}
          disabled={pending}
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-full transition",
            "bg-background/80 backdrop-blur hover:bg-background",
            isSaved ? "text-destructive" : "text-foreground",
            pending && "opacity-50",
            className,
          )}
        >
          <Heart
            className={cn("h-5 w-5", isSaved && "fill-current")}
            aria-hidden="true"
          />
        </button>
        {error ? (
          <p className="sr-only" role="alert">
            {error}
          </p>
        ) : null}
        {showAuthPrompt ? (
          <p className="sr-only">
            Please <a href={`/login?next=${encodeURIComponent(`/properties/${propertyId}`)}`}>sign in</a> to save this property.
          </p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition",
          isSaved
            ? "border-destructive/30 bg-destructive/5 text-destructive"
            : "border-border bg-background text-foreground hover:bg-muted",
          pending && "opacity-50",
          className,
        )}
      >
        <Heart className={cn("h-4 w-4", isSaved && "fill-current")} aria-hidden="true" />
        {isSaved ? "Saved" : "Save"}
      </button>
      {error ? (
        <p className="text-xs text-destructive mt-1" role="alert">
          {error}
        </p>
      ) : null}
      {showAuthPrompt ? (
        <p className="text-xs text-muted-foreground mt-1">
          <a
            href={`/login?next=${encodeURIComponent(`/properties/${propertyId}`)}`}
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </a>{" "}
          to save this property.
        </p>
      ) : null}
    </>
  );
}
