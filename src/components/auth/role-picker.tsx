"use client";

import * as React from "react";
import { Building2, Home, User, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/types";

/**
 * Role picker for the signup form.
 *
 * Three options, exactly one selectable. Per spec Section 5, each option
 * has a title + short description + visual distinction + selected state.
 *
 * The selection is communicated to the parent form via the `value` +
 * `onChange` props. The parent form's hidden Zod schema enforces role is
 * one of landlord/agent/company server-side.
 */
export interface RolePickerProps {
  value: UserRole | null;
  onChange: (role: UserRole) => void;
  /** Render with an error border (when the parent form has a role error). */
  hasError?: boolean;
  /** Name for the underlying radio group, for form submission. */
  name?: string;
}

const ROLE_ICON: Record<UserRole, React.ElementType> = {
  landlord: Home,
  agent: User,
  company: Building2,
  tenant: Search,
};

export function RolePicker({
  value,
  onChange,
  hasError,
  name = "role",
}: RolePickerProps) {
  const roles: UserRole[] = ["landlord", "agent", "company", "tenant"];
  return (
    <fieldset
      aria-label="Choose your marketplace role"
      className={cn(
        "space-y-2",
        hasError && "rounded-md ring-2 ring-destructive p-2",
      )}
    >
      <legend className="sr-only">Marketplace role</legend>
      {roles.map((role) => {
        const Icon = ROLE_ICON[role];
        const selected = value === role;
        return (
          <label
            key={role}
            htmlFor={`role-${role}`}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition",
              "hover:bg-muted/50",
              selected
                ? "bg-primary/5 ring-2 ring-primary"
                : "border-border bg-background",
            )}
          >
            <input
              id={`role-${role}`}
              type="radio"
              name={name}
              value={role}
              checked={selected}
              onChange={() => onChange(role)}
              className="sr-only"
              aria-describedby={`role-${role}-desc`}
            />
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                selected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {ROLE_LABELS[role]}
              </p>
              <p
                id={`role-${role}-desc`}
                className="text-sm text-muted-foreground mt-0.5"
              >
                {ROLE_DESCRIPTIONS[role]}
              </p>
            </div>
            <div className="flex items-center h-5" aria-hidden="true">
              <div
                className={cn(
                  "h-4 w-4 rounded-full border-2",
                  selected
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/40",
                )}
              >
                {selected ? (
                  <div className="h-2 w-2 rounded-full bg-primary-foreground m-auto mt-[3px]" />
                ) : null}
              </div>
            </div>
          </label>
        );
      })}
    </fieldset>
  );
}
