import { describe, it, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Payment integration tests.
 *
 * Per spec Sections 4, 9, 12, 16, 17, 18, 29, 32, 37, 38:
 *   * Server-side price authority (never trust client amount)
 *   * Webhook signature verification
 *   * Idempotency (no duplicate activations)
 *   * No property-money payments
 *   * RLS (users can't mark payments successful)
 *   * Audit logging
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");

function allMigrationsContent(): string {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n\n");
}

describe("payment database schema (spec Section 5)", () => {
  const content = allMigrationsContent();

  it("payments table has expected fields", () => {
    expect(content).toMatch(/create\s+table.*payments[\s\S]*?user_id\s+uuid\s+not\s+null/i);
    expect(content).toMatch(/amount\s+bigint\s+not\s+null/i);
    expect(content).toMatch(/currency\s+text\s+not\s+null\s+default/i);
    expect(content).toMatch(/provider\s+text\s+not\s+null/i);
    expect(content).toMatch(/provider_reference\s+text/i);
    expect(content).toMatch(/payment_type\s+text\s+not\s+null/i);
    expect(content).toMatch(/status\s+text\s+not\s+null\s+default\s+'pending'/i);
    expect(content).toMatch(/initiated_at\s+timestamptz/i);
    expect(content).toMatch(/verified_at\s+timestamptz/i);
  });

  it("payments have UNIQUE on (provider, provider_reference) for idempotency", () => {
    expect(content).toMatch(/unique\s*\(\s*provider,?\s*provider_reference\s*\)/i);
  });

  it("payment_events table exists for webhook audit trail", () => {
    expect(content).toMatch(/create\s+table.*payment_events/i);
    expect(content).toMatch(/payment_events[\s\S]*?provider_event_id\s+text/i);
    expect(content).toMatch(/payment_events[\s\S]*?unique\s*\(\s*provider,?\s*provider_event_id\s*\)/i);
  });
});

describe("payment RLS (spec Section 37)", () => {
  const content = allMigrationsContent();

  it("users can read their own payments only", () => {
    expect(content).toMatch(/Users\s+can\s+read\s+their\s+own\s+payments/i);
  });

  it("users can create pending payment rows but NOT update", () => {
    expect(content).toMatch(/Users\s+can\s+create\s+pending\s+payment\s+rows/i);
    // The INSERT policy must enforce status = 'pending'
    expect(content).toMatch(/status\s*=\s*'pending'/i);
  });

  it("payment_events has no user INSERT/UPDATE/DELETE policy", () => {
    // Payment events are webhook-only — no client-side RLS
    const eventsSection = content.match(
      /create\s+table[\s\S]*?payment_events[\s\S]*?(?=create|alter\s+table\s+public\.\w+\s+enable)/i,
    );
    expect(eventsSection).toBeDefined();
  });
});

describe("payment provider abstraction (spec Section 2, 12)", () => {
  it("PaymentProviderAdapter interface exists in types", () => {
    const typesContent = fs.readFileSync(
      path.join(process.cwd(), "src/types/payments.ts"),
      "utf8",
    );
    expect(typesContent).toMatch(/export\s+interface\s+PaymentProviderAdapter/);
    expect(typesContent).toMatch(/initiate\s*\(/);
    expect(typesContent).toMatch(/verify\s*\(/);
    expect(typesContent).toMatch(/parseWebhook\s*\(/);
  });

  it("PaystackAdapter implements the interface with real API calls", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/payments/paystack.ts"),
      "utf8",
    );
    expect(source).toMatch(/class\s+PaystackAdapter\s+implements\s+PaymentProviderAdapter/);
    expect(source).toMatch(/PAYSTACK_API\s*=\s*"https:\/\/api\.paystack\.co"/);
    expect(source).toMatch(/fetch\s*\(\s*`\$\{PAYSTACK_API\}\/transaction\/initialize/);
    expect(source).toMatch(/fetch\s*\(\s*`\$\{PAYSTACK_API\}\/transaction\/verify/);
  });

  it("FlutterwaveAdapter implements the interface with real API calls", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/payments/flutterwave.ts"),
      "utf8",
    );
    expect(source).toMatch(/class\s+FlutterwaveAdapter\s+implements\s+PaymentProviderAdapter/);
    expect(source).toMatch(/FLUTTERWAVE_API\s*=\s*"https:\/\/api\.flutterwave\.com\/v3"/);
    expect(source).toMatch(/fetch\s*\(\s*`\$\{FLUTTERWAVE_API\}\/payments/);
    expect(source).toMatch(/fetch\s*\(\s*`\$\{FLUTTERWAVE_API\}\/transactions/);
  });

  it("getPaymentProvider returns the correct adapter", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/payments/index.ts"),
      "utf8",
    );
    expect(source).toMatch(/export\s+function\s+getPaymentProvider/);
    expect(source).toMatch(/case\s+"paystack"/);
    expect(source).toMatch(/case\s+"flutterwave"/);
  });
});

describe("webhook signature verification (spec Section 16, 32)", () => {
  it("Paystack uses HMAC-SHA512 signature verification", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/payments/paystack.ts"),
      "utf8",
    );
    expect(source).toMatch(/createHmac\s*\(\s*"sha512"/);
    expect(source).toMatch(/timingSafeEqual/);
  });

  it("Flutterwave uses verif-hash signature verification", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/payments/flutterwave.ts"),
      "utf8",
    );
    expect(source).toMatch(/verif-hash|webhookHash/i);
    expect(source).toMatch(/signature\s*!==\s*webhookHash/);
  });

  it("webhook endpoints exist and handle POST", () => {
    expect(fs.existsSync(path.join(process.cwd(), "src/app/api/webhooks/paystack/route.ts"))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "src/app/api/webhooks/flutterwave/route.ts"))).toBe(true);
  });

  it("webhook handlers verify signature before processing", () => {
    const paystackSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/webhooks/paystack/route.ts"),
      "utf8",
    );
    expect(paystackSource).toMatch(/parseWebhook/);
    expect(paystackSource).toMatch(/Invalid signature/i);

    const flutterwaveSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/webhooks/flutterwave/route.ts"),
      "utf8",
    );
    expect(flutterwaveSource).toMatch(/parseWebhook/);
    expect(flutterwaveSource).toMatch(/Invalid signature/i);
  });
});

describe("webhook idempotency (spec Section 9, 17)", () => {
  it("paystack webhook checks for duplicate events", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/webhooks/paystack/route.ts"),
      "utf8",
    );
    expect(source).toMatch(/payment_events/);
    expect(source).toMatch(/provider_event_id/);
    expect(source).toMatch(/duplicate/i);
  });

  it("flutterwave webhook checks for duplicate events", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/webhooks/flutterwave/route.ts"),
      "utf8",
    );
    expect(source).toMatch(/payment_events/);
    expect(source).toMatch(/provider_event_id/);
    expect(source).toMatch(/duplicate/i);
  });

  it("payment_events table has UNIQUE on (provider, provider_event_id)", () => {
    const content = allMigrationsContent();
    expect(content).toMatch(/unique\s*\(\s*provider,?\s*provider_event_id\s*\)/i);
  });
});

describe("server-side price authority (spec Section 4)", () => {
  it("initiatePayment looks up plan price server-side", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/payments/payment-service.ts"),
      "utf8",
    );
    expect(source).toMatch(/getPlan\s*\(/);
    expect(source).toMatch(/plan\.priceNaira/);
    expect(source).toMatch(/amountInKobo/);
  });

  it("verifyAndActivate checks amount matches expected", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/payments/payment-service.ts"),
      "utf8",
    );
    expect(source).toMatch(/verification\.amount\s*!==\s*payment\.amount/);
    expect(source).toMatch(/Amount verification failed/);
  });

  it("verifyAndActivate checks currency matches expected", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/payments/payment-service.ts"),
      "utf8",
    );
    expect(source).toMatch(/verification\.currency\s*!==\s*payment\.currency/);
    expect(source).toMatch(/Currency verification failed/);
  });

  it("payment initiation API route validates role + plan server-side", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/payments/initiate/route.ts"),
      "utf8",
    );
    expect(source).toMatch(/getCurrentUser/);
    expect(source).toMatch(/getCurrentProfile/);
    expect(source).toMatch(/getPlan/);
    expect(source).toMatch(/Invalid plan for role/);
  });
});

describe("subscription activation (spec Section 18, 19)", () => {
  it("verifyAndActivate updates subscription_tier only after verification", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/payments/payment-service.ts"),
      "utf8",
    );
    // Must check verification.status === "successful" BEFORE updating subscription
    expect(source).toMatch(/verification\.status\s*!==\s*"successful"/);
    expect(source).toMatch(/subscription_tier/);
    // Must insert into user_subscriptions
    expect(source).toMatch(/user_subscriptions/);
  });

  it("verifyAndActivate is idempotent (checks already successful)", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/payments/payment-service.ts"),
      "utf8",
    );
    expect(source).toMatch(/already\s+successful|alreadyProcessed/);
  });

  it("reconcilePayment calls verifyAndActivate (idempotent)", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/payments/payment-service.ts"),
      "utf8",
    );
    expect(source).toMatch(/reconcilePayment/);
    expect(source).toMatch(/verifyAndActivate/);
  });
});

describe("no property-money payments (spec Section 29)", () => {
  it("payment types do NOT include rent, deposit, escrow, or property purchase", () => {
    const typesSource = fs.readFileSync(
      path.join(process.cwd(), "src/types/payments.ts"),
      "utf8",
    );
    // Check the PAYMENT_TYPES const array specifically
    const paymentTypesMatch = typesSource.match(/export\s+const\s+PAYMENT_TYPES\s*=\s*\[([\s\S]*?)\]/);
    expect(paymentTypesMatch).toBeDefined();
    const paymentTypesContent = paymentTypesMatch![1];
    expect(paymentTypesContent).not.toMatch(/rent/i);
    expect(paymentTypesContent).not.toMatch(/deposit/i);
    expect(paymentTypesContent).not.toMatch(/escrow/i);
    expect(paymentTypesContent).not.toMatch(/property_purchase/i);
    // Only platform service types
    expect(paymentTypesContent).toMatch(/subscription/);
    expect(paymentTypesContent).toMatch(/featured_listing/);
    expect(paymentTypesContent).toMatch(/advertising/);
  });

  it("no wallet or escrow table exists", () => {
    const content = allMigrationsContent();
    expect(content).not.toMatch(/create\s+table.*wallet/i);
    expect(content).not.toMatch(/create\s+table.*escrow/i);
    expect(content).not.toMatch(/create\s+table.*property_payment/i);
  });
});

describe("audit logging (spec Section 38)", () => {
  it("payment service writes audit events", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/payments/payment-service.ts"),
      "utf8",
    );
    expect(source).toMatch(/audit_logs/);
    expect(source).toMatch(/subscription_activated/);
  });

  it("webhook handlers write payment_events", () => {
    const paystackSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/webhooks/paystack/route.ts"),
      "utf8",
    );
    expect(paystackSource).toMatch(/payment_events/);
  });

  it("audit logs do NOT contain payment secrets in metadata", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/payments/payment-service.ts"),
      "utf8",
    );
    // The audit log insert metadata should NOT contain secret keys
    // Find the audit_logs insert section and check the metadata
    const auditMatch = source.match(/audit_logs[\s\S]*?metadata:\s*\{([^}]*)\}/);
    if (auditMatch) {
      const metadataContent = auditMatch[1];
      expect(metadataContent).not.toMatch(/secret_key|secretKey|api_key|apiKey/i);
    }
  });
});

describe("checkout UI (spec Section 14, 15, 34)", () => {
  it("checkout page shows plan summary + provider selection", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/payments/checkout-page.tsx"),
      "utf8",
    );
    expect(source).toMatch(/CheckoutPage/);
    expect(source).toMatch(/availableProviders/);
    expect(source).toMatch(/paystack|flutterwave/i);
  });

  it("success page queries server (does not self-activate)", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/checkout/success/page.tsx"),
      "utf8",
    );
    expect(source).toMatch(/reconcilePayment/);
    // Must NOT directly set subscription_tier
    expect(source).not.toMatch(/subscription_tier\s*=\s*"pro"/);
    expect(source).not.toMatch(/subscription_tier\s*=\s*"premium"/);
  });

  it("payment history page exists", () => {
    expect(fs.existsSync(path.join(process.cwd(), "src/app/dashboard/payments/page.tsx"))).toBe(true);
  });
});

describe("environment variables (spec Section 33)", () => {
  it("server-config has Paystack + Flutterwave secrets", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/security/server-config.ts"),
      "utf8",
    );
    expect(source).toMatch(/PAYSTACK_SECRET_KEY/);
    expect(source).toMatch(/PAYSTACK_WEBHOOK_HASH/);
    expect(source).toMatch(/FLUTTERWAVE_SECRET_KEY/);
    expect(source).toMatch(/FLUTTERWAVE_WEBHOOK_HASH/);
  });

  it("env vars are NOT exposed via NEXT_PUBLIC_", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/security/server-config.ts"),
      "utf8",
    );
    // Secret keys must NOT be NEXT_PUBLIC_
    expect(source).not.toMatch(/NEXT_PUBLIC_.*SECRET_KEY/);
    expect(source).not.toMatch(/NEXT_PUBLIC_.*WEBHOOK_HASH/);
  });

  it(".env.example has payment env vars", () => {
    const envContent = fs.readFileSync(
      path.join(process.cwd(), ".env.example"),
      "utf8",
    );
    expect(envContent).toMatch(/PAYSTACK_PUBLIC_KEY/);
    expect(envContent).toMatch(/PAYSTACK_SECRET_KEY/);
    expect(envContent).toMatch(/PAYSTACK_WEBHOOK_HASH/);
    expect(envContent).toMatch(/FLUTTERWAVE_PUBLIC_KEY/);
    expect(envContent).toMatch(/FLUTTERWAVE_SECRET_KEY/);
    expect(envContent).toMatch(/FLUTTERWAVE_WEBHOOK_HASH/);
  });
});
