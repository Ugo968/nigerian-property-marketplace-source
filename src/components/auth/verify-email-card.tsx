"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { resendVerificationAction } from "@/lib/auth/actions";

/**
 * Email-verification state page. Shown after signup when Supabase
 * requires email confirmation before granting full auth.
 *
 * Per spec Section 7:
 *   - Clear "Check your email" message
 *   - Resend verification email button (rate-limited server-side)
 *   - Don't reveal unnecessary info that could assist account enumeration
 */
export function VerifyEmailCard({ email }: { email: string }) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resent, setResent] = React.useState(false);

  async function handleResend() {
    setPending(true);
    setError(null);
    const result = await resendVerificationAction(email);
    setPending(false);
    if (!result.ok) {
      setError(result.message ?? null);
      return;
    }
    setResent(true);
  }

  return (
    <div className="space-y-5">
      <div className="text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MailCheck className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">
          Check your email
        </h2>
        <p className="text-sm text-muted-foreground">
          We&apos;ve sent a verification link to{" "}
          <span className="font-medium text-foreground">{email}</span>.
          Click the link in the email to confirm your account.
        </p>
      </div>

      {resent ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>We&apos;ve sent a new verification email. Check your inbox.</span>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={handleResend}
        >
          {pending ? (
            <>
              <Spinner className="mr-2" />
              Sending...
            </>
          ) : (
            "Resend verification email"
          )}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already verified?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          Wrong email?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Start over
          </Link>
        </p>
      </div>
    </div>
  );
}
