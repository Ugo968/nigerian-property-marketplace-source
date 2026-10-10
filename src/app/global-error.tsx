"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PublicLayout } from "@/components/layout/public-layout";
import { logger } from "@/lib/logging";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to the structured logger — server logs receive this.
    logger.error("Unhandled application error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html>
      <body>
        <PublicLayout>
          <div className="container mx-auto px-4 py-24 max-w-lg text-center">
            <p className="text-6xl font-bold tracking-tight text-destructive">
              500
            </p>
            <h1 className="mt-4 text-2xl font-semibold">
              Something went wrong
            </h1>
            <p className="mt-2 text-muted-foreground">
              We&apos;ve been notified. Please try again — and if the problem
              persists, contact support.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={reset}>Try again</Button>
              <Button asChild variant="outline">
                <Link href="/">Back to home</Link>
              </Button>
            </div>
          </div>
        </PublicLayout>
      </body>
    </html>
  );
}
