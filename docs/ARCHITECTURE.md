# ARCHITECTURE

This document records the architectural decisions of the Shelty marketplace as actually implemented in this repository.

## Layering

The application is layered top-down. Each layer may only call the layer directly below it (or shared utilities). Sensitive business logic never lives in client components.

```
┌─────────────────────────────────────────────────────────────┐
│  UI Layer  (src/components, src/app)                          │
│  - Presentation components, page composition                 │
│  - No business logic, no direct DB access                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ calls
┌──────────────────────▼──────────────────────────────────────┐
│  Application / Service Layer  (src/services)                  │
│  - Business workflows (property publish, application submit) │
│  - Orchestration across multiple data sources                │
│  - Authoritative validation + authorization                  │
└──────────────────────┬──────────────────────────────────────┘
                       │ calls
┌──────────────────────▼──────────────────────────────────────┐
│  Data Access + External Services  (src/lib)                  │
│  - Supabase clients, payment adapters, email, maps, storage │
│  - All cross-cutting concerns live here                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  Domain Types + Shared Utils  (src/types, src/lib/utils)     │
│  - Pure, side-effect-free, importable from anywhere          │
└──────────────────────────────────────────────────────────────┘
```

## Module map

| Bounded context | Location | Notes |
|---|---|---|
| Identity & Auth | `src/lib/auth/`, `src/middleware.ts` | Supabase cookie sessions; middleware refreshes sessions on every request and gates `/dashboard`, `/admin`, `/onboarding` |
| Auth server actions | `src/lib/auth/actions.ts` | signup, login, logout, password reset, resend-verification |
| Onboarding server actions | `src/lib/auth/onboarding-actions.ts` | submitLandlordOnboarding, submitAgentOnboarding, submitCompanyOnboarding |
| Profiles & Onboarding | `src/lib/profiles/completeness.ts`, `src/lib/profiles/onboarding-context.ts` | Completeness calculator + role-aware onboarding context fetcher |
| Property Listings | (future) `src/services/properties/` | |
| Search & Discovery | (future) `src/services/search/` | |
| Maps & Location | `src/lib/maps/` | OSM default; swap to Google Maps by replacing the singleton |
| Saved Items | (future) `src/services/saved/` | |
| Agent Representation | (future) `src/services/applications/` | Status machine defined in `src/types/applications.ts` |
| Messaging | (future) `src/services/messaging/` | Realtime via Supabase; plan-based new-conversation limits |
| Reviews & Ratings | (future) `src/services/reviews/` | Tied to closed applications / conversations |
| Verification | (future) `src/services/verification/` | Bronze / Blue tiers; separate from subscription |
| Subscriptions & Plans | `src/lib/subscriptions/`, `src/lib/capabilities/` | Plan matrix is the single source of truth for pricing |
| Payments | `src/lib/payments/` | Adapter pattern: Paystack + Flutterwave |
| Featured Listings | (future) `src/services/featured/` | |
| Advertising | (future) `src/services/advertising/` | Separate from marketplace roles |
| Notifications | `src/lib/notifications/` | Dispatcher abstraction |
| Admin / Moderation | (future) `src/services/admin/` | Service-role only |
| Audit Log | `public.audit_logs` (migration 0001) | Append-only |
| Teams / Staff | (future) `src/services/teams/` | Company-only; plan-gated |

## Supabase client architecture

Three distinct clients live in `src/lib/db/supabase/`:

| Client | File | Use | RLS-bound? |
|---|---|---|---|
| Browser | `browser.ts` | Client Components | ✅ as authenticated user (or anon) |
| Server | `server.ts` | Server Components, Route Handlers, Server Actions | ✅ as authenticated user |
| Admin | `admin.ts` | Payment webhooks, automated jobs, verified admin actions | ❌ service-role bypasses RLS |

The admin client is **never** imported by client components. Its import path touches `SUPABASE_SERVICE_ROLE_KEY`, which is not exposed to the browser via `NEXT_PUBLIC_*`.

## Authentication & sessions

- Sessions are cookie-based via `@supabase/ssr`.
- `src/middleware.ts` runs on every matched route, refreshing the session cookie and gating `/dashboard` + `/admin`.
- Server-side helpers `getCurrentUser()`, `requireUser()`, `requireRole(role)`, `requireAdmin()` live in `src/lib/auth/server.ts`.
- Logout, sign-in, and reset request helpers are in `src/lib/auth/browser.ts` (client-callable).

## Capability system

Code NEVER writes `if plan === "premium"`. Instead it asks:

```ts
import { capabilitiesFor } from "@/lib/capabilities";

const caps = capabilitiesFor(user.role, user.subscriptionTier);
if (!caps.canBulkManage) return forbidden();
```

Concrete capability values per `(role, tier)` pair live in `src/lib/capabilities/index.ts`. Adjusting a feature's tier gating is a one-file change.

## Subscription plans

`src/lib/subscriptions/plans.ts` is the **only** place where Naira amounts are hard-coded. Prices from the master specification:

| Role | Free | Pro | Premium |
|---|---|---|---|
| Landlord | ₦0 | ₦3,500 | ₦9,500 |
| Agent | ₦0 | ₦5,000 | ₦12,000 |
| Company | ₦0 | ₦20,000 | ₦35,000+ |

`₦35,000+` for Company Premium is the **base** — actual billed amount can exceed it via add-ons (extra team seats, featured-credit top-ups).

## Payment provider abstraction

```
PaymentProviderAdapter (interface, src/types/payments.ts)
├── PaystackAdapter     src/lib/payments/paystack.ts
└── FlutterwaveAdapter  src/lib/payments/flutterwave.ts
```

Adding a new provider = implement the interface + register in `src/lib/payments/index.ts`.

**Critical:** payments are NEVER marked successful based on the browser response. State transitions only happen on a server-side verified provider webhook with signature check (see `docs/SECURITY.md`).

## Maps

`src/lib/maps/` exposes a `MapProvider` interface. Default implementation is OpenStreetMap (free, no API key). To swap to Google Maps, replace the singleton in `src/lib/maps/index.ts` — call sites are unchanged.

For privacy, `publicApproximate(lat, lng)` rounds coordinates to ~100m so exact private addresses are not exposed on the public map.

## Validation

Zod schemas live in `src/lib/validation/`. Each domain has its own file (`auth.ts`, future `properties.ts`, `applications.ts`, etc.). The same schema is used by both client forms (instant feedback) and server actions (authoritative check). Client-side validation is for UX only — server `parse()` is the source of truth.

## Logging

`src/lib/logging/index.ts` exports a structured JSON logger. All PII / secret-bearing fields are redacted before emission (passwords, tokens, secret keys, webhook hashes, etc.). Logs go to stdout/stderr so Vercel / Sentry / Datadog can ingest them.

## Migrations

Supabase SQL migrations live in `supabase/migrations/` and are numbered `NNNN_description.sql`. The complete migration set for the database foundation phase:

```
0001_initial_foundation             ← pgcrypto, set_updated_at(), profiles, admin_users, audit_logs
0002_profile_extensions             ← account_status, deleted_at, full_name, preferred_location
0003_role_specific_profiles          ← landlord_profiles, agent_profiles, company_profiles
0004_verification                     ← applications, documents, reviews, history
0005_properties                       ← property_types, properties, property_locations
0006_property_media_and_amenities    ← amenities, property_amenities, property_media
0007_applications_and_interactions   ← property_applications, property_interactions
0008_saved_items                      ← saved_properties, saved_searches, property_alerts
0009_subscriptions                    ← subscription_plans, user_subscriptions
0010_payments                         ← payments, payment_events
0011_featured_listings                ← featured_listing_credits, featured_listings
0012_advertising                      ← businesses, creatives, campaigns, master lists
0013_reviews                          ← reviews
0014_messaging                        ← conversations, participants, messages, blocks
0015_notifications                    ← notifications
0016_reports                          ← reports
0017_database_functions               ← SECURITY DEFINER helpers (is_admin, can_manage_property, etc.)
0018_storage_policies                 ← per-bucket RLS for Supabase Storage
```

Each migration is idempotent (`create table if not exists`, `on conflict do nothing`).

See `docs/DATABASE.md` for full entity relationships, RLS strategy, constraints, and the ER diagram.

## Database types

`src/types/database.ts` contains hand-maintained TypeScript row types mirroring the live Postgres schema. In production, replace with `supabase gen types typescript` output — the file structure is compatible.

All three Supabase clients (`browser`, `server`, `admin`) are now typed against the `Database` shape from `src/types/database.ts`, so queries have full type safety from call site to schema.

## External provider state

In the foundation phase, Paystack / Flutterwave / Email / SMS / Maps adapters are structurally present but return stub responses when env vars are missing. This lets the foundation boot and exercise the call sites without real credentials. The next prompt will wire up real HTTP calls + webhook signature verification.
