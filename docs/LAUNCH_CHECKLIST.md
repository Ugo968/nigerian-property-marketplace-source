# LAUNCH CHECKLIST

Final pre-launch gate for the Shelty marketplace.

## Before deployment

### Environment variables
- [ ] `NEXT_PUBLIC_APP_URL` set to the production domain (no localhost)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` set to the production Supabase project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set (server-only — NEVER NEXT_PUBLIC_)
- [ ] `PAYSTACK_PUBLIC_KEY` set
- [ ] `PAYSTACK_SECRET_KEY` set (server-only)
- [ ] `PAYSTACK_WEBHOOK_HASH` set (CRITICAL — webhook signature verification)
- [ ] `FLUTTERWAVE_PUBLIC_KEY` set
- [ ] `FLUTTERWAVE_SECRET_KEY` set (server-only)
- [ ] `FLUTTERWAVE_WEBHOOK_HASH` set
- [ ] `FLUTTERWAVE_ENCRYPTION_KEY` set (server-only)
- [ ] `EMAIL_PROVIDER_API_KEY` set (server-only)
- [ ] `EMAIL_FROM_ADDRESS` set to a verified sender
- [ ] `EMAIL_FROM_NAME` set to "Shelty"
- [ ] `MAPS_PROVIDER_KEY` set (optional — defaults to free OSM)
- [ ] `ADMIN_EMAILS` set with bootstrap admin email(s)
- [ ] `CRON_SECRET` set (for /api/cron/* endpoints)
- [ ] `AUTH_SECRET` set
- [ ] `LOG_LEVEL=info` (or `warn` for quieter production)

### Database migrations
- [ ] All 26 migrations applied in order (0001–0026)
- [ ] RLS enabled on all 33 sensitive tables
- [ ] Seed data applied (property types, amenities, subscription plans, advertiser categories, advertising placements, report categories, platform settings)
- [ ] No fake users / fake payments / fake reviews in production

### Supabase configuration
- [ ] Auth → Email auth enabled
- [ ] Auth → Email confirmations ON
- [ ] Auth → Session expiry ≤ 7 days
- [ ] Auth → Cookie: httpOnly, Secure, SameSite=Lax
- [ ] Database → RLS enabled globally
- [ ] Storage → 6 buckets created (avatars, property-media, verification-documents, advertising-creatives, message-attachments, report-evidence)
- [ ] Storage → per-bucket policies applied (migration 0018 + 0026)
- [ ] Realtime → `notifications` table added to `supabase_realtime` publication

### Payment configuration
- [ ] Paystack: production keys (NOT test keys)
- [ ] Paystack: webhook URL set to `https://<domain>/api/webhooks/paystack`
- [ ] Paystack: webhook hash matches env var
- [ ] Flutterwave: production keys (NOT test keys)
- [ ] Flutterwave: webhook URL set to `https://<domain>/api/webhooks/flutterwave`
- [ ] Flutterwave: webhook hash matches env var

### Email configuration
- [ ] Email provider domain verified
- [ ] `EMAIL_FROM_ADDRESS` matches a verified sender
- [ ] API key scope limited to sending (not full account access)

### Domain configuration
- [ ] `NEXT_PUBLIC_APP_URL` = production domain
- [ ] Supabase auth redirect URLs use production domain
- [ ] Payment callback URLs use production domain
- [ ] Webhook URLs use production domain
- [ ] Email links use production domain
- [ ] No localhost / 127.0.0.1 / example.com in production code paths

### CI/CD
- [ ] GitHub Actions (or equivalent) pipeline runs: install → lint → typecheck → unit tests → build
- [ ] Pipeline fails on critical check failures
- [ ] Production deploy requires manual approval (or protected branch)

## Before opening registration

### Signup + login
- [ ] Landlord signup works (email verification → onboarding)
- [ ] Agent signup works
- [ ] Company signup works
- [ ] Login with correct credentials works
- [ ] Login with incorrect password returns generic error
- [ ] Unverified email → blocked from /dashboard
- [ ] Suspended user → redirected to /account-suspended
- [ ] Banned user → redirected to /account-suspended
- [ ] Password reset flow works end-to-end
- [ ] Email verification resend works
- [ ] Session refresh works
- [ ] Logout works
- [ ] Multiple tabs share session

## Before accepting payments

### Provider verification
- [ ] Paystack credentials are production (not test)
- [ ] Flutterwave credentials are production (not test)
- [ ] Webhook signature verification is fail-closed
- [ ] Duplicate webhook handling works (payment_events idempotency)
- [ ] Server-side verification calls the provider (not browser redirect)
- [ ] Amount + currency + user validated server-side

### Subscription lifecycle
- [ ] Landlord Free / Pro ₦3,500 / Premium ₦9,500 — checkout works
- [ ] Agent Free / Pro ₦5,000 / Premium ₦12,000 — checkout works
- [ ] Company Free / Pro ₦20,000 / Premium ₦35,000+ — checkout works
- [ ] Failed payment does NOT activate subscription
- [ ] Entitlement changes apply immediately after activation
- [ ] Usage limits enforced (listings, photos, applications, messages, saved searches)

## Before public launch

### Security
- [ ] RLS audit complete (all 33 tables reviewed)
- [ ] IDOR/BOLA tests pass (security.test.ts)
- [ ] No secrets in git (`.env` untracked, `.env.example` has no real values)
- [ ] Security headers configured (CSP, HSTS, X-Frame-Options, etc.)
- [ ] Rate limits active on all sensitive operations

### Backups
- [ ] Supabase automated daily backups enabled
- [ ] Test restore from backup completed at least once
- [ ] Restore procedure documented (see `docs/INCIDENT_RESPONSE.md`)

### Monitoring
- [ ] Error alerting on `level: "error"` logs
- [ ] Webhook failure alerting
- [ ] Uptime monitoring on `/` and `/api/notifications/unread-count`
- [ ] Rate-limit threshold alerting

### Error handling
- [ ] No stack traces in user-facing error messages
- [ ] No DB connection details in error messages
- [ ] No environment variables in error messages
- [ ] Production errors logged server-side (structured JSON)

### SEO + accessibility
- [ ] Public pages have proper metadata (title, description, OG)
- [ ] Private pages have `robots: { index: false }`
- [ ] `robots.txt` disallows /dashboard, /admin, /api, etc.
- [ ] Sitemap configured for production domain
- [ ] No private addresses in public metadata
- [ ] Keyboard navigation works on all critical flows
- [ ] Focus states visible
- [ ] Forms have labels
- [ ] Sufficient contrast

### Mobile
- [ ] Navigation works on mobile (Sheet/Drawer)
- [ ] Signup works on mobile
- [ ] Property listing works on mobile
- [ ] Image upload works on mobile
- [ ] Filters work on mobile
- [ ] Maps work on mobile
- [ ] Messaging works on mobile
- [ ] Checkout works on mobile
- [ ] Transaction workflow works on mobile

### Performance
- [ ] Homepage loads < 3s on 3G
- [ ] Property search paginated (no unbounded queries)
- [ ] Images lazy-loaded
- [ ] No N+1 queries on dashboard/admin
- [ ] Realtime subscriptions scoped (no cross-user leak)

## Final GO / NO-GO

- [ ] All above items checked
- [ ] `npx tsc --noEmit` — 0 new errors
- [ ] `bun run lint` — clean
- [ ] `bun test tests/unit/` — all pass (992+)
- [ ] Production build succeeds
- [ ] Smoke test against production environment passes (Section 30)

**Decision: ________**
