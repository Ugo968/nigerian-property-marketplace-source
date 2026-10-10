# PRODUCTION CHECKLIST

Pre-deploy checklist for the Shelty marketplace.

## Environment variables (REQUIRED)

```bash
# Application
NEXT_PUBLIC_APP_URL=https://naijahaus.example

# Supabase (production project)
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>     # server-only — NEVER NEXT_PUBLIC_

# Paystack
PAYSTACK_PUBLIC_KEY=<pub-key>
PAYSTACK_SECRET_KEY=<secret-key>                  # server-only
PAYSTACK_WEBHOOK_HASH=<webhook-hash>              # CRITICAL — webhook signature verification

# Flutterwave
FLUTTERWAVE_PUBLIC_KEY=<pub-key>
FLUTTERWAVE_SECRET_KEY=<secret-key>               # server-only
FLUTTERWAVE_WEBHOOK_HASH=<webhook-hash>           # CRITICAL
FLUTTERWAVE_ENCRYPTION_KEY=<encryption-key>       # server-only

# Email (Resend / SendGrid / Postmark)
EMAIL_PROVIDER_API_KEY=<api-key>                   # server-only
EMAIL_FROM_ADDRESS=no-reply@naijahaus.example
EMAIL_FROM_NAME=Shelty

# Maps (optional — defaults to free OpenStreetMap)
MAPS_PROVIDER_KEY=<optional>

# Admin seeding (first-run only — comma-separated emails)
ADMIN_EMAILS=admin@naijahaus.example

# Cron shared secret (for /api/cron/* endpoints)
CRON_SECRET=<random-64-char-string>

# Logging
LOG_LEVEL=info
```

## Database

- [ ] All migrations applied (0001 through 0026)
- [ ] RLS enabled on every table (verify with
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND
      rowsecurity = false` — should return empty)
- [ ] Seed data applied (property_types, amenities, subscription_plans,
      advertiser_categories, advertising_placements, report_categories,
      platform_settings)
- [ ] Supabase Storage buckets created (avatars, property-media,
      verification-documents, advertising-creatives, message-attachments,
      report-evidence)
- [ ] Realtime publication includes `notifications` table

## Supabase project settings

- [ ] Auth → Email auth enabled
- [ ] Auth → Email confirmations ON (users must verify email)
- [ ] Auth → Session expiry ≤ 7 days
- [ ] Auth → Cookie options: httpOnly, Secure, SameSite=Lax
- [ ] Database → RLS enabled globally
- [ ] Storage → Per-bucket policies applied (migration 0018)
- [ ] Realtime → `notifications` table added to publication

## Paystack dashboard

- [ ] Webhook URL set to `https://<domain>/api/webhooks/paystack`
- [ ] Webhook hash generated and matches `PAYSTACK_WEBHOOK_HASH` env var
- [ ] Test mode disabled for production keys

## Flutterwave dashboard

- [ ] Webhook URL set to `https://<domain>/api/webhooks/flutterwave`
- [ ] Webhook hash matches `FLUTTERWAVE_WEBHOOK_HASH` env var
- [ ] Encryption key matches `FLUTTERWAVE_ENCRYPTION_KEY` env var

## Email provider (Resend)

- [ ] Domain verified (`naijahaus.example`)
- [ ] `EMAIL_FROM_ADDRESS` matches a verified sender
- [ ] API key has `sending_access` scope only (not full access)

## Admin seeding

- [ ] At least one super_admin user created via `admin_users` table
      OR `ADMIN_EMAILS` env var lists the bootstrap admin email(s)
- [ ] Test: log in as the admin email → /admin accessible
- [ ] Test: log in as a normal user → /admin redirects to /forbidden

## Build + deploy

- [ ] `npm run build` succeeds (no TypeScript errors)
- [ ] `npm run lint` clean (no warnings)
- [ ] `bun test tests/unit/` all pass
- [ ] Deploy to staging → smoke test critical paths
- [ ] Deploy to production

## Smoke tests (post-deploy)

1. Sign up a new landlord → verify email → complete onboarding →
   create a property draft → publish
2. Sign up a new agent → apply to represent a property → owner
   accepts → representation established
3. Sign in as the landlord → send a message to the agent → agent
   receives notification
4. Initiate a subscription payment → verify webhook activates the
   subscription
5. Submit a report → admin sees it in /admin/reports
6. Admin suspends a user → user is redirected to /account-suspended

## Monitoring

- [ ] Vercel logs ingested into Datadog/Sentry (structured JSON)
- [ ] Error alerting on `level: "error"` logs
- [ ] Webhook failure alerting (signature verification failures)
- [ ] Rate-limit threshold alerting (when buckets fill up)
- [ ] Uptime monitoring on `/` and `/api/notifications/unread-count`

## Backups

- [ ] Supabase automated daily backups enabled
- [ ] Test restore from a backup at least once before launch
- [ ] Document the restore procedure in the runbook
