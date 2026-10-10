"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/feedback";
import { forgotPasswordAction } from "@/lib/auth/actions";

/**
 * Forgot-password request form. Per spec Section 24, we do NOT reveal
 * whether an account with the entered email exists — the same success
 * message is shown whether or not the email is registered.
 */
export function ForgotPasswordForm() {
  const search = useSearchParams();
  const sentTo = search.get("email");
  const wasSent = search.get("sent") === "1" && Boolean(sentTo);

  const [email, setEmail] = React.useState(sentTo ?? "");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<string, string[]>
  >({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const result = await forgotPasswordAction(email);
    setPending(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      setError(result.message ?? null);
      return;
    }

    if (result.redirectTo) {
      window.location.href = result.redirectTo;
    }
  }

  if (wasSent) {
    return (
      <div className="space-y-5">
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 p-4 text-sm"
        >
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-success"
            aria-hidden="true"
          />
          <div>
            <p className="font-medium text-success">Check your email</p>
            <p className="mt-1 text-muted-foreground">
              If an account exists for{" "}
              <span className="font-medium">{sentTo}</span>, we&apos;ve sent
              a password reset link. The link expires in 1 hour.
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Didn&apos;t get the email?{" "}
          <button
            type="button"
            onClick={() => {
              window.location.href = "/forgot-password";
            }}
            className="font-medium text-primary hover:underline"
          >
            Try a different email
          </button>
        </p>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          disabled={pending}
        />
        {fieldErrors.email ? (
          <p id="email-error" className="text-sm text-destructive">
            {fieldErrors.email[0]}
          </p>
        ) : null}
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

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Spinner className="mr-2" />
            Sending reset link...
          </>
        ) : (
          "Send reset link"
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Remember your password?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
