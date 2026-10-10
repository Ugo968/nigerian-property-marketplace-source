# Shelty — Nigerian Real-Estate Marketplace

**Version 1.0.0 — Production Ready**

Nigeria's trusted marketplace for property rentals, sales, and short-lets. Built for landlords, independent agents, and real-estate companies.

## Status

**v1.0.0 — production-ready.** All 20 build phases complete. The application is feature-frozen; remaining work is operational launch, business setup, content, real-world moderation, marketing, and ongoing maintenance.

## What's included

### Marketplace core
- **Authentication** — Supabase Auth, cookie-based sessions, email verification, password reset, account-status enforcement (active / suspended / banned / pending / deactivated)
- **Onboarding** — role-specific onboarding (landlord / agent / company), profile completeness scoring
- **Profiles** — public/private profile data, role-specific fields (landlord / agent / company), verification badges
- **Verification** — Bronze + Blue tiers, document upload (private bucket), admin review workflow
- **Property listings** — draft → publish lifecycle, media (photos + videos), amenities, anti-spam validation, ownership/representation model
- **Search & discovery** — URL-driven search, filtering, ranking, saved properties, saved searches with alert levels
- **Maps** — OpenStreetMap + Leaflet, geocoding, public/private coordinate distinction
- **Agent applications** — representation system, EXCLUDE constraint prevents duplicate active applications
- **Messaging** — conversations, realtime, rate-limited, verification restrictions, block system
- **Reviews** — rating 1–5, eligibility via qualifying interaction, moderation (hide/remove/restore)
- **Subscriptions** — Free / Pro / Premium per role, capability system, monthly usage tracking
- **Payments** — Paystack + Flutterwave, server-side verification, webhook idempotency
- **Featured listings** — credit ledger, promotion products, search boost (does NOT override hard filters)
- **Advertising** — advertiser businesses, campaigns, creatives, moderation queue, ₦5,000 minimum budget
- **Notifications** — in-app + email, 12 category groups, mandatory vs optional, preferences, unsubscribe
- **Property transactions** — inquiry → inspection → negotiation → offer → completion workflow, concurrency-safe
- **Admin dashboard** — 14 admin sections, permission-based RBAC, audit-logged moderation actions

### Production hardening
- 26 SQL migrations, all idempotent
- RLS on every sensitive table (33 tables)
- 114 security regression tests
- 992 unit tests across 32 test files
- Centralised input validation (Zod)
- Open-redirect + SSRF protection (`safe-url.ts`)
- Rate limiting on all sensitive operations (14 rate-limit buckets)
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- Append-only audit logs + moderation history

### Critical V1 boundary
The platform does **NOT** hold property transaction money. No escrow, no rent collection, no purchase-money processing, no commission payments. Paystack/Flutterwave are used only for platform payments (subscriptions, featured listings, advertising).

## Tech stack

- **Framework:** Next.js 16 (App Router) + TypeScript 5
- **Styling:** Tailwind CSS 4 + shadcn/ui (New York style)
- **Database:** Supabase Postgres with Row-Level Security (RLS)
  - Local dev fallback: Prisma + SQLite
- **Auth:** Supabase Auth (cookie-based sessions via @supabase/ssr)
- **Storage:** Supabase Storage (6 buckets, per-bucket RLS)
- **Realtime:** Supabase Realtime (notifications + messaging)
- **Payments:** Paystack + Flutterwave behind a provider abstraction
- **Maps:** OpenStreetMap + Leaflet (free; Google Maps upgradeable later)
- **Email:** Resend (with provider abstraction for SendGrid/Postmark)
- **Deployment:** Vercel (standalone output)

## Project structure

```
src/
  app/            — App Router pages (public / auth / dashboard / admin)
  components/     — Reusable UI + layout components
  lib/            — Application logic, data access, external services
  types/          — Centralised domain types
  middleware.ts   — Auth session refresh + route protection
supabase/
  migrations/     — 26 ordered SQL migrations (0001–0026)
  seed/           — Dev seed data (property types, amenities, plans)
docs/             — 26 documentation files
tests/            — 32 unit/integration/security test files
```

## Quick start

```bash
# Install deps
bun install

# Copy env template and fill in real values
cp .env.example .env.local

# Run migrations (requires Supabase project)
# Apply supabase/migrations/*.sql in order via Supabase Studio or psql

# Lint
bun run lint

# Typecheck
npx tsc --noEmit

# Run tests
bun test tests/unit/

# Local dev
bun run dev
```

## Documentation

### Architecture & product
- `docs/ARCHITECTURE.md` — module map, layering, key decisions
- `docs/PRODUCT_SPEC.md` — master product requirements
- `docs/DATABASE.md` / `docs/DATABASE_DESIGN.md` — entity relationships, RLS strategy, constraints
- `docs/AUTHENTICATION.md` — signup, login, onboarding, sessions, role model
- `docs/PROFILES.md` — public/private profile data, role-specific fields
- `docs/VERIFICATION.md` — verification levels, eligibility, document security
- `docs/PROPERTIES.md` — property model, ownership, lifecycle, media
- `docs/SEARCH.md` — search, filtering, ranking, saved items
- `docs/MAPS.md` — map provider, geocoding, public/private coordinates
- `docs/APPLICATIONS.md` — agent applications, representation, status machine
- `docs/MESSAGING.md` — conversations, messages, realtime, limits
- `docs/REVIEWS.md` — reviews, ratings, reputation, eligibility
- `docs/SUBSCRIPTIONS.md` — plans, capabilities, entitlements
- `docs/PAYMENTS.md` — Paystack, Flutterwave, webhooks, verification
- `docs/FEATURED.md` — promotion products, credit ledger, search boost
- `docs/ADVERTISING.md` — advertiser businesses, campaigns, placements
- `docs/NOTIFICATIONS.md` — notification system, email templates, preferences
- `docs/TRANSACTIONS.md` — property transaction workflow, state machine
- `docs/ADMIN.md` — admin dashboard, moderation, RBAC

### Security & operations
- `docs/SECURITY.md` — security architecture, trust boundaries, RLS strategy
- `docs/QA.md` — test suite breakdown, coverage gaps
- `docs/THREAT_MODEL.md` — STRIDE analysis, attack surfaces
- `docs/INCIDENT_RESPONSE.md` — severity classification, incident playbooks
- `docs/PRODUCTION_CHECKLIST.md` — pre-deploy env + config checklist
- `docs/LAUNCH_CHECKLIST.md` — pre-launch gate checklist
- `docs/DEVELOPMENT.md` — local setup, scripts

## Safety warning (always displayed)

> Stay safe: Always inspect the property in person and independently verify the owner/agent, ownership documents, property details, and payment information before making any payment or commitment.

The platform does NOT verify that money changed hands. Transaction completion is user-reported. Verification badges do not guarantee legitimacy. Featured/promoted listings are not automatically trustworthy.

## License

Proprietary. All rights reserved.
