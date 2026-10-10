import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { PublicLayout } from "@/components/layout/public-layout";
import { Button } from "@/components/ui/button";

export default function CheckoutFailedPage() {
  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-16 max-w-md text-center space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive mx-auto" aria-hidden="true" />
        <h1 className="text-2xl font-bold">Payment not completed</h1>
        <p className="text-sm text-muted-foreground">
          Your payment was not completed. This can happen if you closed the
          checkout page or the payment was declined. No charges have been made.
        </p>
        <p className="text-xs text-muted-foreground">
          If you believe this is an error, please contact support with your payment reference.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Button asChild variant="outline">
            <Link href="/pricing">View pricing</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/subscription">Go to subscription</Link>
          </Button>
        </div>
      </div>
    </PublicLayout>
  );
}
