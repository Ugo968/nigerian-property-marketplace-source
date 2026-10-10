# INCIDENT RESPONSE

Basic incident response runbook for the Shelty marketplace.

## Severity classification

| Severity | Examples | Response time |
|---|---|---|
| Critical | Live secret leak, payment bypass, mass data leak | < 1 hour |
| High | Single-user IDOR, RLS gap, webhook spoofing | < 4 hours |
| Medium | Rate-limit bypass, input validation gap | < 24 hours |
| Low | UI bug, non-security regression | Next release |

## Critical incident playbook

### 1. Live secret leak (e.g. SUPABASE_SERVICE_ROLE_KEY committed)

1. **Rotate immediately** — Supabase dashboard → Settings → API →
   regenerate service role key. Update env vars on Vercel.
2. **Audit access** — check `audit_logs` for suspicious admin_action_records
   in the window since the leak.
3. **Force password reset** for any admin accounts whose emails
   appear in the leaked material.
4. **Notify users** if their PII was exposed (per local data
   protection regulations).

### 2. Payment bypass (user reports they got Pro without paying)

1. **Identify the payment row** — `SELECT * FROM payments WHERE
   user_id = X ORDER BY initiated_at DESC LIMIT 5`.
2. **Verify with the provider** — call Paystack/Flutterwave
   server-side to confirm the payment status.
3. **If the payment is genuinely unsuccessful but subscription was
   activated** — manually set `subscription_tier = 'free'` via the
   admin client (server-side only) and notify the user.
4. **Audit the activation path** — check `payment_events` for
   duplicate or replayed webhooks.
5. **Patch the vulnerability** — likely a missing signature check
   or a missing amount verification in `verifyAndActivate`.

### 3. Mass data leak (e.g. RLS misconfiguration exposes all transactions)

1. **Identify the scope** — which table, which rows, which users.
2. **Fix the RLS policy** — push a hotfix migration immediately.
3. **Audit access** — check `audit_logs` for SELECT-heavy activity
   from the affected users.
4. **Notify affected users** — be honest about what was exposed.
5. **Review the migration review process** — how did the misconfigured
   policy get past review?

### 4. Webhook spoofing (attacker sends fake Paystack webhook)

1. **Verify the webhook hash** — check `PAYSTACK_WEBHOOK_HASH` is set
   in production env vars.
2. **Audit recent webhook events** — `SELECT * FROM payment_events
   WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at DESC`.
3. **Reverse any fraudulent activations** — set the affected
   subscriptions back to 'free' via the admin client.
4. **Rotate the webhook hash** — Paystack dashboard → Settings →
   Webhooks → regenerate.
5. **Notify Paystack** if the hash was leaked via their side.

### 5. Account takeover (user reports their account was hijacked)

1. **Identify the vector** — was it password reuse, phishing, or
   session hijack?
2. **Reset the user's password** via Supabase Auth admin.
3. **Revoke all sessions** — Supabase dashboard → Auth → Users →
   sign out all sessions.
4. **Audit recent activity** — `audit_logs` + `admin_action_records`
   for the user.
5. **Notify the user** with the recovery steps.

## Communication

- Internal: Slack/Teams channel `#security-incidents`
- External (users): email from `support@naijahaus.example`
- External (regulators): per local data protection regulations

## Post-incident

- blameless post-mortem within 5 business days
- document timeline, root cause, remediation, follow-up actions
- add regression tests to `tests/unit/security.test.ts`
