# Environment Variables

This document lists every environment variable used by the Shelty marketplace, whether it's required, and how to get the value.

## Variable Reference

### Application

| Variable | Required | Server-only? | Description |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | No | The public URL of your application. For local dev: `http://localhost:3000`. For production: `https://your-domain.com`. |
| `LOG_LEVEL` | No | No | Logging verbosity. Options: `debug`, `info`, `warn`, `error`. Default: `info` in production, `debug` in dev. |

### Supabase

| Variable | Required | Server-only? | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | No | Your Supabase project URL. Find at: Supabase dashboard → Settings → API → Project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | No | Your Supabase anon (public) key. Find at: dashboard → Settings → API → Project API keys → anon public. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Yes** | Your Supabase service role key. Find at: dashboard → Settings → API → Project API keys → service_role. **NEVER expose to the browser.** |

### Paystack

| Variable | Required | Server-only? | Description |
|---|---|---|---|
| `PAYSTACK_PUBLIC_KEY` | For payments | No | Your Paystack public key. Find at: Paystack dashboard → Settings → API Keys & Webhooks → Public Key. |
| `PAYSTACK_SECRET_KEY` | For payments | **Yes** | Your Paystack secret key. Find at: same location. **NEVER expose to the browser.** |
| `PAYSTACK_WEBHOOK_HASH` | For webhooks | **Yes** | Your Paystack webhook secret hash. Find at: same location → Webhook Secret. **Critical for webhook signature verification.** |

### Flutterwave

| Variable | Required | Server-only? | Description |
|---|---|---|---|
| `FLUTTERWAVE_PUBLIC_KEY` | For payments | No | Your Flutterwave public key. Find at: Flutterwave dashboard → Settings → API Keys. |
| `FLUTTERWAVE_SECRET_KEY` | For payments | **Yes** | Your Flutterwave secret key. Find at: same location. **NEVER expose to the browser.** |
| `FLUTTERWAVE_WEBHOOK_HASH` | For webhooks | **Yes** | Your Flutterwave webhook secret hash. Find at: Settings → Webhooks. **Critical for webhook verification.** |
| `FLUTTERWAVE_ENCRYPTION_KEY` | For payments | **Yes** | Your Flutterwave encryption key. Find at: API Keys. |

### Email

| Variable | Required | Server-only? | Description |
|---|---|---|---|
| `EMAIL_PROVIDER_API_KEY` | For email | **Yes** | Your email provider API key (Resend recommended). Get from: [resend.com/api-keys](https://resend.com/api-keys). |
| `EMAIL_FROM_ADDRESS` | For email | No | The "from" email address. Must be a verified sender in your email provider. Example: `no-reply@your-domain.com`. |
| `EMAIL_FROM_NAME` | For email | No | Display name for the "from" address. Default: `Shelty`. |

### Maps

| Variable | Required | Server-only? | Description |
|---|---|---|---|
| `MAPS_PROVIDER_KEY` | No | **Yes** | Optional. Maps API key. If not set, the app uses free OpenStreetMap tiles. Set for Google Maps integration. |

### Admin

| Variable | Required | Server-only? | Description |
|---|---|---|---|
| `ADMIN_EMAILS` | For first admin | **Yes** | Comma-separated list of email addresses that should have admin access on first run. Example: `admin@your-domain.com`. After the first admin signs in, this can be removed. |

### Security

| Variable | Required | Server-only? | Description |
|---|---|---|---|
| `AUTH_SECRET` | Recommended | **Yes** | A random string used for signing tokens. Generate with: `openssl rand -base64 32`. |
| `CRON_SECRET` | For cron jobs | **Yes** | A shared secret for `/api/cron/*` endpoints. Generate with: `openssl rand -hex 32`. |

### Local Development

| Variable | Required | Server-only? | Description |
|---|---|---|---|
| `DATABASE_URL` | Local dev only | **Yes** | Prisma + SQLite local dev fallback. Default: `file:./db/custom.db`. Not needed when Supabase is configured. |

---

## Integration Status

| Integration | Status | What's needed |
|---|---|---|
| **Supabase** | Implemented, ready to configure | Create a Supabase project + set 3 env vars |
| **Paystack** | Implemented, ready to configure | Create Paystack account + set 3 env vars + configure webhook URL |
| **Flutterwave** | Implemented, ready to configure | Create Flutterwave account + set 4 env vars + configure webhook URL |
| **Email (Resend)** | Implemented, ready to configure | Create Resend account + verify sending domain + set 3 env vars |
| **Maps (OSM)** | Implemented, works out of the box | No configuration needed — uses free OpenStreetMap |
| **Maps (Google)** | Architecture supports it, not configured | Set `MAPS_PROVIDER_KEY` to enable Google Maps instead of OSM |
| **SMS/Push** | Not implemented (V1) | N/A — V1 covers in-app + email only |

---

## Important Security Rules

1. **`NEXT_PUBLIC_*` variables are visible in the browser.** Only use this prefix for genuinely public values (Supabase URL, anon key, app URL). NEVER use it for secret keys.

2. **Server-only variables** (`SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, etc.) must NEVER be prefixed with `NEXT_PUBLIC_`. They are only accessible in Server Components, Server Actions, and Route Handlers.

3. **Never commit `.env.local`** to git. The `.gitignore` file already excludes it (`.env*` pattern).

4. **The `.env.example` file** contains only variable names and placeholders — never real secrets.

5. **In production (Vercel)**, set environment variables in the Vercel dashboard → Settings → Environment Variables. Mark server-only variables as "not exposed to the browser."
