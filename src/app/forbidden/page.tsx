import Link from "next/link";
import { Button } from "@/components/ui/button";
import { privateRouteMetadata } from "@/lib/seo/private-metadata";


export const metadata = privateRouteMetadata;

/**
 * Global 403 / forbidden route. Server Components throw "FORBIDDEN"
 * when a user lacks role permissions; this page renders in response.
 */
export default function ForbiddenPage() {
  return (
    <div className="container mx-auto px-4 py-24 max-w-lg text-center">
      <p className="text-6xl font-bold tracking-tight text-warning">403</p>
      <h1 className="mt-4 text-2xl font-semibold">Access denied</h1>
      <p className="mt-2 text-muted-foreground">
        You don&apos;t have permission to view this page. If you believe this
        is a mistake, contact support.
      </p>
      <div className="mt-8">
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
