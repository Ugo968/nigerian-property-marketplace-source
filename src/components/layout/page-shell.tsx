import * as React from "react";
import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

/**
 * Placeholder page used for routes whose functionality is reserved for
 * a later prompt. Renders a clear "coming next" notice with a return
 * link, instead of pretending the feature is complete.
 */
export interface PageShellProps {
  title: string;
  description?: string;
  /** Where the back button links to. Defaults to "/". */
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
}

export function PageShell({
  title,
  description,
  backHref = "/",
  backLabel = "Back to home",
  children,
}: PageShellProps) {
  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <Card className="border-dashed">
        <CardHeader className="text-center items-center pb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Construction className="h-6 w-6" aria-hidden="true" />
          </div>
          <CardTitle className="mt-3">{title}</CardTitle>
          {description ? (
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {description}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pt-4">
          <p className="text-xs text-muted-foreground">
            This module is reserved for an upcoming implementation prompt
            and is part of the planned foundation roadmap.
          </p>
          {children}
          <Button asChild variant="outline" size="sm">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
