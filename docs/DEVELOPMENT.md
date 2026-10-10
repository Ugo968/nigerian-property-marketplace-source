# DEVELOPMENT

## Prerequisites

- Node.js 20+ (or Bun 1.3+)
- A Supabase project (for production-like local dev) — optional in foundation phase
- Paystack + Flutterwave accounts — optional in foundation phase

## Local setup

```bash
# 1. Install dependencies
bun install

# 2. Copy the env template
cp .env.example .env.local

# 3. Fill in the values you have. Foundation works without real Supabase /
#    payment credentials — they're only needed when the corresponding
#    feature prompts land.

# 4. Run the dev server (sandbox auto-starts this; do not run manually)
bun run dev

# 5. Lint
bun run lint
```

Open the preview panel on the right to view the running app at `http://localhost:3000`.

## Scripts

| Script | What it does |
|---|---|
| `bun run dev` | Start Next.js dev server on port 3000 (auto-started by sandbox) |
| `bun run lint` | Run ESLint (Next.js rules + typescript-eslint) |
| `bun run build` | Production build (do not run in sandbox — see notes below) |
| `bun run db:push` | Push Prisma schema to local SQLite (foundation fallback DB) |
| `bun run db:generate` | Regenerate Prisma client |

> **Note on `build`:** the sandbox auto-runs `bun run dev`. Do not run `bun run build` in the sandbox — it would compete with the dev server. Type and lint checks (`bun run lint`) are sufficient for foundation-phase verification.

## Project structure (high level)

```
src/
├── app/
│   ├── (auth)/         # login, signup, reset-password
│   ├── (marketplace)/  # properties, agents, companies
│   ├── dashboard/      # authenticated user area
│   ├── admin/          # admin-only area
│   ├── forbidden/      # 403
│   ├── api/            # route handlers
│   ├── layout.tsx      # root layout + ThemeProvider
│   ├── page.tsx        # landing page (showcase)
│   ├── not-found.tsx   # 404
│   └── global-error.tsx  # 500
├── components/
│   ├── ui/             # shadcn/ui primitives
│   ├── layout/         # public / auth / dashboard / admin layouts
│   └── ...             # feature component folders (filled later)
├── lib/
│   ├── auth/           # Supabase session helpers
│   ├── capabilities/   # capability system (replaces `if plan === premium`)
│   ├── db/supabase/    # browser / server / admin clients
│   ├── logging/        # structured, secret-redacting logger
│   ├── maps/           # OSM default provider
│   ├── notifications/  # email + dispatcher abstractions
│   ├── payments/       # Paystack + Flutterwave adapters
│   ├── security/       # server-config, headers, rate-limit
│   ├── subscriptions/  # plan matrix (the only place prices live)
│   └── validation/     # Zod schemas
├── services/           # business workflows (filled in later prompts)
├── types/              # centralised domain types
└── middleware.ts       # session refresh + route protection
```

## Roadmap

Foundation phase establishes the architecture. Each subsequent prompt implements one feature module without rewriting existing systems:

| Phase | Module |
|---|---|
| P1 | Identity & Onboarding (signup, role selection, profile completion) |
| P2 | Property Listings (CRUD, media, amenities, location) |
| P3 | Search, Filter, Maps |
| P4 | Saved Properties & Saved Searches |
| P5 | Agent Applications & Representation |
| P6 | Messaging |
| P7 | Reviews & Ratings |
| P8 | Verification System |
| P9 | Subscriptions & Limits Engine |
| P10 | Payments (Paystack + Flutterwave + webhooks) |
| P11 | Featured Listings |
| P12 | Advertising System |
| P13 | Notifications & Alerts |
| P14 | Reports & Moderation |
| P15 | Admin Dashboard |
| P16 | Teams / Staff (Company) |
| P17 | Polish, performance, accessibility |
| P18 | Production deployment |

## Foundation-phase verification

When you change the foundation, verify:

1. `bun run lint` passes
2. The dev server is still running (check `.zscripts/dev.log` or `dev.log`)
3. The landing page `/` renders correctly in the preview panel
4. The mobile nav and dashboard layout respond correctly at mobile / tablet / desktop widths

## Conventions

- **Types** centralised in `src/types/` — never re-invent role / tier / status strings
- **Pricing** lives only in `src/lib/subscriptions/plans.ts`
- **Capabilities** asked via `capabilitiesFor(role, tier)`, never via plan-string checks
- **Server-only secrets** never use `NEXT_PUBLIC_*`
- **External services** sit behind adapter interfaces — adding a provider is one file
- **Migrations** are numbered `NNNN_description.sql` and idempotent
- **No PII / secrets in logs** — the logger auto-redacts sensitive keys
