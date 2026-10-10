import type { UserRole } from "./auth";

/**
 * Payment types the platform processes.
 */
export const PAYMENT_TYPES = [
  "subscription",
  "featured_listing",
  "advertising",
  "verification_fee",
  "topup",
] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

/**
 * Payment providers supported behind the abstraction layer.
 * Adding a new provider means adding a new value here + a new adapter.
 */
export const PAYMENT_PROVIDERS = ["paystack", "flutterwave"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

/**
 * Payment lifecycle states.
 *
 * Payments are NEVER marked successful based on the browser's response.
 * State only transitions on a server-side verified provider webhook
 * with signature check.
 */
export const PAYMENT_STATUSES = [
  "pending",
  "successful",
  "failed",
  "cancelled",
  "refunded",
  "expired",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Transaction ledger record. One row per payment attempt.
 * The provider webhook writes a corresponding event to `payment_events`
 * for full audit trail.
 */
export interface PaymentRecord {
  id: string;
  userId: string;
  amount: number; // minor units (kobo)
  currency: Currency;
  provider: PaymentProvider;
  providerReference: string;
  paymentType: PaymentType;
  /** Related resource id — e.g. subscription id, listing id, campaign id. */
  relatedResourceId: string | null;
  status: PaymentStatus;
  createdAt: string; // ISO
  verifiedAt: string | null; // ISO, set on webhook confirmation
}

export const CURRENCIES = ["NGN", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

/**
 * Provider-agnostic initiation payload returned to the client so the
 * browser can redirect to the provider-hosted checkout page.
 */
export interface InitiatePaymentResult {
  provider: PaymentProvider;
  /** URL the browser should redirect to (Paystack / Flutterwave checkout). */
  authorizationUrl: string;
  /** Provider reference used to track the transaction. */
  reference: string;
}

/**
 * Provider-agnostic verification payload — the result of asking the
 * provider whether a transaction is genuinely successful.
 */
export interface VerifyPaymentResult {
  provider: PaymentProvider;
  reference: string;
  status: PaymentStatus;
  amount: number; // minor units
  currency: Currency;
  paidAt: string | null; // ISO
  /** Raw provider response for the audit log (sanitised of secrets). */
  rawResponse: Record<string, unknown>;
}

/**
 * The interface every payment provider adapter must implement.
 * New providers are added by implementing this interface.
 */
export interface PaymentProviderAdapter {
  readonly name: PaymentProvider;

  /**
   * Initiate a payment with the provider. Returns the URL the browser
   * should redirect to.
   */
  initiate(input: {
    userId: string;
    amount: number; // minor units
    currency: Currency;
    paymentType: PaymentType;
    relatedResourceId: string | null;
    userEmail: string;
    userFullName: string;
    callbackUrl: string;
    metadata: Record<string, string>;
  }): Promise<InitiatePaymentResult>;

  /**
   * Server-side verification — called from the webhook handler and
   * optionally as a fallback polling check. NEVER trust the browser.
   */
  verify(reference: string): Promise<VerifyPaymentResult>;

  /**
   * Validate that an incoming webhook is genuinely from the provider.
   * Returns the parsed event if the signature matches; throws otherwise.
   */
  parseWebhook(input: {
    rawBody: string;
    signature: string;
  }): Promise<{ reference: string; event: string }>;
}

/**
 * Capability gating for which providers a given role/plan may use.
 * In V1 both providers are available to all paid tiers; this hook exists
 * so future products (e.g. bulk payouts) can restrict by plan.
 */
export function availableProvidersForRole(_role: UserRole): PaymentProvider[] {
  return ["paystack", "flutterwave"];
}
