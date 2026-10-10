"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Password input with a built-in visibility toggle.
 *
 * The toggle has a proper aria-label + accessible button so screen
 * readers announce the state change. The icon is decorative.
 */
export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Label for the visibility toggle button. */
  toggleAriaLabel?: string;
}

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  PasswordInputProps
>(function PasswordInput(
  { className, toggleAriaLabel = "Show password", ...rest },
  ref,
) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative w-full">
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn("pr-10", className)}
        autoComplete="off"
        {...rest}
      />
      <button
        type="button"
        aria-label={toggleAriaLabel}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
});
