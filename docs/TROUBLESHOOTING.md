# Troubleshooting

Common issues and their fixes.

## Application won't start

### `bun: command not found`
**Install Bun:** See `docs/SETUP_GUIDE.md` → Prerequisites. Or use `npm` instead:
```bash
npm install
npm run dev
```

### `Error: NEXT_PUBLIC_SUPABASE_URL is not defined`
**Fix:** You haven't created `.env.local`. Run:
```bash
cp .env.example .env.local
```
Then edit `.env.local` and fill in your Supabase credentials.

### `Error: Database not configured`
This means the Supabase client returned null because env vars are missing or have placeholder values.
**Fix:** Open `.env.local` and replace `your_supabase_project_url` with the real URL from your Supabase dashboard → Settings → API.

### `Error: ECONNREFUSED` or `fetch failed`
This usually means Supabase is not reachable. Check:
1. Is your Supabase project running? (Check the dashboard.)
2. Is the URL correct? (Should start with `https://`.)
3. Are you on a network that blocks external HTTPS?

---

## Authentication issues

### `Error: Email not confirmed`
**Fix:** Email confirmation is enabled. Check your email for a verification link. If you didn't receive it:
1. Go to Supabase dashboard → Authentication → Users.
2. Find your user.
3. Click **Confirm** to manually verify.

### Signup works but login redirects to /onboarding
This is correct behavior — you haven't completed onboarding yet. Fill in the onboarding form, then you'll be redirected to `/dashboard`.

### `Error: FORBIDDEN` on /admin
You need admin access. Either:
1. Set `ADMIN_EMAILS` in `.env.local` with your email (comma-separated).
2. Sign up with that email + complete onboarding.
3. Visit `/admin` — you should now have access.
4. After confirming, you can remove `ADMIN_EMAILS` (admin is now in the `admin_users` table).

### `Error: BANNED` or `SUSPENDED` on /dashboard
Your account was suspended or banned by an admin. Contact the admin to reactivate.

---

## Database issues

### `Error: relation "profiles" does not exist`
You haven't applied the database migrations. See `docs/DATABASE_SETUP.md` → Apply Migrations.

### `Error: RLS policy violation`
Row-Level Security is blocking your query because:
1. Migrations haven't been applied (run all 28).
2. You're trying to access another user's data (which RLS correctly blocks).
3. You're not authenticated.

### `Error: permission denied for table`
Same as RLS violation — check that:
1. You're logged in.
2. Migrations have been applied.
3. You're only accessing your own data.

### Property search returns "No properties found"
This is correct if your database is empty. The application shows a proper empty state. To add properties:
1. Sign up as a landlord.
2. Complete onboarding.
3. Go to Dashboard → Properties → Create property.
4. Fill in the form and publish.

---

## Payment issues

### `Error: PAYSTACK_WEBHOOK_HASH not configured`
The webhook hash env var is not set. Without it, webhook verification is skipped (dev only). **In production, this is a security violation.** Set `PAYSTACK_WEBHOOK_HASH` in your environment.

### Payment webhook returns `400 Invalid signature`
The webhook signature doesn't match your `PAYSTACK_WEBHOOK_HASH`. Check:
1. The hash in your env vars matches the one in your Paystack dashboard.
2. The webhook URL in Paystack is `https://your-domain.com/api/webhooks/paystack`.

### Payment succeeds but subscription doesn't activate
The webhook may not have been received. Check:
1. The webhook URL is correct in Paystack/Flutterwave.
2. The webhook hash is set.
3. Go to Supabase → Table Editor → `payment_events` to see if the event was recorded.
4. Go to `payments` table to check if the payment status was updated.

---

## Build issues

### `Error: Type error` during `bun run build`
TypeScript found a type error. Run:
```bash
npx tsc --noEmit
```
to see the full error list. Most errors are pre-existing and non-blocking (from Supabase typing workarounds).

### `Error: Module not found`
A dependency is missing. Run:
```bash
bun install
```

### `Error: Port 3000 is already in use`
Another process is using port 3000. Either:
1. Kill the other process.
2. Or start on a different port: `bun run dev -- -p 3001`

---

## Realtime issues

### Notifications don't update in real-time
The Realtime subscription may not be working. Check:
1. Your Supabase project has Realtime enabled (Database → Replication).
2. The `notifications` table is in the `supabase_realtime` publication (migration 0023 handles this).
3. Your network allows WebSocket connections (some corporate firewalls block them).
4. The app has a 60-second polling fallback, so notifications will still appear — just not instantly.

### Messaging doesn't update in real-time
Same as above — check Realtime configuration. The messaging system also has polling fallbacks.

---

## Storage issues

### `Error: Bucket not found`
You haven't created the storage bucket. See `docs/DATABASE_SETUP.md` → Configure Storage Buckets.

### `Error: File upload failed`
Check:
1. The bucket exists.
2. The RLS policy allows the authenticated user to write.
3. The file size is within limits.
4. The MIME type is in the allowed list.

### Verification documents are publicly accessible
They should NOT be. Check that:
1. The `verification-documents` bucket is set to **Private** (not public).
2. The storage RLS policies from migration 0018 are applied.

---

## Getting More Help

1. **Architecture:** `docs/ARCHITECTURE.md`
2. **Security:** `docs/SECURITY.md`
3. **Database:** `docs/DATABASE.md` + `docs/DATABASE_SETUP.md`
4. **All docs:** Check the `docs/` directory for 28+ documentation files.
5. **Tests:** `tests/unit/` contains 33 test files with 1031+ tests that document expected behavior.
