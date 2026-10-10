# Deployment Guide

This guide walks you through deploying the Shelty marketplace to production using Vercel + Supabase.

## Architecture

```
Your Domain (HTTPS)
    ↓
Vercel (Next.js production build)
    ↓
Supabase (PostgreSQL + Auth + Storage + Realtime)
    ↓
Paystack / Flutterwave (payment webhooks)
    ↓
Resend (transactional email)
```

---

## Step 1: Prepare Supabase for Production

1. **Create a production Supabase project** (or use your existing one).
2. **Apply all 28 migrations** — see `docs/DATABASE_SETUP.md`.
3. **Run all 5 seed files** — property types, amenities, subscription plans, advertiser categories, advertising placements.
4. **Configure authentication:**
   - Enable Email provider.
   - Turn ON email confirmation.
   - Set **Site URL** to `https://your-domain.com`.
   - Add `https://your-domain.com/**` to **Redirect URLs**.
5. **Configure storage buckets** — see `docs/DATABASE_SETUP.md`.
6. **Enable Realtime** — the `notifications` table is added to the realtime publication by migration 0023.

## Step 2: Push Code to GitHub

```bash
# In your project directory:
git init
git add .
git commit -m "Shelty v1.0.0 — production-ready"
git branch -M main
git remote add origin https://github.com/your-username/naijahaus.git
git push -u origin main
```

## Step 3: Create a Vercel Project

1. Go to [vercel.com](https://vercel.com) → Sign in with GitHub.
2. Click **Add New** → **Project**.
3. Import your `naijahaus` repository.
4. Vercel auto-detects Next.js — keep the default settings:
   - Framework Preset: Next.js
   - Build Command: `next build`
   - Output Directory: `.next`
   - Install Command: `bun install` (or `npm install`)
5. **Do NOT click Deploy yet** — first configure environment variables.

## Step 4: Configure Environment Variables in Vercel

Go to Vercel → your project → **Settings** → **Environment Variables**.

Add ALL variables from your `.env.local`. For each variable:

- **Key:** the variable name (e.g., `SUPABASE_SERVICE_ROLE_KEY`)
- **Value:** the real production value
- **Environments:** check "Production" (and "Preview" if you want staging)

**Critical:** Server-only variables (`SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, etc.) should NOT have the `NEXT_PUBLIC_` prefix. Vercel automatically keeps non-`NEXT_PUBLIC_` variables server-side.

See `docs/ENVIRONMENT_VARIABLES.md` for the full list.

## Step 5: Set the Production URL

1. In Vercel → Settings → Domains.
2. Add your custom domain (e.g., `naijahaus.com`).
3. Follow Vercel's DNS instructions to point your domain to Vercel.
4. Vercel automatically provisions HTTPS (Let's Encrypt).

## Step 6: Update Supabase Auth URLs

In your Supabase dashboard → Authentication → URL Configuration:
- **Site URL:** `https://your-domain.com`
- **Redirect URLs:** `https://your-domain.com/**`

## Step 7: Configure Paystack Webhooks

1. Go to your Paystack dashboard → Settings → API Keys & Webhooks.
2. Set the **Webhook URL** to: `https://your-domain.com/api/webhooks/paystack`
3. Copy the **Webhook Secret Hash**.
4. Set `PAYSTACK_WEBHOOK_HASH` in Vercel env vars to this hash.

> **Important:** Do NOT enable live payments until you've tested the webhook signature verification. The application rejects webhooks without a valid signature.

## Step 8: Configure Flutterwave Webhooks

1. Go to your Flutterwave dashboard → Settings → Webhooks.
2. Set the **Webhook URL** to: `https://your-domain.com/api/webhooks/flutterwave`
3. Copy the **Secret Hash** (also called "webhook secret").
4. Set `FLUTTERWAVE_WEBHOOK_HASH` in Vercel env vars.

## Step 9: Configure Email (Resend)

1. Go to [resend.com](https://resend.com) → Sign up.
2. Verify your sending domain (e.g., `your-domain.com`).
3. Create an API key.
4. Set in Vercel:
   - `EMAIL_PROVIDER_API_KEY` = your Resend API key
   - `EMAIL_FROM_ADDRESS` = `no-reply@your-domain.com`
   - `EMAIL_FROM_NAME` = `Shelty`

## Step 10: Deploy

In Vercel:
1. Go to your project → **Deployments**.
2. Click **Redeploy** (or push a new commit to trigger auto-deploy).
3. Wait for the build to complete (~2 minutes).
4. Click **Visit** to open your production site.

## Step 11: Test the Deployment

Follow the production smoke test in `docs/LAUNCH_CHECKLIST.md` → **Production Smoke Test** section.

Key checks:
- [ ] Homepage loads
- [ ] Signup works + email verification arrives
- [ ] Login works
- [ ] Property search returns results from the real database
- [ ] Dashboard loads for each role
- [ ] No secrets in browser DevTools
- [ ] No console errors
- [ ] Payment webhook endpoint returns 200 on a test event

## Step 12: Seed Your First Admin

1. Sign up with your admin email (the one in `ADMIN_EMAILS`).
2. Complete onboarding.
3. The `requireAdmin()` function grants super_admin access to emails in `ADMIN_EMAILS`.
4. Visit `/admin` — you should see the admin dashboard.
5. After confirming admin access, you can remove `ADMIN_EMAILS` from Vercel env vars (admin is now seeded in the `admin_users` table).

---

## Rolling Back a Bad Deployment

In Vercel:
1. Go to **Deployments**.
2. Find the last known-good deployment.
3. Click the **⋯** menu → **Promote to Production**.
4. Confirm.

This instantly rolls back to the previous deployment.

---

## Checking Logs

In Vercel:
1. Go to your project → **Logs**.
2. Filter by level (info / warn / error).
3. Search by correlation ID or user ID.

Logs are structured JSON (redacted of secrets). Ingest into Datadog/Sentry for alerting.

---

## Optional: Staging Environment

1. In Vercel, enable **Preview Deployments** (on by default).
2. Every pull request gets a preview URL (e.g., `naijahaus-pr-42.vercel.app`).
3. Use a separate Supabase project for staging (with its own env vars configured for the "Preview" environment in Vercel).
4. **Never use production credentials in the staging environment.**
