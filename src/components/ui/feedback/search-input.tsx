"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Search input — Input with a search icon and an optional clear button.
 *
 * The clear button only appears when there is text. `onSubmit` is wired
 * so the user can press Enter to fire the search; `onChange` runs on
 * every keystroke for live filtering.
 */
export interface SearchInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "onChange" | "onSubmit"
  > {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  /** Show a clear (×) button when there's text. Defaults to true. */
  clearable?: boolean;
  containerClassName?: string;
}

export const SearchInput = React.forwardRef<
  HTMLInputElement,
  SearchInputProps
>(function SearchInput(
  {
    value,
    onChange,
    onSubmit,
    placeholder = "Search...",
    clearable = true,
    className,
    containerClassName,
    ...rest
  },
  ref,
) {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value);
      }}
      className={cn(
        "relative flex items-center w-full",
        containerClassName,
      )}
    >
      <Search
        aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
      />
      <Input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn("pl-9 pr-9", className)}
        {...rest}
      />
      {clearable && value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </form>
  );
});
