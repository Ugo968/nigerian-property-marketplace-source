import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PublicLayout } from "@/components/layout/public-layout";

export default function NotFound() {
  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-24 max-w-lg text-center">
        <p className="text-6xl font-bold tracking-tight text-primary">404</p>
        <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/properties">Browse properties</Link>
          </Button>
        </div>
      </div>
    </PublicLayout>
  );
}
