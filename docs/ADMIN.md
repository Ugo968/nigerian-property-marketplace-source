# ADMIN

This document records the Admin Dashboard & Moderation system
implemented in Prompt 17.

## Architecture overview

The admin system is completely separate from the marketplace role
model. Marketplace roles (landlord / agent / company) NEVER gain
admin access by modifying cookies, JWTs, or URLs.

Admin authorization lives in its own table (`admin_users` from
migration 0001) and is enforced server-side via the `requireAdmin` /
`requireAdminPermission` helpers in `src/lib/admin/permissions.ts`.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Marketplace roles (separate from admin)                           │
│  ┌─────────────┬──────────┬──────────┐                              │
│  │  landlord    │  agent   │  company │                              │
│  └─────────────┴──────────┴──────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
                  ↓ NEVER gains admin access
┌─────────────────────────────────────────────────────────────────────┐
│  Admin authorization (server-side only)                            │
│  ┌──────────────────┬──────────────────┐                           │
│  │  admin           │  super_admin     │                           │
│  └──────────────────┴──────────────────┘                           │
│  + permission[] per admin_user row                                  │
│  + ADMIN_EMAILS env (first-run seeding)                             │
└─────────────────────────────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Admin routes (/admin/*)                                           │
│  Each Server Component calls requireAdmin() / requireAdminPermission│
│  Middleware only checks auth session; admin role check happens in  │
│  the Server Component.                                              │
└─────────────────────────────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Server actions (src/lib/admin/actions.ts)                         │
│  - Every action calls requireAdminPermission                       │
│  - Mutations use the service-role admin client (RLS bypass)        │
│  - Audit logged via recordAdminAction()                            │
│  - Notifications dispatched via notificationService                │
└─────────────────────────────────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Audit (append-only)                                                │
│  - audit_logs (global, from Prompt 1)                               │
│  - admin_action_records (structured moderation history)            │
│  Both tables: RLS enabled, NO client policy = server-only access.  │
│  No UPDATE / DELETE policies exist in the application.              │
└─────────────────────────────────────────────────────────────────────┘
```

## Admin permission model (spec Section 2)

Admins have one of two tiers in `admin_users.role`:
- `admin` — has only the permissions listed in `admin_users.permissions[]`
- `super_admin` — has ALL permissions

Permissions are checked via `requireAdminPermission("permission.slug")`
at the top of every privileged server action. Super admins bypass
the permission list and implicitly have all permissions.

The 18 permissions cover all admin functionality:

| Permission            | Purpose                                            |
|-----------------------|----------------------------------------------------|
| `users.view`          | List/search user accounts                          |
| `users.manage`        | View user detail (broader than view)               |
| `users.suspend`       | Suspend / reactivate users                         |
| `users.ban`           | Ban users (high-impact)                            |
| `properties.view`     | List properties                                     |
| `properties.moderate` | Suspend / restore listings                         |
| `properties.remove`    | Hard-remove listings (high-impact)                |
| `verification.review` | Approve / reject / revoke verification              |
| `applications.view`  | List agent applications                            |
| `reviews.moderate`   | Hide / remove / restore reviews                    |
| `payments.view`       | View payment ledger (read-only)                    |
| `subscriptions.manage`| View subscription history                          |
| `promotions.manage`  | Approve / reject featured promotions               |
| `advertising.manage` | Approve / reject / pause campaigns + suspend advertisers |
| `reports.manage`     | Triage / resolve / dismiss / escalate reports      |
| `notifications.manage`| Operational visibility into notification/email delivery |
| `audit.view`         | View the append-only audit log                     |
| `settings.manage`    | Update platform settings                           |

## Admin routes (spec Section 4)

All 14 admin sections are implemented:

| Route                        | Purpose                                            |
|------------------------------|----------------------------------------------------|
| `/admin`                     | Overview — platform metrics dashboard              |
| `/admin/users`               | User search + filters                              |
| `/admin/users/[id]`          | User detail + suspend/reactivate/ban              |
| `/admin/properties`           | Property search + filters                          |
| `/admin/properties/[id]`     | Property detail + suspend/remove/restore         |
| `/admin/verifications`        | Verification applications queue                   |
| `/admin/verifications/[id]`   | Verification review (uses Prompt 5's actions)    |
| `/admin/applications`         | Agent applications (read-only)                   |
| `/admin/reviews`              | Review search + filters                           |
| `/admin/reviews/[id]`         | Review detail + hide/remove/restore              |
| `/admin/reports`              | Moderation queue (severity/age/category)        |
| `/admin/reports/[id]`         | Report detail + status workflow                  |
| `/admin/payments`             | Read-only payment ledger                         |
| `/admin/subscriptions`        | Subscription list                                |
| `/admin/promotions`           | Featured promotion moderation                    |
| `/admin/advertising`          | Campaign moderation                              |
| `/admin/advertising/[id]`     | Campaign detail + approve/reject/pause/suspend  |
| `/admin/notifications`        | Notification + email delivery visibility         |
| `/admin/audit`                | Append-only audit log                            |
| `/admin/settings`             | Platform settings + report categories            |

Every Server Component calls `requireAdmin()` or
`requireAdminPermission("permission")` at the top. Non-admins are
redirected to `/forbidden`.

## Moderation workflows

### User suspend / reactivate / ban (spec Section 9, 10)

- `suspendUserAction({ profileId, reason })` → sets account_status="suspended"
- `reactivateUserAction({ profileId, reason })` → sets account_status="active"
- `banUserAction({ profileId, reason })` → sets account_status="banned"
  (requires 10-char minimum reason)

All three:
1. `requireAdminPermission("users.suspend" | "users.ban")`
2. Validate reason length (3-char minimum; 10-char for ban)
3. Update `profiles.account_status` + `suspended_at` + `suspended_reason`
4. Record via `recordAdminAction()` → audit_logs + admin_action_records
5. Dispatch `account.suspended` / `account.reactivated` notification

### Property suspend / remove / restore (spec Section 14)

- `suspendPropertyAction({ propertyId, reason })` → sets status="suspended"
- `removePropertyAction({ propertyId, reason })` → sets status="removed" + deleted_at
- `restorePropertyAction({ propertyId, reason })` → restores status to
  "available" (if was published) or "draft"

All three record audit + dispatch notification to the listing creator.

### Review hide / remove / restore (spec Section 18)

- `hideReviewAction({ reviewId, reason })` → sets status="hidden"
- `removeReviewAction({ reviewId, reason })` → sets status="removed"
  (preserves original body in `admin_action_records.metadata.originalBody`)
- `restoreReviewAction({ reviewId, reason })` → sets status="published"

Admins CANNOT alter ratings or rewrite the review body. The UI
explicitly states "moderation only — cannot alter the star rating
or rewrite the body".

### Report workflow (spec Section 20, 21)

- `setReportStatusAction({ reportId, status, resolutionNotes })`
- Statuses: open → in_review → resolved | dismissed | escalated

The reports table is queried via the admin client (RLS bypass is
intentional — admin authorization was verified). Reporters can
read their own reports via RLS. The reporter's identity is NOT
exposed to the reported user.

### Featured promotion moderation (spec Section 27)

- `approvePromotionAction({ promotionId, reason? })` → status="active"
- `rejectPromotionAction({ promotionId, reason })` → status="cancelled"

Notifications dispatched to the purchaser. Per spec Section 27 —
paid promotion does NOT override hard search filters; it only
boosts ranking.

### Advertising campaign moderation (spec Section 28, 29)

- `approveCampaignAction({ campaignId, reason? })` → status="active"
- `rejectCampaignAction({ campaignId, reason })` → status="rejected"
- `pauseCampaignAction({ campaignId, reason })` → status="paused"
- `suspendAdvertiserAction({ businessId, reason })` → pauses all
  active campaigns for the business

Per spec Section 28 — paid advertising does NOT automatically mean
approved.

## Verification moderation (spec Section 15–17)

The verification review UI delegates to the existing actions in
`src/lib/verification/admin-actions.ts` from Prompt 5:
- `approveVerificationApplication`
- `rejectVerificationApplication`
- `requestVerificationChanges`
- `revokeVerification`
- `suspendVerification`

Bronze and Blue remain distinct tiers. Payment does NOT grant
verification. Subscription eligibility does NOT equal approval.
Blue requires appropriate professional/business verification; CAC
documentation remains relevant for companies.

## Database entities added (migration 0024)

| Table                       | Purpose                                          |
|-----------------------------|--------------------------------------------------|
| `admin_action_records`      | Structured moderation history (append-only)     |
| `report_categories`         | Configurable report categories (spec Section 22)|
| `platform_settings`         | Key/value store for admin-configurable values    |

The reports table was extended with `resolved_by` and `resolved_at`
columns, and the status CHECK constraint was expanded to include
`'escalated'`.

### Seeded report categories

11 categories from spec Section 22:
fraud_scam, misleading_listing, fake_property, impersonation,
harassment, spam, inappropriate_content, suspicious_payment_request,
fake_review, misleading_advertisement, other.

### Seeded platform settings

- `advertising.min_campaign_budget_naira` = 5000
- `advertising.max_campaigns_per_business` = 5
- `advertising.max_businesses_per_user` = 3
- `featured.credit_purchase_price_naira` = 1000
- `featured.max_active_promotions_per_user` = 3
- `notifications.admin_can_broadcast` = false
- `reports.auto_escalate_after_hours` = 72

## RLS strategy

| Table                       | RLS  | Client policy                                   |
|-----------------------------|------|--------------------------------------------------|
| `admin_action_records`      | on   | NO policy — server-only access                  |
| `report_categories`         | on   | Public SELECT; server-only writes              |
| `platform_settings`         | on   | Public SELECT; server-only writes              |
| `audit_logs`                | on   | Append-only INSERT (from Prompt 1)             |
| `notifications`             | on   | Owner-only (Prompt 16)                         |

The admin client (service-role) bypasses RLS. It is used ONLY in
admin actions that have already called `requireAdminPermission()`.
The service-role key is NEVER exposed to the browser.

## Audit logging

Every admin mutation goes through `recordAdminAction()` which writes
to TWO tables:

1. `audit_logs` — the global append-only audit trail (used by Prompts 1–16)
2. `admin_action_records` — structured moderation history with
   `target_type`, `target_id`, `reason`, `previous_state`, `new_state`

Both tables are append-only — no UPDATE/DELETE policies exist
in the application. RLS prevents client access entirely. Admins
view the records via the read-only `/admin/audit` page.

## Confirmation dialogs (spec Section 32)

`ConfirmDialog` (src/components/admin/confirm-dialog.tsx) enforces:
- Action-specific button labels ("Suspend User", not "Continue")
- Reason textarea for high-impact actions (ban, remove, revoke)
- Loading state during the action
- Destructive styling for ban / remove / revoke buttons

## Payments administration (spec Section 24, 25)

`/admin/payments` is read-only. The admin fetcher returns only the
existing PaymentRow columns — it never queries card numbers, CVVs,
or provider secret keys (which are never stored). Payment truth
remains tied to verified provider state — admins cannot mark
payments successful by editing rows.

## Notifications administration (spec Section 30)

`/admin/notifications` provides operational visibility into:
- In-app notification records (filtered by type / channel / recipient)
- Email delivery records (status / template / failure category)

Admins do NOT have the ability to send arbitrary notifications on
behalf of users. No mass-marketing email system is implemented
(per spec Section 44).

## Privacy model (spec Section 43)

Least-privilege is enforced:
- Admins without `payments.view` cannot view payment records
- Moderation history is visible to admins with the relevant
  permission (e.g. `users.view` for the user detail page)
- Sensitive information (passwords, password hashes, auth tokens,
  payment card data, provider secrets) is NEVER displayed

The reporter's identity is NOT exposed to the reported user.
Admins can see the reporter via the report detail page (with
`reports.manage` permission).

## Admin/marketplace role separation (spec Section 1)

- `profiles.role` CHECK constraint allows ONLY
  `landlord` / `agent` / `company` — admin is NOT in this list
- `admin_users.role` CHECK constraint allows ONLY
  `admin` / `super_admin`
- The `requireAdmin()` helper reads from `admin_users`, never from
  `profiles.role`
- Middleware checks only the auth session — admin role checks
  happen in Server Components via `requireAdmin()`

A normal landlord/agent/company user can NEVER gain admin access by:
- Modifying browser state, cookies, local storage, request bodies,
  role values, URLs, JWT/client state

All such attempts are rejected server-side.

## Known limitations (V1)

- Direct DB mutation via SQL console is intentionally NOT built
  (spec Section 41 — "No arbitrary SQL tools")
- Unrestricted data export is intentionally NOT built (spec Section 44)
- Multi-tenant enterprise admin is intentionally NOT built (spec Section 48)
- Fraud detection AI is intentionally NOT built (spec Section 48) —
  the dashboard surfaces signals for human moderation but does not
  auto-ban based on heuristic scores
- SMS / push notifications are intentionally NOT built (spec Section 48)
- Property escrow / rent collection / purchase-money handling are
  intentionally NOT built (spec Section 48)
