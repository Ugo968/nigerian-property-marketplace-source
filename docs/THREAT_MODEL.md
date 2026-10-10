# THREAT MODEL

Production-readiness threat model (Prompt 19).

## Assets (what we protect)

1. **User accounts** — profiles, roles, verification status, subscription tier
2. **Property listings** — drafts, media, ownership/representation
3. **Conversations + messages** — private user-to-user communication
4. **Reviews** — published + removed (preserved in audit)
5. **Subscriptions + payments** — payment records, provider references
6. **Featured credits** — non-negative balance invariant
7. **Advertising campaigns** — budgets, creatives, moderation state
8. **Notifications + email delivery** — recipient routing, preferences
9. **Transactions** — workflow state, offers, inspections, history
10. **Audit logs** — append-only integrity
11. **Verification documents** — PRIVATE (never public)
12. **Admin action records** — moderation history
13. **Platform settings** — admin-configurable values
14. **Secrets** — Supabase service role key, Paystack/Flutterwave secrets,
    email provider API key, webhook hashes

## Trust levels

| Trust level | Examples |
|---|---|
| Untrusted | Browser, cookies, localStorage, JWT claims, request bodies |
| Semi-trusted | Next.js server runtime (after auth check) |
| Trusted | Supabase service role (after `requireAdminPermission`) |
| Authoritative | Postgres + RLS (final guard) |

## Threats (per STRIDE)

### Spoofing

- **Session hijacking**: cookies are httpOnly + Secure (prod) + SameSite=Lax.
  Mitigation: HTTPS in production, short-lived refresh tokens.
- **Admin impersonation**: admin identity resolved from `admin_users`
  table, NOT from `profiles.role` or client claims. Mitigation: server-side
  `requireAdmin()` + `requireAdminPermission()`.
- **Webhook spoofing**: Paystack HMAC-SHA512 + Flutterwave SHA256
  signature verification with `timingSafeEqual`. Mitigation: fail-closed
  when signature is missing or mismatched.

### Tampering

- **Role escalation**: `profiles.role` is immutable via RLS UPDATE policy
  (rejects any change). Mitigation: DB CHECK constraint + RLS.
- **Subscription tier bypass**: `subscription_tier` is immutable via
  RLS. Mitigation: same as role. Capability system is the single source
  of truth.
- **Payment status manipulation**: clients cannot mark payments
  successful — `verifyAndActivate()` is server-to-server with the
  provider. Mitigation: no client-facing payment-status mutation path.
- **Transaction state machine bypass**: forward-only transitions
  enforced by SECURITY DEFINER functions. Mitigation: `transition_transaction`
  validates allowed transitions; `accept_transaction_offer` checks
  offer status + authorization.
- **Audit log tampering**: INSERT-only RLS (no UPDATE/DELETE policies).
  Mitigation: DB-level guard; UI has no edit path.
- **Credit ledger tampering**: `remaining >= 0` CHECK constraint +
  append-only ledger. Mitigation: atomic conditional UPDATE.

### Repudiation

- **Admin action denial**: every admin mutation records to
  `audit_logs` AND `admin_action_records` with actor, action, target,
  reason, timestamp, previous/new state. Mitigation: append-only audit.
- **Transaction status denial**: `transaction_status_history` +
  `offer_history` are append-only. Mitigation: same.
- **Payment denial**: `payment_events` records every webhook event.
  Mitigation: idempotency ledger.

### Information disclosure

- **IDOR/BOLA on transactions**: RLS narrows to participants only.
  Mitigation: `transaction_participants` RLS check.
- **Offer amount leakage**: RLS exposes offer amounts ONLY to the
  submitter + counter-party (owner/agent). Other customers' offers
  are filtered out. Mitigation: per-policy RLS.
- **Verification document leakage**: PRIVATE bucket, applicant-only
  read. Mitigation: storage RLS + path-scoped to `auth.uid()`.
- **Exact address leakage**: private addresses are NOT exposed publicly
  (Prompt 8 location intelligence). Mitigation: server-side
  `publicApproximate()` rounding + RLS on `property_locations`.
- **Error message leakage**: `safeAuthErrorMessage()` returns generic
  messages; server actions return "We couldn't do X." Mitigation:
  no raw DB errors to client.
- **Log leakage**: `logger` redacts sensitive keys (password, token,
  secret, webhookhash, etc.). Mitigation: recursive `sanitise()`.

### Denial of service

- **Brute force login**: rate-limited (10/hour). Mitigation: in-memory
  limiter (V1); Redis-backed V2.
- **Application flooding**: rate-limited (30/hour). Mitigation: same.
- **Message flooding**: rate-limited (60/hour). Mitigation: same.
- **Payment abuse**: rate-limited (20 initiate/hour). Mitigation: same.
- **Webhook abuse**: signature verification rejects unsigned requests.
  Mitigation: fail-closed.
- **Resource exhaustion**: paginated queries with `limit + 1` cursor
  pagination. Mitigation: no unbounded SELECT.

### Elevation of privilege

- **Self-promotion to admin**: `admin_users` table is server-only
  (RLS, no client INSERT/UPDATE policy). Mitigation: admin seeding
  via ADMIN_EMAILS env var or DB-level insert by an existing super_admin.
- **Capability bypass**: `capabilitiesFor(role, tier)` is the single
  source of truth. Code never does `if plan === "premium"`.
  Mitigation: centralised capability system + immutable role/tier.
- **Featured credit inflation**: `remaining >= 0` CHECK + atomic
  deduction. Mitigation: DB-level guard.

## Attack surfaces

1. **Public web pages** — homepage, property search, property detail,
   agent/company profile pages. Public READ only; no public writes.
2. **Auth endpoints** — login, signup, password reset. Rate-limited.
3. **Dashboard routes** — `/dashboard/*`. Auth + active account required.
4. **Admin routes** — `/admin/*`. Auth + admin permission required.
5. **API routes** — `/api/notifications/*`, `/api/cron/*`,
   `/api/webhooks/*`. Auth where applicable; cron uses shared secret;
   webhooks use signature verification.
6. **Supabase Storage** — public buckets (avatars, property-media,
   advertising-creatives) + private buckets (verification-documents,
   message-attachments, report-evidence).
7. **Supabase Realtime** — `notifications` INSERT events; RLS-enforced.

## Residual risks

1. In-memory rate limiter (single-instance) — see SECURITY.md.
2. Paystack webhook hash env var fallback in dev — see SECURITY.md.
3. CSP dev permissiveness — see SECURITY.md.
4. No background offer-expiry worker — see SECURITY.md.
5. No SMS/push — see SECURITY.md.
6. No advanced fraud AI — see SECURITY.md.
7. System-message posting on transaction events is future work.
8. Multi-instance session refresh needs Redis V2.
