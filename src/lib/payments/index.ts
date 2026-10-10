import type {
  PaymentProvider,
  PaymentProviderAdapter,
} from "@/types";

/**
 * Payment provider registry.
 *
 * Concrete adapters are imported lazily so a missing provider env var
 * in development does not break the whole app. Add new providers by
 * implementing PaymentProviderAdapter and registering here.
 */

import { PaystackAdapter } from "./paystack";
import { FlutterwaveAdapter } from "./flutterwave";

const registry: Partial<Record<PaymentProvider, PaymentProviderAdapter>> = {};

/**
 * Returns the adapter for a provider, instantiating it lazily on first use.
 * Throws if the provider is unknown.
 */
export function getPaymentProvider(
  provider: PaymentProvider,
): PaymentProviderAdapter {
  const existing = registry[provider];
  if (existing) return existing;

  let adapter: PaymentProviderAdapter;
  switch (provider) {
    case "paystack":
      adapter = new PaystackAdapter();
      break;
    case "flutterwave":
      adapter = new FlutterwaveAdapter();
      break;
    default: {
      const _: never = provider;
      throw new Error(`Unknown payment provider: ${_}`);
    }
  }

  registry[provider] = adapter;
  return adapter;
}
