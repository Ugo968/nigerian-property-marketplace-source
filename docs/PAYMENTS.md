# PAYMENTS

This document records the Paystack + Flutterwave payment integration.

## Architecture overview

```mermaid
flowchart TD
    A[User selects plan on /pricing] --> B[/checkout?tier=pro]
    B --> C[CheckoutPage: plan summary + provider selection]
    C --> D[POST /api/payments/initiate]
    D --> E[Server validates plan + role]
    E --> F[Server computes authoritative price]
    F --> G[Create pending payment row]
    G --> H[Call provider.initiate]
    H --> I[Return authorization_url]
    I --> J[Redirect to provider checkout]
    J --> K[User pays on provider page]
    K --> L{Provider webhook}
    L --> M[/api/webhooks/paystack or /api/webhooks/flutterwave]
    M --> N[Verify signature]
    N --> O[verifyAndActivate: server-to-server verify]
    O --> P{Amount + currency match?}
    P -->|Yes| Q[Mark payment successful]
    P -->|No| R[Mark payment failed]
    Q --> S[Activate subscription]
    S --> T[Update subscription_tier + user_subscriptions]
    T --> U[Audit log: subscription_activated]
    K --> V[/checkout/success callback]
    V --> W[reconcilePayment: check server status]
    W --> X{Payment verified?}
    X -->|Yes| Y[Show 'Payment successful']
    X -->|Pending| Z[Show 'Payment processing']
```

## Provider abstraction (spec Section 2, 12)

```
PaymentProviderAdapter (interface, src/types/payments.ts)
├── PaystackAdapter     src/lib/payments/paystack.ts
│   └── Real API calls to https://api.paystack.co
│       ├── initiate → POST /transaction/initialize
│       ├── verify → GET /transaction/verify/{reference}
│       └── parseWebhook → HMAC-SHA512 signature verification
└── FlutterwaveAdapter  src/lib/payments/flutterwave.ts
    └── Real API calls to https://api.flutterwave.com/v3
        ├── initiate → POST /payments
        ├── verify → GET /transactions/{reference}/verify
        └── parseWebhook → verif-hash header verification
```

Adding a new provider = implement `PaymentProviderAdapter` + register in `getPaymentProvider()`.

## Server-side price authority (spec Section 4)

**Never trusts client-supplied amount.** The flow:
1. Client sends `{ provider, requestedTier }` — NO amount
2. Server loads the user's profile (role + current tier)
3. Server calls `getPlan(role, requestedTier)` to get the authoritative price
4. Server creates a pending payment row with `amount = plan.priceNaira * 100` (kobo)
5. Server calls `provider.initiate({ amount, ... })` with the server-computed amount
6. Provider returns `authorization_url` — client is redirected there
7. User pays the amount the provider received from the server

A malicious client cannot send `amount=100, plan=Premium` — the server ignores any client amount and computes its own.

## Payment lifecycle (spec Section 3)

```
pending → successful (after webhook verification)
pending → failed (verification failed)
pending → expired (timeout, future)
pending → cancelled (user abandoned)
successful → refunded (admin action, future)
```

## Webhook architecture (spec Section 16, 17)

### Paystack webhook (`/api/webhooks/paystack`)
1. Receive POST with `x-paystack-signature` header
2. Verify HMAC-SHA512 signature using `PAYSTACK_WEBHOOK_HASH`
3. Parse event + reference
4. Idempotency check: `payment_events` table has `UNIQUE(provider, provider_event_id)`
5. For `charge.success` events: call `verifyAndActivate()`
6. Record `payment_events` row (before processing, for audit trail)
7. Always return 200 (even on errors — stops retries)

### Flutterwave webhook (`/api/webhooks/flutterwave`)
1. Receive POST with `verif-hash` header
2. Verify hash equals `FLUTTERWAVE_WEBHOOK_HASH`
3. Parse event + tx_ref
4. Idempotency check (same as Paystack)
5. For success events: call `verifyAndActivate()`
6. Record + return 200

## Verification logic (spec Section 10, 11, 18)

`verifyAndActivate(reference, provider)` in `payment-service.ts`:

1. Find payment by `provider_reference`
2. **Idempotency**: if already `successful` → return `{ ok: true, alreadyProcessed: true }`
3. Call `adapter.verify(reference)` (server-to-server)
4. Check `verification.status === "successful"`
5. **Amount check**: `verification.amount === payment.amount` (in kobo)
6. **Currency check**: `verification.currency === payment.currency`
7. If all pass: mark payment `successful` + activate subscription
8. If any fail: mark payment `failed` + return error

## Idempotency (spec Section 9)

Three layers of protection:
1. **Payment-level**: `verifyAndActivate()` checks if payment is already `successful` before re-processing
2. **Event-level**: `payment_events` table has `UNIQUE(provider, provider_event_id)` — duplicate webhook events are rejected by the DB
3. **Race condition**: the `UNIQUE` constraint causes the second insert to fail with code `23505` → treated as duplicate

Processing the same webhook 100 times produces the same final state.

## Subscription activation (spec Section 19)

After verified payment:
1. Mark `payments.status = "successful"` + set `verified_at`
2. Update `profiles.subscription_tier` to the requested tier (service-role)
3. Insert `user_subscriptions` row with `status = "active"`, billing period, provider refs
4. Write `audit_logs` entry: `subscription_activated` (metadata only — no secrets)

If subscription activation fails after payment verification:
- The payment record remains `successful` — it's NOT rolled back
- The system can reconcile later by re-running `verifyAndActivate()` (idempotent)

## Reconciliation (spec Section 35)

`reconcilePayment(reference, provider)`:
- Called from `/checkout/success` callback page (user returns from provider)
- Also callable from future admin tools or cron jobs
- Calls `verifyAndActivate()` — idempotent, safe to call multiple times
- Recovers: browser closed, redirect failed, webhook delayed, network failure

The user does NOT need to pay again if the browser failed to return.

## No property-money payments (spec Section 29)

**Critical security/business boundary.** The `PAYMENT_TYPES` array only contains:
- `subscription`
- `featured_listing`
- `advertising`
- `verification_fee`
- `topup`

It does NOT contain: rent, deposit, escrow, property_purchase, commission, or any property-money type.

No wallet table. No escrow table. No property-payment table. The DB CHECK constraint on `payment_type` rejects any value outside the approved list.

## Checkout UI (spec Section 14, 15, 34)

### `/checkout?tier=pro`
- Shows: plan name, tagline, price/month, currency (NGN), top 6 highlights
- Provider selection: Paystack / Flutterwave (only configured providers shown)
- Security info: "You will be redirected to [provider]'s secure checkout. We never see or store your card details."
- "Subscription payments are for platform services only. Shelty does not process rent, property purchase money, or escrow."
- Pay button → calls `POST /api/payments/initiate` → redirects to provider

### `/checkout/success`
- Queries server for payment status (does NOT self-activate)
- Calls `reconcilePayment()` — triggers verification if webhook hasn't arrived
- States: "Payment successful!", "Payment processing", "Payment failed"
- Never shows "Subscription Active" unless server confirms

### `/checkout/failed`
- Static page: "Payment not completed"
- Links to pricing + subscription dashboard

## Payment history (`/dashboard/payments`)

Shows table: date, service type, amount + currency, provider, status badge.
No secret metadata. No card information. No internal provider response data.

## RLS (spec Section 37)

| Table | User access | Server access |
|---|---|---|
| `payments` | READ own (SELECT) + INSERT pending (status='pending' only) | Full (service-role) |
| `payment_events` | NONE (no user RLS) | Full (service-role, webhook-only) |
| `user_subscriptions` | READ own (SELECT) | Full (service-role) |

**Users CANNOT**: mark payments successful, modify amount/provider/reference, activate subscriptions, modify billing periods, mark refunds.

## Environment variables (spec Section 33)

```env
# Paystack
PAYSTACK_PUBLIC_KEY=
PAYSTACK_SECRET_KEY=       # server-only
PAYSTACK_WEBHOOK_HASH=     # server-only, for HMAC verification

# Flutterwave
FLUTTERWAVE_PUBLIC_KEY=
FLUTTERWAVE_SECRET_KEY=              # server-only
FLUTTERWAVE_WEBHOOK_HASH=           # server-only
FLUTTERWAVE_ENCRYPTION_KEY=         # server-only
```

All secret keys use `process.env` (server-only) — never `NEXT_PUBLIC_*`.

## Audit events (spec Section 38)

- `subscription_activated` — payment verified + subscription activated
- `payment_events` rows — webhook receipt + processing audit trail

No secrets in audit metadata. Only: tier, provider, amount, reference.

## Future extension points

- **Prompt 14**: Featured listing purchases (`payment_type = "featured_listing"`)
- **Prompt 15**: Advertising campaign payments (`payment_type = "advertising"`)
- Recurring billing (renewal success/failure via webhooks)
- Refund processing (status → `refunded`, provider refund API)
- Admin payment dashboard (view, reconcile, refund, suspend)
