"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput, Spinner } from "@/components/ui/feedback";
import { resetPasswordAction } from "@/lib/auth/actions";

/**
 * Reset-password form. The reset token has already been verified by
 * Supabase when the user clicked the email link — they have a recovery
 * session at this point. We just call auth.updateUser() with the new
 * password.
 */
export function ResetPasswordForm() {
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [topError, setTopError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<string, string[]>
  >({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setTopError(null);
    setFieldErrors({});

    const result = await resetPasswordAction(password, confirmPassword);
    setPending(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      setTopError(result.message ?? null);
      return;
    }

    if (result.redirectTo) {
      window.location.href = result.redirectTo;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <PasswordInput
          id="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={
            fieldErrors.password ? "password-error" : "password-hint"
          }
          disabled={pending}
        />
        {fieldErrors.password ? (
          <p id="password-error" className="text-sm text-destructive">
            {fieldErrors.password[0]}
          </p>
        ) : (
          <p id="password-hint" className="text-xs text-muted-foreground">
            Min 8 chars, with upper + lower + number.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
          aria-invalid={Boolean(fieldErrors.confirmPassword)}
          aria-describedby={
            fieldErrors.confirmPassword ? "confirmPassword-error" : undefined
          }
          disabled={pending}
          toggleAriaLabel="Show confirm password"
        />
        {fieldErrors.confirmPassword ? (
          <p id="confirmPassword-error" className="text-sm text-destructive">
            {fieldErrors.confirmPassword[0]}
          </p>
        ) : null}
      </div>

      {topError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{topError}</span>
        </div>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Spinner className="mr-2" />
            Resetting password...
          </>
        ) : (
          "Reset password"
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
