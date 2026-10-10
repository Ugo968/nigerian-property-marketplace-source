"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput, Spinner } from "@/components/ui/feedback";
import { loginAction } from "@/lib/auth/actions";
import type { LoginInput } from "@/lib/validation";

/**
 * Login form. Calls loginAction server action which:
 *   1. Validates with Zod
 *   2. Rate-limits by IP (login: 10 attempts/hour)
 *   3. Calls Supabase Auth.signInWithPassword()
 *   4. Reads profile → routes to /onboarding/{role} OR /dashboard
 *      OR /account-suspended
 *
 * The `next` query param preserves the deep link the user was trying to
 * reach (e.g. /properties/123) so we can return them after auth.
 */
export function LoginForm() {
  const search = useSearchParams();
  const next = search.get("next");
  const wasReset = search.get("reset") === "1";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [topError, setTopError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<
    Record<string, string[]>
  >({});

  React.useEffect(() => {
    if (wasReset) {
      setTopError(null);
    }
  }, [wasReset]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setTopError(null);
    setFieldErrors({});

    const input: LoginInput = { email, password };
    const result = await loginAction(input, next ?? undefined);

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
      {wasReset ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Your password was reset. You can sign in with your new password.</span>
        </div>
      ) : null}

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

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-xs text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={
            fieldErrors.password ? "password-error" : undefined
          }
          disabled={pending}
        />
        {fieldErrors.password ? (
          <p id="password-error" className="text-sm text-destructive">
            {fieldErrors.password[0]}
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
            Signing in...
          </>
        ) : (
          "Sign in"
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}
