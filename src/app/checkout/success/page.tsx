import Link from "next/link";
import { CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";
import { PublicLayout } from "@/components/layout/public-layout";
import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/auth/server";
import { reconcilePayment, getPaymentHistory } from "@/lib/payments/payment-service";
import type { PaymentProvider } from "@/types";

/**
 * /checkout/success — callback page after provider redirect.
 *
 * Per spec Section 34: "These pages must not independently activate subscriptions.
 * They should query the server for the authoritative payment/subscription state."
 *
 * Per spec Section 35 (reconciliation): if the webhook hasn't arrived yet,
 * this page triggers a reconciliation attempt.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string; reference?: string }>;
}) {
  const { provider, reference } = await searchParams;
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-16 max-w-md text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
          <h1 className="text-xl font-semibold">Sign in required</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Please sign in to view your payment status.
          </p>
          <Button asChild className="mt-4">
            <Link href="/login?next=/dashboard/subscription">Sign in</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  // Attempt reconciliation if we have a reference (spec Section 35)
  let paymentStatus: "verified" | "pending" | "failed" | "unknown" = "unknown";

  if (reference && provider && (provider === "paystack" || provider === "flutterwave")) {
    try {
      const result = await reconcilePayment(reference, provider as PaymentProvider);
      if (result.ok) {
        paymentStatus = result.alreadyProcessed ? "verified" : "verified";
      } else if (result.paymentStatus === "pending") {
        paymentStatus = "pending";
      } else if (result.paymentStatus === "failed") {
        paymentStatus = "failed";
      } else {
        paymentStatus = "pending"; // Payment might still be processing
      }
    } catch {
      paymentStatus = "pending";
    }
  }

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-16 max-w-md text-center space-y-4">
        {paymentStatus === "verified" ? (
          <>
            <CheckCircle2 className="h-16 w-16 text-success mx-auto" aria-hidden="true" />
            <h1 className="text-2xl font-bold">Payment successful!</h1>
            <p className="text-sm text-muted-foreground">
              Your subscription has been activated. You now have access to your new plan&apos;s features.
            </p>
            <Button asChild>
              <Link href="/dashboard/subscription">Go to subscription</Link>
            </Button>
          </>
        ) : paymentStatus === "pending" ? (
          <>
            <Clock className="h-16 w-16 text-info mx-auto" aria-hidden="true" />
            <h1 className="text-2xl font-bold">Payment processing</h1>
            <p className="text-sm text-muted-foreground">
              Your payment is being verified. This usually takes a few seconds.
              If your subscription isn&apos;t activated within a few minutes, please contact support.
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard/subscription">Go to subscription</Link>
            </Button>
          </>
        ) : paymentStatus === "failed" ? (
          <>
            <AlertCircle className="h-16 w-16 text-destructive mx-auto" aria-hidden="true" />
            <h1 className="text-2xl font-bold">Payment failed</h1>
            <p className="text-sm text-muted-foreground">
              Your payment could not be completed. Please try again or choose a different payment method.
            </p>
            <Button asChild>
              <Link href="/pricing">Try again</Link>
            </Button>
          </>
        ) : (
          <>
            <Clock className="h-16 w-16 text-muted-foreground mx-auto" aria-hidden="true" />
            <h1 className="text-2xl font-bold">Checking payment status</h1>
            <p className="text-sm text-muted-foreground">
              We&apos;re checking your payment status. If your subscription isn&apos;t activated shortly, please contact support.
            </p>
            <Button asChild variant="outline">
              <Link href="/dashboard/subscription">Go to subscription</Link>
            </Button>
          </>
        )}
      </div>
    </PublicLayout>
  );
}
