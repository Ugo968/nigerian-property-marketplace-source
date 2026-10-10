# Setup Guide — Shelty Nigerian Property Marketplace

This guide walks you through setting up the Shelty marketplace on your own computer, step by step. No prior knowledge of the internal architecture is required — just copy and paste the commands.

## Prerequisites

### 1. Install Node.js 20+

Download from [https://nodejs.org](https://nodejs.org) (LTS version). Verify:

```bash
node --version
# Should print v20.x.x or higher
```

### 2. Install Bun (package manager)

Bun is faster than npm and is the package manager used in this project.

**Mac/Linux:**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows:**
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Verify:
```bash
bun --version
# Should print 1.x.x
```

### 3. Install Git (optional, for version control)

Download from [https://git-scm.com](https://git-scm.com). Verify:
```bash
git --version
```

### 4. Create a Supabase Project (free)

1. Go to [https://supabase.com](https://supabase.com) and sign up (free tier).
2. Click **New Project**.
3. Name it `naijahaus` (or any name you like).
4. Choose a region close to your users (e.g. `West Europe` for Nigerian users via Cloudflare).
5. Set a strong database password — **save this somewhere safe**.
6. Click **Create new project** and wait ~2 minutes for it to provision.

### 5. Install Supabase CLI (optional, for local development)

If you want to run a local Supabase instance instead of the cloud:

```bash
# Mac
brew install supabase/tap/supabase

# Windows (Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Or via npm (cross-platform)
npm install -g supabase
```

> **Note:** You can skip the CLI and use the Supabase cloud dashboard directly. The CLI is only needed for local development with a local database.

---

## Installation

### Step 1: Extract the ZIP

Extract `nigerian-property-marketplace-source.zip` to a folder on your computer:

```bash
# Mac/Linux
unzip nigerian-property-marketplace-source.zip -d naijahaus
cd naijahaus

# Windows (PowerShell)
Expand-Archive nigerian-property-marketplace-source.zip -DestinationPath naijahaus
cd naijahaus
```

### Step 2: Install dependencies

```bash
bun install
```

This installs all required packages. It takes 1–3 minutes.

### Step 3: Create your environment file

Copy the example environment file:

```bash
cp .env.example .env.local
```

Now open `.env.local` in a text editor and fill in the values (see [Environment Variables](./docs/ENVIRONMENT_VARIABLES.md) for details):

```bash
# --- Application ---
NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- Supabase ---
# Get these from your Supabase project dashboard:
# Settings → API → Project URL + anon public key + service_role key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# --- Other services (optional for local dev) ---
# See docs/ENVIRONMENT_VARIABLES.md for what's required vs optional
```

Save and close the file.

### Step 4: Apply database migrations

You need to run the 28 SQL migrations against your Supabase database to create all tables, RLS policies, indexes, and storage buckets.

**Option A: Via Supabase Dashboard (easiest)**

1. Go to your Supabase dashboard → **SQL Editor**.
2. For each file in `supabase/migrations/` (in order from `0001` to `0028`), copy the entire file contents and paste into the SQL Editor, then click **Run**.
3. Repeat for all 28 files.
4. Then run each file in `supabase/seed/` (5 files) the same way — these insert the property types, amenities, and subscription plans.

**Option B: Via Supabase CLI**

```bash
# If using a local Supabase instance:
supabase db reset

# If connecting to your cloud Supabase project:
# 1. Link the project:
supabase link --project-ref your-project-ref
# 2. Push migrations:
supabase db push
```

### Step 5: Configure storage buckets

In your Supabase dashboard → **Storage**, create these 6 buckets (if they don't exist from the migration):

| Bucket | Public? | Purpose |
|---|---|---|
| `avatars` | Yes | User profile photos |
| `property-media` | Yes | Property photos + videos |
| `verification-documents` | **No (private)** | Verification documents |
| `advertising-creatives` | Yes (gated) | Advertising images |
| `message-attachments` | **No (private)** | Chat attachments |
| `report-evidence` | **No (private)** | Report evidence files |

The storage RLS policies (from migration `0018_storage_policies.sql`) are applied automatically when you run the migration.

### Step 6: Configure Supabase Auth

In your Supabase dashboard → **Authentication** → **Providers**:

1. Enable **Email** provider.
2. Under **Email → Confirm email**: turn ON (users must verify their email).
3. Under **URL Configuration → Site URL**: set to `http://localhost:3000` (for local dev).
4. Under **URL Configuration → Redirect URLs**: add `http://localhost:3000/**`.

### Step 7: Start the development server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Verification

Follow these steps to verify the application is working correctly:

### ✅ Homepage loads
Open `http://localhost:3000`. You should see the Shelty landing page with the hero section, subscription plans, and safety warning.

### ✅ Database connectivity
1. Go to `http://localhost:3000/properties`.
2. You should see the property search page with filters.
3. If the database is connected but empty, you'll see: **"No properties found"** — this is correct.
4. If the database is NOT connected, you'll see a configuration message.

### ✅ Authentication works
1. Click **Sign up** on the homepage.
2. Choose a role (Landlord, Agent, Company, or Tenant).
3. Fill in your email + password.
4. Check your email for a verification link.
5. Click the verification link → you're redirected to onboarding.

### ✅ Role-specific onboarding works
1. After email verification, you're redirected to `/onboarding/{your-role}`.
2. Fill in the onboarding form.
3. Click **Complete onboarding**.
4. You're redirected to `/dashboard`.

### ✅ Property listing form loads
1. From the dashboard, go to **Properties**.
2. Click **Create property** (if you're a landlord/agent/company).
3. The multi-step property creation wizard should load.

### ✅ Search works against real database records
1. Go to `/properties`.
2. Use the search + filters.
3. Results come from your actual Supabase database (empty if no properties exist yet).

### ✅ Empty states work
With an empty database, you should see:
- `/properties` → "No properties found"
- `/dashboard/saved` → "You haven't saved any properties yet"
- `/dashboard/messages` → "Your conversations will appear here"
- `/dashboard/notifications` → "No notifications yet"

### ✅ No secrets exposed in the browser
1. Open your browser's Developer Tools (F12).
2. Go to the **Network** tab.
3. Reload the page.
4. Check that no `service_role_key`, `PAYSTACK_SECRET_KEY`, or `FLUTTERWAVE_SECRET_KEY` appears in any response.

---

## Common Errors and Fixes

### Error: "Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL"
**Fix:** You haven't created `.env.local` or it's missing the Supabase URL. Run `cp .env.example .env.local` and fill in the values from your Supabase dashboard.

### Error: "Database not configured" or blank page
**Fix:** Your `.env.local` has placeholder values. Replace `your_supabase_project_url` etc. with real values from your Supabase dashboard → Settings → API.

### Error: "Invalid login credentials" on signup
**Fix:** Email confirmation is likely enabled. Check your email for a verification link. If you didn't receive it, go to Supabase dashboard → Authentication → Users to manually confirm the email.

### Error: "RLS policy violation" or "permission denied"
**Fix:** You haven't applied the database migrations. Follow Step 4 above to run all 28 migrations in order.

### Error: Property search returns "Database not configured"
**Fix:** The Supabase client is null because env vars are missing. Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in `.env.local`.

### Error: `bun: command not found`
**Fix:** Install Bun (see Prerequisites above). If you prefer npm, replace `bun install` with `npm install` and `bun run dev` with `npm run dev`.

---

## What's Next?

Once local development is working:

1. **Configure payment providers** — See `docs/ENVIRONMENT_VARIABLES.md` for Paystack/Flutterwave setup.
2. **Configure email** — See `docs/ENVIRONMENT_VARIABLES.md` for email provider setup.
3. **Deploy to production** — See `docs/DEPLOYMENT_GUIDE.md`.
4. **Read the architecture** — See `docs/ARCHITECTURE.md` for how the application is structured.
5. **Review security** — See `docs/SECURITY.md` for the security model.

---

## Need Help?

- **Architecture questions:** `docs/ARCHITECTURE.md`
- **Database questions:** `docs/DATABASE.md` + `docs/DATABASE_SETUP.md`
- **Security questions:** `docs/SECURITY.md` + `docs/THREAT_MODEL.md`
- **Deployment questions:** `docs/DEPLOYMENT_GUIDE.md`
- **Troubleshooting:** `docs/TROUBLESHOOTING.md`
