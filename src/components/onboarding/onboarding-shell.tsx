import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Onboarding shell — wraps role-specific onboarding forms.
 *
 * Provides:
 *   - Page header with role title + step indicator
 *   - Card-style content area
 *   - A back link to /onboarding
 *
 * The role-specific onboarding pages compose this shell with their
 * multi-step form components.
 */
export interface OnboardingShellProps {
  role: "landlord" | "agent" | "company";
  roleLabel: string;
  steps: string[];
  currentStep: number;
  children: React.ReactNode;
}

export function OnboardingShell({
  role,
  roleLabel,
  steps,
  currentStep,
  children,
}: OnboardingShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <header className="border-b bg-background">
        <div className="container mx-auto h-16 px-4 flex items-center justify-between">
          <Link
            href={`/onboarding/${role}`}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Back to onboarding
          </Link>
          <span className="text-sm font-medium text-foreground">
            {roleLabel} setup
          </span>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Step indicator */}
          <nav aria-label="Onboarding progress">
            <ol className="flex items-center gap-2 mb-8">
              {steps.map((label, idx) => {
                const isComplete = idx < currentStep;
                const isCurrent = idx === currentStep;
                return (
                  <li key={label} className="flex items-center gap-2 flex-1">
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        isComplete && "bg-primary text-primary-foreground",
                        isCurrent && "bg-primary text-primary-foreground ring-2 ring-primary/30",
                        !isComplete && !isCurrent && "bg-muted text-muted-foreground",
                      )}
                      aria-current={isCurrent ? "step" : undefined}
                    >
                      {isComplete ? "✓" : idx + 1}
                    </div>
                    <span
                      className={cn(
                        "text-xs hidden sm:inline",
                        isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {label}
                    </span>
                    {idx < steps.length - 1 ? (
                      <div
                        className={cn(
                          "h-px flex-1 ml-2",
                          idx < currentStep ? "bg-primary" : "bg-border",
                        )}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="rounded-lg border bg-background p-6 shadow-sm">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Action area for the bottom of each onboarding step — keeps the
 * Next / Back buttons aligned and styled consistently.
 */
export function OnboardingActions({
  onBack,
  onNext,
  nextLabel = "Continue",
  pending,
  backLabel = "Back",
  hideBack = false,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  pending?: boolean;
  backLabel?: string;
  hideBack?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      {hideBack ? (
        <span />
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          disabled={pending}
        >
          {backLabel}
        </Button>
      )}
      <Button type="submit" onClick={onNext} disabled={pending}>
        {nextLabel}
      </Button>
    </div>
  );
}
