import * as React from "react";
import Link from "next/link";
import { ShieldCheck, AlertTriangle } from "lucide-react";

/**
 * Marketplace-wide safety notice — shown on public listing pages and
 * property detail pages.
 *
 * Per spec Section 8: the platform must prominently warn users to
 * physically inspect and independently verify property existence,
 * ownership, agent identity, details, documents, and payment
 * information before paying.
 */
export function SafetyNotice({ compact = false }: { compact?: boolean }) {
  return (
    <section
      role="note"
      aria-label="Safety warning"
      className={
        compact
          ? "rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-foreground"
          : "rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-foreground"
      }
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-warning"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="font-semibold">
            Always inspect property in person before paying.
          </p>
          {!compact ? (
            <p className="text-muted-foreground">
              Shelty does not verify every listing. Independently confirm
              property existence, ownership, agent identity, property details,
              documents, and payment information before committing to any
              transaction.
            </p>
          ) : null}
          <Link
            href="/safety"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Read our safety guide
          </Link>
        </div>
      </div>
    </section>
  );
}
