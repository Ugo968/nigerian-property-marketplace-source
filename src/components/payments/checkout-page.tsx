"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, CreditCard, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNaira } from "@/lib/subscriptions/plans";
import type { PaymentProvider, UserRole, SubscriptionTier } from "@/types";

const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  paystack: "Paystack",
  flutterwave: "Flutterwave",
};

export function CheckoutPage({
  role,
  currentTier,
  requestedTier,
  planPrice,
  isVariablePrice,
  planTagline,
  planHighlights,
  availableProviders,
}: {
  role: UserRole;
  currentTier: SubscriptionTier;
  requestedTier: SubscriptionTier;
  planPrice: number;
  isVariablePrice: boolean;
  planTagline: string;
  planHighlights: string[];
  availableProviders: PaymentProvider[];
}) {
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = React.useState<PaymentProvider | null>(
    availableProviders[0] ?? null,
  );
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleCheckout() {
    if (!selectedProvider) return;

    setPending(true);
    setError(null);

    const result = await initiatePaymentAction({
      provider: selectedProvider,
      requestedTier,
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error ?? "Payment could not be initiated.");
      return;
    }

    if (result.authorizationUrl) {
      window.location.href = result.authorizationUrl;
    }
  }

  const priceDisplay = formatNaira(planPrice, isVariablePrice);

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Checkout</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete your subscription upgrade securely.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl capitalize">{requestedTier} Plan</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{planTagline}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{priceDisplay}</p>
              <p className="text-xs text-muted-foreground">/month · NGN</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {planHighlights.slice(0, 6).map((h, i) => (
              <li key={i} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Choose payment method</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {availableProviders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payment providers are currently configured.
            </p>
          ) : (
            availableProviders.map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => setSelectedProvider(provider)}
                aria-pressed={selectedProvider === provider}
                className={`w-full flex items-center gap-3 rounded-lg border p-4 text-left transition ${
                  selectedProvider === provider
                    ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <CreditCard className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="font-medium">{PROVIDER_LABELS[provider]}</p>
                  <p className="text-xs text-muted-foreground">
                    Secure payment via {PROVIDER_LABELS[provider]}
                  </p>
                </div>
                {selectedProvider === provider ? (
                  <Check className="ml-auto h-5 w-5 text-primary" aria-hidden="true" />
                ) : null}
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg border border-info/30 bg-info/5 p-3 space-y-2 text-xs text-info-foreground">
        <p className="font-medium flex items-center gap-1">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Secure Payment
        </p>
        <p>
          You will be redirected to {selectedProvider ? PROVIDER_LABELS[selectedProvider] : "the payment provider"}&apos;s secure checkout.
          We never see or store your card details. Payment is verified server-side
          before your subscription is activated.
        </p>
        <p>
          Subscription payments are for platform services only. Shelty does not
          process rent, property purchase money, or escrow.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>
          Back
        </Button>
        <Button
          onClick={handleCheckout}
          disabled={pending || !selectedProvider || availableProviders.length === 0}
          className="flex-1"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
              Initializing payment...
            </>
          ) : (
            `Pay ${priceDisplay}`
          )}
        </Button>
      </div>
    </div>
  );
}

async function initiatePaymentAction(input: {
  provider: PaymentProvider;
  requestedTier: SubscriptionTier;
}) {
  const response = await fetch("/api/payments/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return response.json();
}
