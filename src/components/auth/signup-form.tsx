"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordInput } from "@/components/ui/feedback";
import { Spinner } from "@/components/ui/feedback";
import { RolePicker } from "./role-picker";
import { signupAction } from "@/lib/auth/actions";
import type { UserRole } from "@/types";
import type { SignupInput } from "@/lib/validation";

/**
 * Signup form. Calls the signupAction server action which:
 *   1. Validates with Zod (authoritative, server-side)
 *   2. Rate-limits the request by IP
 *   3. Calls Supabase Auth.signUp()
 *   4. Creates the profile row (idempotent) with the validated role
 *   5. Returns a redirect target
 *
 * The client NEVER submits account_status, verification_status, or
 * subscription values — those are derived / controlled by the server
 * and DB constraints.
 *
 * Per spec Section 29, a malicious user cannot submit
 * `role=company, verification_status=blue, subscription=premium` and
 * obtain those privileges — the server only persists `role` (validated
 * against the landlord/agent/company enum at the DB layer), and
 * verification_state + subscription_tier are set by their column
 * DEFAULTs ('unverified', 'free').
 */
export function SignupForm() {
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [role, setRole] = React.useState<UserRole | null>(null);
  const [acceptSafety, setAcceptSafety] = React.useState(false);

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

    const input: SignupInput = {
      fullName,
      email,
      phone,
      password,
      confirmPassword,
      role: role ?? ("" as unknown as UserRole),
      acceptSafetyWarning: acceptSafety,
    };

    const result = await signupAction(input);
    setPending(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      setTopError(result.message ?? null);
      return;
    }

    // Server returned a redirect — but server actions don't actually
    // navigate. We use window.location for the actual redirect.
    if (result.redirectTo) {
      window.location.href = result.redirectTo;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          required
          aria-invalid={Boolean(fieldErrors.fullName)}
          aria-describedby={fieldErrors.fullName ? "fullName-error" : undefined}
          disabled={pending}
        />
        {fieldErrors.fullName ? (
          <p id="fullName-error" className="text-sm text-destructive">
            {fieldErrors.fullName[0]}
          </p>
        ) : null}
      </div>

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
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          placeholder="e.g. 0803 123 4567"
          required
          aria-invalid={Boolean(fieldErrors.phone)}
          aria-describedby={
            fieldErrors.phone ? "phone-error" : "phone-hint"
          }
          disabled={pending}
        />
        {fieldErrors.phone ? (
          <p id="phone-error" className="text-sm text-destructive">
            {fieldErrors.phone[0]}
          </p>
        ) : (
          <p id="phone-hint" className="text-xs text-muted-foreground">
            We&apos;ll use this to verify your account later.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
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
          <Label htmlFor="confirmPassword">Confirm password</Label>
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
      </div>

      <div className="space-y-2">
        <Label>Choose your role</Label>
        <RolePicker
          value={role}
          onChange={setRole}
          hasError={Boolean(fieldErrors.role)}
        />
        {fieldErrors.role ? (
          <p className="text-sm text-destructive">{fieldErrors.role[0]}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="acceptSafety"
          className="flex items-start gap-3 text-sm cursor-pointer"
        >
          <Checkbox
            id="acceptSafety"
            checked={acceptSafety}
            onCheckedChange={(v) => setAcceptSafety(v === true)}
            disabled={pending}
            className="mt-0.5"
          />
          <span className="text-muted-foreground">
            I understand that Shelty does not verify every listing and
            that I must independently inspect property, verify ownership,
            and confirm agent identity before paying.
          </span>
        </label>
        {fieldErrors.acceptSafetyWarning ? (
          <p className="text-sm text-destructive">
            {fieldErrors.acceptSafetyWarning[0]}
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
            Creating account...
          </>
        ) : (
          "Create account"
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>

      <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/5 p-3 text-xs text-info-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          We never store passwords in plain text. Your account uses
          Supabase Auth with secure password hashing.
        </span>
      </div>
    </form>
  );
}
