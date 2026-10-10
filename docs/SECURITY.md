# SECURITY

Production-readiness security audit + hardening pass (Prompt 19).

## Trust boundaries

The application has the following trust boundaries:

```
┌─────────────────────────────────────────────────────────────────────┐
│  UNTRUSTED (browser)                                                │
│  - React components                                                  │
│  - Client-side validation (UX only — never authoritative)            │
│  - localStorage / cookies / JWT claims (can be manipulated)          │
└─────────────────────────────────────────────────────────────────────┘
                  │
                  ▼  (HTTPS, signed session cookie)
┌─────────────────────────────────────────────────────────────────────┐
│  SEMI-TRUSTED (Next.js server runtime)                              │
│  - Server Components + Route Handlers + Server Actions              │
│  - Middleware (auth refresh + protected-route gating)                │
│  - Server-side validation (Zod — authoritative source of truth)      │
└─────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TRUSTED (Supabase service role)                                    │
│  - Webhook verification (Paystack / Flutterwave signatures)           │
│  - Admin actions (after requireAdminPermission)                      │
│  - Background jobs / cron                                             │
│  Bypasses RLS — used ONLY behind strict authorization                │
└─────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AUTHORITATIVE (Postgres + RLS)                                     │
│  - Every table has RLS enabled                                        │
│  - Ownership enforced at row level                                    │
│  - SECURITY DEFINER functions for atomic state transitions           │
└─────────────────────────────────────────────────────────────────────┘
```

The browser is NEVER trusted. Server-side code is trusted only after
authorization checks. The Supabase service role is trusted ONLY behind
`requireAdminPermission()` or webhook signature verification.

## Authentication security (spec Section 3)

- Sessions are cookie-based via `@supabase/ssr`. Cookies are
  httpOnly + Secure (in production) + SameSite=Lax.
- Middleware refreshes the session cookie on every request and
  gates `/dashboard`, `/admin`, `/onboarding` (redirects to `/login`
  with `next=` preserved).
- `requireActiveUser()` enforces account status:
  - `banned` → redirect to `/account-suspended?reason=banned`
  - `suspended` → redirect to `/account-suspended?reason=suspended`
  - `deactivated` → redirect to `/account-suspended?reason=deactivated`
- `requireAdmin()` resolves admin identity from the `admin_users`
  table — NEVER from `profiles.role`.
- `requireAdminPermission("permission")` enforces per-permission
  authorization (super_admin bypasses).
- Auth actions use `safeRelativeRedirect()` (open-redirect protection).
- Password reset uses Supabase Auth (no custom password system).
- Email verification via Supabase Auth email flow.

## Authorization / RBAC (spec Section 4)

### Marketplace roles (3)

- `landlord`
- `agent`
- `company`

These are stored in `profiles.role` with a DB CHECK constraint
rejecting any other value. The `role` is immutable from the client
side — the RLS UPDATE policy rejects role changes.

### Admin tiers (2)

- `admin` — has only the permissions in `admin_users.permissions[]`
- `super_admin` — has ALL permissions (bypasses the list)

These are stored in `admin_users.role` — completely separate from
marketplace roles. A normal landlord/agent/company can NEVER gain
admin access by modifying client state.

### Object-level authorization (IDOR/BOLA prevention)

Every protected operation verifies:

1. Authenticated user (from session, NOT request body)
2. Marketplace role (from `profiles.role`, server-resolved)
3. Ownership (e.g. `property.owner_profile_id === profile.id`)
4. Representation relationship (via `property_agent_representations`)
5. Conversation participation (via `conversation_participants`)
6. Application relationship (via `decision_maker_id` / `agent_id`)
7. Transaction participation (via `transaction_participants`)
8. Subscription entitlement (via `capabilitiesFor(role, tier)`)
9. Account status (active / suspended / banned)
10. Admin permission (via `requireAdminPermission()`)

Examples:
- Property publish: caller must be the owner / listing creator /
  managing agent.
- Messaging: caller must be a participant in the conversation.
- Transaction actions: caller must be an active participant.
- Offer acceptance: caller must be the property owner / managing
  agent / managing company (NOT the customer who submitted the offer).

## RLS strategy (spec Section 5)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| profiles | public (excl. soft-deleted); owner-update | self-insert (server-validated role) | self-update (role + tier IMMUTABLE) | never |
| verification_applications | applicant + admin | applicant (server-validated) | admin only | never |
| verification_documents | applicant only | applicant only | never | never |
| properties | public; managers see drafts | server-only | managers only | never (soft-delete via `deleted_at`) |
| property_applications | agent + decision maker | agent (RLS EXCLUDE constraint prevents duplicates) | decision maker | never |
| conversations + participants + messages | participants only | participants only | participants (last_read, unread_count) | soft-delete only |
| reviews | public (published); reviewer + reviewed (hidden/removed) | reviewer only | reviewer (limited) + admin | never (soft-delete) |
| subscriptions | owner | server-only (payment-service) | server-only | never |
| payments | owner | server-only (initiate) + admin (events) | server-only (verify) | never |
| featured_listing_credits | owner | server-only | server-only (atomic deduction) | never |
| advertising_campaigns + businesses + creatives | owner + admin | owner (server-validated) | owner + admin | never |
| notifications | recipient only | server-only (SECURITY DEFINER) | recipient (mark read) | recipient (dismiss) |
| notification_preferences | owner | owner | owner | never |
| notification_events | server-only (NO client policy) | server-only | never | never |
| email_delivery_records | server-only (NO client policy) | server-only | server-only | never |
| reports | reporter + admin | anyone (rate-limited) | server-only (admin resolve) | reporter (withdraw) |
| audit_logs | server-only (admin) | server-only (INSERT only) | never (no UPDATE policy) | never (no DELETE policy) |
| admin_action_records | server-only (NO client policy) | server-only | never | never |
| transactions + participants | participants only | server-only (server actions) | server-only (SECURITY DEFINER) | never |
| transaction_status_history | participants (read) | server-only (INSERT only) | never | never |
| inspections + negotiation_records + offers + offer_history | participants (read) | server-only | server-only | never |
| platform_settings | public read | server-only | server-only | never |
| report_categories | public read | server-only | server-only | never |

### Storage buckets

| Bucket | Visibility | Write |
|---|---|---|
| avatars | public read | owner-scoped path (`auth.uid()/file.ext`) |
| property-media | public read | property managers only |
| verification-documents | **PRIVATE** — applicant only | applicant only |
| advertising-creatives | public read **ONLY when campaign is active/approved** | owner |
| message-attachments | **PRIVATE** — conversation participants only | participants only |
| report-evidence | **PRIVATE** — reporter + admin only | reporter only |

The advertising-creatives public-read policy was tightened in
migration 0026 — creatives from rejected/paused campaigns are NOT
publicly accessible via predictable storage paths.

## Payment security (spec Section 11)

- Payment truth is tied to verified provider state — NEVER to
  client-supplied responses.
- `verifyAndActivate()` checks (server-to-server):
  - Paystack/Flutterwave signature
  - Currency matches expected
  - Amount matches expected
  - Payment status === "successful"
- Webhook signature verification uses HMAC-SHA512 (Paystack) /
  SHA256 (Flutterwave) with `timingSafeEqual` (constant-time comparison).
- Webhook events are idempotent — duplicate webhooks are detected via
  `payment_events` table.
- A user can NEVER upgrade themselves by modifying the frontend
  request — the request type + tier are stored in `payments.metadata`
  at initiation, and the activation uses those stored values.

## Subscription / entitlement bypass (spec Section 12)

All entitlements resolve server-side via `capabilitiesFor(role, tier)`
in `src/lib/capabilities/index.ts`. The capability system is the
SINGLE source of truth — code never does `if plan === "premium"`.

Bypass attempts that fail:
- Modifying client-side role values → RLS rejects (role is immutable)
- Modifying client-side tier values → RLS rejects (subscription_tier is immutable)
- Changing IDs in URLs → RLS narrows to caller's own rows
- Changing timestamps → server uses `now()` for window calculation
- Concurrent requests → in-memory rate limiter is atomic (Vercel multi-instance
  would need Redis-backed V2)

## Rate limiting (spec Section 13)

`RATE_LIMITS` covers all sensitive operations:

| Action | Limit | Window |
|---|---|---|
| login | 10 | hour |
| signup | 5 | hour |
| passwordReset | 3 | hour |
| otp | 5 | hour |
| application | 30 | hour |
| message | 60 | hour |
| report | 10 | hour |
| transaction_inquiry | 20 | hour |
| transaction_inspection | 30 | hour |
| transaction_offer | 30 | hour |
| payment_initiate | 20 | hour |
| payment_verify | 30 | hour |
| notification_mark_read | 60 | hour |
| admin_action | 60 | hour |

The in-memory limiter is V1; production multi-instance would swap to
Redis-backed via the same `RateLimiter` interface.

## Messaging privacy (spec Section 14)

- Messages RLS: only conversation participants can read.
- Conversation IDs do not leak other conversations — RLS filters at
  the row level.
- `unread_count` updates are participant-scoped (RLS UPDATE).
- Realtime subscriptions respect RLS (Supabase enforces this).
- Soft-deleted messages remain protected (status='sent'/'delivered'/
  'read' only — deleted messages are excluded from RLS SELECT).
- Conversation creation limits restrict STARTING new conversations
  only — existing conversations never get blocked.

## Transaction concurrency (spec Section 15, 16, 39, 40)

- `accept_transaction_offer()` SECURITY DEFINER uses
  `SELECT ... FOR UPDATE` + conditional `UPDATE ... WHERE status='submitted'`.
- Concurrent acceptance attempts: only one wins (returns TRUE); the
  others return FALSE without mutating state.
- `complete_transaction()` similar — only first completion succeeds.
- `cancel_transaction()` similar — only first cancellation succeeds.
- Self-acceptance prevention: customer cannot accept their own offer
  (checked at application layer AND inside the SECURITY DEFINER).
- Declined / withdrawn / expired offers cannot be accepted (DB-level
  status check inside the SECURITY DEFINER).
- Idempotency: UNIQUE partial indexes on
  `(property_id, customer_id, transaction_type) WHERE active`
  and `(transaction_id, submitted_by) WHERE status='submitted'`.

## Featured listing credits (spec Section 17)

- `featured_listing_credits.remaining` has a CHECK constraint
  `>= 0` (DB-level — defence-in-depth beyond app-layer validation).
- Credit deduction is atomic (conditional UPDATE where remaining >= cost).
- Credit restoration uses the append-only ledger
  (`featured_credit_transactions`).
- No "promotion without payment/credit" path — the action verifies
  credit balance before creating the promotion.

## Advertising security (spec Section 18)

- Minimum ₦5,000 budget enforced at DB layer (`budget_naira >= 500000`).
- `spent_naira <= budget_naira` CHECK constraint.
- Campaign status machine: cannot activate without payment
  (status flow: draft → pending_payment → pending_review → active).
- Advertiser ownership verified before any campaign action.
- Creative target URL is validated via `safeUrl()` (no internal hosts,
  no javascript:/data:/file: schemes).
- Sponsored ads are clearly labeled (UI component enforces this).

## Notifications security (spec Section 19)

- `dispatch_notification()` SECURITY DEFINER rejects absolute URLs in
  `href` (defence-in-depth at DB layer).
- Notification recipients are resolved server-side — the dispatcher
  takes a `recipientId` that comes from a server action (which
  resolved it from the action context, not from the request body).
- Users cannot create arbitrary notifications for themselves or
  other users — there is no client-facing "send notification" endpoint.
- Email templates escape all user content via `escapeHtml()`.
- Unsubscribe links are personalised per (email, category) and
  cannot modify another user's preferences (server resolves profile
  from email).
- Mandatory categories (security, verification, payments) cannot be
  unsubscribed from.

## Admin security (spec Section 20)

- Admin authorization: `requireAdmin()` + `requireAdminPermission()`.
- Admin identity resolved from `admin_users` table (NOT profiles.role).
- Admin actions are audit-logged via `recordAdminAction()` — writes
  to BOTH `audit_logs` AND `admin_action_records`.
- High-impact actions (ban, remove, revoke) require a reason
  (enforced by `ConfirmDialog` + server-side validation).
- Admin module has NO SQL console, NO raw DB mutation path.
- Service-role key is NEVER exposed to the browser —
  `src/lib/db/supabase/admin.ts` is server-only.
- Admin destructive actions use specific button labels ("Suspend
  User", "Reject Verification") — never vague "Continue".

## Audit log integrity (spec Section 21)

- `audit_logs`: INSERT-only (no UPDATE/DELETE policies).
- `admin_action_records`: server-only (NO client policy).
- Both tables have RLS enabled with no client UPDATE/DELETE path.
- The application UI has no way to edit or delete audit records.

## Security headers (spec Section 22)

Configured in `next.config.ts`:

| Header | Value |
|---|---|
| X-Content-Type-Options | nosniff |
| X-Frame-Options | DENY |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(), microphone=(), geolocation=(self) |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload |
| Content-Security-Policy | default-src 'self'; frame-ancestors 'none'; ... |

CSP is intentionally permissive in development (Next.js fast-refresh
needs `unsafe-eval` + `unsafe-inline` for scripts/styles). In
production, the CSP is tightened: `script-src 'self'` only.

## Secrets / env security (spec Section 23)

- `.env` is git-ignored (`.env*` pattern in `.gitignore`).
- `.env.example` contains variable names only — never real secrets.
- Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`,
  etc.) do NOT use the `NEXT_PUBLIC_` prefix.
- `src/lib/security/server-config.ts` is server-only — never imported
  from a client component.
- `src/lib/db/supabase/admin.ts` warns explicitly: "Never Import
  this module from a client component."

## File upload security (spec Section 10)

- Verification documents: PRIVATE bucket — applicant-only read/write.
- Message attachments: PRIVATE bucket — participants-only.
- Report evidence: PRIVATE bucket — reporter + admin only.
- Avatars / property-media / advertising-creatives: public read,
  owner-scoped write path (`auth.uid()/file.ext`).
- Storage paths use `auth.uid()` as the first segment so users can't
  write to other users' folders.
- MIME type validation: not trusted from the browser alone —
  file-validation tests verify the server-side checks.
- File size + extension allowlists enforced at the application layer.

## Input validation (spec Section 7)

- Centralised Zod schemas in `src/lib/validation/`:
  - `auth.ts` — signup, login, password reset
  - `security.ts` — property, message, review, offer, advertising,
    coordinates, URLs, reasons
- Server actions call `schema.safeParse(input)` — client-side
  validation is for UX only.
- Phone numbers normalised to E.164 via `normalizeNigerianPhone()`.
- Coordinates validated to (-90, 90) / (-180, 180).
- URLs validated via `safeUrl()` (rejects javascript:/data:/file:/
  blob: schemes; rejects internal hosts in SSRF mode).
- Reason text minimum lengths enforced (3-10 chars depending on action).

## XSS / HTML injection (spec Section 8)

- All user-generated content is HTML-escaped before rendering:
  - Message body: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`
  - Review body: same
  - Property description: `sanitizeDescription()`
  - Email templates: `escapeHtml()`
- `dangerouslySetInnerHTML` is NEVER used on user content.
- Property titles are screened for `<script` / `javascript:` patterns
  via Zod refine.

## Open redirect / SSRF (spec Section 9)

- `safeRelativeRedirect()` validates `next=` params:
  - Rejects absolute URLs
  - Rejects protocol-relative URLs (`//evil.com`)
  - Rejects backslash-prefixed attacks
  - Rejects `/javascript:` scheme injection
  - Rejects `/admin` / `/api` / `/forbidden` paths
- `safeUrl()` for external URLs:
  - Rejects `javascript:` / `data:` / `file:` / `vbscript:` / `blob:`
  - In SSRF mode, only allowlisted external hosts are accepted
  - Rejects internal hosts (localhost, 127.x, 10.x, 192.168.x, 169.254.x,
    ::1, fc00::/7, .local)

## Logging safety (spec Section 28)

`src/lib/logging/index.ts` redacts these keys before emission:
- password, passwordhash, confirmpassword
- secret, authorization, token, accesstoken, refreshtoken, sessionid
- cookiedata, service_role_key, anonkey, secretkey, publickey
- webhookhash, encryptionkey
- stripe, paystack_secret_key, flutterwave_secret_key

Logs are structured JSON (ingestable by Vercel/Sentry/Datadog).

## Error handling (spec Section 27)

- Auth errors use `safeAuthErrorMessage()` — returns generic
  "Invalid email or password." instead of leaking whether the email
  exists.
- Server actions return generic messages ("We couldn't do X.") —
  raw DB errors are logged server-side but NOT returned to the client.
- Production errors are logged with structured context (user id, action,
  sanitised metadata).

## Database integrity (spec Section 25)

- UNIQUE partial indexes prevent duplicates:
  - `(property_id, customer_id, transaction_type) WHERE active` —
    one active transaction per (property, customer, type)
  - `(transaction_id, submitted_by) WHERE status='submitted'` —
    one active offer per submitter per transaction
  - `(reviewer_id, reviewed_id, application_id)` WHERE application_id
    IS NOT NULL — one review per (reviewer, reviewee, application)
  - `(reviewer_id, reviewed_id, conversation_id)` WHERE conversation_id
    IS NOT NULL
  - `(reviewer_id, reviewed_id, transaction_id)` WHERE transaction_id
    IS NOT NULL
  - `property_media(property_id) WHERE is_featured = true` — one
    featured cover photo per property
- CHECK constraints:
  - `featured_listing_credits.remaining >= 0`
  - `advertising_campaigns.spent_naira <= budget_naira`
  - `advertising_campaigns.budget_naira >= 500000`
  - `properties.price >= 0`
  - `reviews.rating BETWEEN 1 AND 5`
  - role / tier / status enums on every status column

## Known residual risks

1. **In-memory rate limiter** — single-instance only. Multi-instance
   production (Vercel) needs Redis-backed V2 via the same interface.

2. **Paystack webhook hash fallback** — when `PAYSTACK_WEBHOOK_HASH`
   is not configured, the adapter parses without verification (dev
   only). Production MUST set this env var. The webhook route logs
   a warning when this happens.

3. **CSP dev permissiveness** — `unsafe-eval` + `unsafe-inline` in
   scripts/styles is required for Next.js fast-refresh in dev.
   Production CSP is tightened to `script-src 'self'`.

4. **No background offer-expiry worker** — offer expiry is evaluated
   on read (server-side time check in `accept_transaction_offer` and
   in the actions module). A cron worker that proactively marks
   expired offers + sends "your offer expired" notifications is a
   future enhancement.

5. **No SMS / push notifications** — V1 covers in-app + email only
   (per spec Section 44).

6. **No advanced fraud detection** — the dashboard surfaces signals
   for human moderation but does not auto-ban based on heuristics
   (per spec Section 42).

7. **System-message posting on transaction events** — the
   `transactions.conversation_id` column is wired but auto-posting
   system messages on workflow events (inspection confirmed, offer
   accepted, etc.) is a future enhancement. Notifications cover V1.

8. **Realtime subscription scope** — the notification bell subscribes
   to INSERT events on `notifications` for the caller. RLS enforces
   that the caller only sees their own notifications, but the
   subscription is per-process (no cross-user leak).

9. **Multi-instance session refresh** — the middleware refreshes the
   session cookie on every request, which works for single-instance.
   Multi-instance production should use Supabase's session refresh
   endpoint + Vercel's edge config for distributed session state.

## Incident response basics

See `docs/INCIDENT_RESPONSE.md` for the runbook.

## Production deployment requirements

See `docs/PRODUCTION_CHECKLIST.md` for the pre-deploy checklist.
