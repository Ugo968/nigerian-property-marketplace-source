# Database Setup

This guide covers initializing a fresh database and connecting it to the application.

## Option A: Cloud Supabase (Recommended)

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → Sign up → New Project.
2. Name it, pick a region, set a strong password.
3. Wait for provisioning (~2 minutes).

### 2. Apply migrations

You need to run 28 SQL migration files in order. Each file is idempotent (safe to run multiple times).

**Via the SQL Editor (easiest):**

1. Go to your Supabase dashboard → **SQL Editor**.
2. For each file in `supabase/migrations/` starting from `0001_initial_foundation.sql` through `0028_property_types_and_location_extensions.sql`:
   - Open the file in your code editor
   - Copy the entire contents
   - Paste into the SQL Editor
   - Click **Run**
3. Then run each file in `supabase/seed/` (5 files: property types, amenities, subscription plans, advertiser categories, advertising placements) the same way.

**Via the Supabase CLI:**

```bash
# Install CLI (see SETUP_GUIDE.md)
# Link your project:
supabase link --project-ref your-project-ref

# Push all migrations:
supabase db push
```

### 3. Configure storage buckets

After migrations, go to **Storage** in the Supabase dashboard. The migration `0018_storage_policies.sql` creates the RLS policies, but you may need to create the buckets manually if they don't appear:

| Bucket | Public | Purpose |
|---|---|---|
| `avatars` | Yes | User profile photos |
| `property-media` | Yes | Property photos + videos |
| `verification-documents` | No | Verification documents (PRIVATE) |
| `advertising-creatives` | Yes | Ad campaign creatives |
| `message-attachments` | No | Chat attachments (PRIVATE) |
| `report-evidence` | No | Report evidence (PRIVATE) |

### 4. Configure authentication

1. Go to **Authentication** → **Providers**.
2. Enable **Email**.
3. Turn ON **Confirm email**.
4. Set **Site URL** to `http://localhost:3000` (dev) or your production URL.
5. Add `http://localhost:3000/**` to **Redirect URLs**.

### 5. Enable Realtime

1. Go to **Database** → **Replication**.
2. Ensure `supabase_realtime` publication is enabled.
3. The migration `0023_notifications_extensions.sql` adds the `notifications` table to the publication automatically.

---

## Option B: Local Supabase (for offline development)

### 1. Install Docker

Download from [docker.com](https://docker.com).

### 2. Install Supabase CLI

```bash
# Mac
brew install supabase/tap/supabase

# Or npm (cross-platform)
npm install -g supabase
```

### 3. Start local Supabase

```bash
# In your project directory:
supabase init   # Creates supabase/config.toml (skip if it exists)
supabase start  # Starts all Supabase services via Docker
```

This starts:
- Postgres on port 54322
- Auth on port 54321
- Storage on port 54321
- Realtime on port 54321

### 4. Apply migrations + seed

```bash
supabase db reset  # Creates a fresh database + runs all migrations + seeds
```

### 5. Set environment variables

In `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-local-service-role-key
```

The local anon key + service role key are printed when you run `supabase start`.

---

## Migration Reference

| # | File | What it creates |
|---|---|---|
| 0001 | `initial_foundation.sql` | profiles, admin_users, audit_logs, set_updated_at() function |
| 0002 | `profile_extensions.sql` | account_status, deleted_at, full_name, preferred_location |
| 0003 | `role_specific_profiles.sql` | landlord_profiles, agent_profiles, company_profiles |
| 0004 | `verification.sql` | verification_applications, documents, reviews, history |
| 0005 | `properties.sql` | property_types, properties, property_locations |
| 0006 | `property_media_and_amenities.sql` | amenities, property_amenities, property_media |
| 0007 | `applications_and_interactions.sql` | property_applications, property_interactions |
| 0008 | `saved_items.sql` | saved_properties, saved_searches, property_alerts |
| 0009 | `subscriptions.sql` | subscription_plans, user_subscriptions |
| 0010 | `payments.sql` | payments, payment_events |
| 0011 | `featured_listings.sql` | featured_listing_credits, featured_listings |
| 0012 | `advertising.sql` | advertiser_categories, placements, businesses, creatives, campaigns |
| 0013 | `reviews.sql` | reviews |
| 0014 | `messaging.sql` | conversations, participants, messages, blocks |
| 0015 | `notifications.sql` | notifications |
| 0016 | `reports.sql` | reports |
| 0017 | `database_functions.sql` | SECURITY DEFINER functions |
| 0018 | `storage_policies.sql` | per-bucket RLS for Supabase Storage |
| 0019 | `property_extensions.sql` | furnished_status, year_built, parking_spaces, floors |
| 0020 | `property_agent_representations.sql` | representation relationships |
| 0021 | `review_indexes.sql` | review query indexes |
| 0022 | `featured_credit_ledger.sql` | append-only credit transaction ledger |
| 0023 | `notifications_extensions.sql` | notification preferences, events, email delivery records |
| 0024 | `admin_extensions.sql` | admin_action_records, report_categories, platform_settings |
| 0025 | `property_transactions.sql` | transactions, inspections, offers, negotiation_records |
| 0026 | `security_hardening.sql` | tightened creative public-read, CHECK constraints |
| 0027 | `tenant_role.sql` | tenant_profiles, tenant_trial_usage, tenant plans |
| 0028 | `property_types_and_location_extensions.sql` | new property types, keyword mapping, LGA column |

## Seed Files (run AFTER all migrations)

| # | File | What it seeds |
|---|---|---|
| 001 | `property_types.sql` | 26+ property types (apartment, house, self-contained, etc.) |
| 002 | `amenities.sql` | 18 amenities (parking, security, swimming pool, etc.) |
| 003 | `subscription_plans.sql` | Subscription plan matrix (all roles × all tiers, including tenant) |
| 004 | `advertiser_categories.sql` | Advertiser business categories |
| 005 | `advertising_placements.sql` | Ad placement locations |

> **Important:** Seed files contain ONLY legitimate configuration data (property types, amenities, plan matrix). They do NOT create fake users, fake properties, fake reviews, or fake transactions.

---

## Verifying the Database

After applying all migrations + seeds, verify:

1. **Tables exist:** Go to Supabase dashboard → Table Editor. You should see 40+ tables.
2. **RLS is enabled:** Go to Database → Tables → click any table → check "RLS enabled" is ON.
3. **Seed data exists:** Go to Table Editor → `property_types` → should have 30+ rows. Same for `amenities`, `subscription_plans`.
4. **Storage buckets exist:** Go to Storage → should see 6 buckets.

---

## Resetting the Database

If you need a fresh start:

**Cloud:** Run `supabase db reset` (if using CLI) or manually re-run all migrations + seeds via SQL Editor.

**Local:** `supabase db reset` — this drops all data and re-applies all migrations + seeds.
