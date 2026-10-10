"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Reusable admin search box with debounce.
 *
 * Calls `onChange(value)` after 300ms of no input. The parent component
 * uses the value to filter server-side queries.
 *
 * Accessibility:
 *   - Label is sr-only (visible placeholder is enough for sighted users)
 *   - Clear button has aria-label
 */
interface AdminSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

export function AdminSearch({
  value,
  onChange,
  placeholder = "Search…",
  ariaLabel = "Search",
  className,
}: AdminSearchProps) {
  const [localValue, setLocalValue] = React.useState(value);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  function handleInput(v: string) {
    setLocalValue(v);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => onChange(v), 300);
  }

  function handleClear() {
    setLocalValue("");
    onChange("");
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <label className="sr-only" htmlFor="admin-search">
        {ariaLabel}
      </label>
      <Search
        className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
        aria-hidden="true"
      />
      <Input
        id="admin-search"
        type="search"
        value={localValue}
        onChange={(e) => handleInput(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="pl-8 pr-8"
      />
      {localValue ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
