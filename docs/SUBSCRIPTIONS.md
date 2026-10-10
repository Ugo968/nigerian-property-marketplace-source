# SUBSCRIPTIONS

This document records the subscription, plans & entitlements system.

## Architecture overview

```mermaid
flowchart TD
    A[User signs up] --> B[Free plan assigned automatically]
    B --> C[profiles.subscription_tier = 'free']
    C --> D[capabilitiesFor(role, 'free') → Capabilities]
    D --> E[All services check capabilities server-side]

    F[User visits /pricing] --> G[Sees all plans for their role]
    G --> H[Clicks 'Upgrade to Pro']
    H --> I[changePlanAction server action]
    I --> J{P13: Payment verified?}
    J -->|No payment yet| K[Direct tier change (dev/preview mode)]
    J -->|Yes| L[Update subscription_tier]
    K --> L
    L --> M[Audit: subscription.upgraded]
    M --> N[Capabilities now reflect new tier]
    N --> O[Existing content preserved (graceful)]
```

## Central plan configuration (spec Section 5)

**Single source of truth**: `src/lib/subscriptions/plans.ts`

All 9 plans (3 roles × 3 tiers) with exact spec prices:

| Role | Free | Pro | Premium |
|---|---|---|---|
| Landlord | ₦0 | ₦3,500 | ₦9,500 |
| Agent | ₦0 | ₦5,000 | ₦12,000 |
| Company | ₦0 | ₦20,000 | ₦35,000+ |

Company Premium uses `isVariablePricePlan()` — the `₦35,000+` is the base; add-ons can push the actual amount higher.

The DB mirrors these in `subscription_plans` (migration 0009) + seed data (`supabase/seed/003_subscription_plans.sql`).

## Capability system (spec Section 6)

`src/lib/capabilities/index.ts` — `capabilitiesFor(role, tier)` returns a `Capabilities` object with 20+ fields:

| Capability | Type | Example |
|---|---|---|
| `maxListingsPerMonth` | number \| null | 10 (company free), null (unlimited) |
| `maxPhotosPerListing` | number | 5 (landlord free), 25 (pro) |
| `maxVideosPerListing` | number | 0 (free), 2 (pro) |
| `maxApplicationsPerMonth` | number \| null | 10 (agent free), null (premium) |
| `maxNewConversationsPerMonth` | number \| null | 10 (agent free), null (premium) |
| `maxSavedProperties` | number \| null | 10, 25, null |
| `maxSavedSearches` | number \| null | 3, 15, null |
| `maxTeamMembers` | number \| null | 0 (landlord), 1/5/null (company) |
| `eligibleForBronze` | boolean | true on Pro+ |
| `eligibleForBlue` | boolean | true on Premium |
| `canShowSocialMediaHandles` | boolean | true on Premium only |
| `featuredListingCreditsPerMonth` | number | 0, 1-2, 3-5 |
| `analyticsTier` | enum | basic, advanced, full, realtime |

**No code does `if plan === "premium"`** — it asks `capabilitiesFor(role, tier).canBulkManage` instead.

## Entitlement resolver (spec Section 29)

`src/lib/subscriptions/entitlements.ts`:

| Function | Purpose |
|---|---|
| `getEffectivePlan()` | Returns the caller's current (role, tier, price) from `profiles.subscription_tier` |
| `getEntitlements()` | Returns the full `Capabilities` object for the caller's plan |
| `getUsage()` | Returns current usage for all metered capabilities (calculated from real DB data) |
| `canConsume(metric, quantity)` | Checks if the caller can consume a metered capability |
| `hasCapability(capability)` | Boolean check for a specific capability |
| `getLimit(capability)` | Returns the limit for a metered capability |

### Usage tracking (spec Section 13)

Usage is calculated from **real server-side data**, not client counters:
- **Monthly listings**: `COUNT(*) FROM properties WHERE listing_creator_id = ? AND created_at >= month_start AND status != 'removed'`
- **Monthly applications**: `COUNT(*) FROM property_applications WHERE agent_id = ? AND created_at >= month_start`
- **Monthly new conversations**: `COUNT(*) FROM conversation_participants WHERE user_id = ? AND joined_at >= month_start`
- **Saved properties**: `COUNT(*) FROM saved_properties WHERE user_id = ?`
- **Saved searches**: `COUNT(*) FROM saved_searches WHERE user_id = ?`

### Monthly reset (spec Section 14)

Monthly limits reset on the **1st of each calendar month** (`monthStart.setDate(1)`). For paid users, this aligns with the subscription billing period. Documented behavior — not based on client-side timestamps.

## Subscription lifecycle (spec Section 27)

`src/lib/subscriptions/actions.ts`:

| Action | Effect | Audit event |
|---|---|---|
| `changePlanAction({ newTier })` | Updates `profiles.subscription_tier` + inserts `user_subscriptions` row | `subscription.upgraded` or `subscription.downgraded` |
| `cancelPlanAction()` | Downgrades to Free + marks subscription as cancelled | `subscription.cancelled` |

### State transitions

```
Free → Pro → Premium (upgrade)
Premium → Pro → Free (downgrade)
Any → Free (cancel)
```

### Graceful downgrade (spec Section 28)

When a user downgrades:
- **Existing content is preserved** — properties, saved items, conversations, reviews are NOT deleted
- **New actions beyond Free limits are blocked** — the respective services check capabilities server-side
- **User sees a clear message** — "Limit reached. Upgrade for more."
- No data destruction to enforce plan limits

## Verification ≠ subscription (spec Section 22)

Upgrading a plan grants **eligibility** to apply for verification:
- Pro plans → `eligibleForBronze = true`
- Premium plans → `eligibleForBlue = true`

But `changePlanAction()` **NEVER** touches `profiles.verification_state`. The verification system (P5) is completely separate — admin review is required.

The Capabilities interface has NO `verificationState` field — verification is never part of the capability model.

## Free plan (spec Section 12)

Free is a first-class entitlement:
- Every new user gets Free automatically (profiles.subscription_tier defaults to 'free')
- Free has real capabilities and limits (5 photos, 10 applications, 10 saved properties, etc.)
- No payment required for Free
- Users don't choose a plan during signup

## RLS + security (spec Sections 10, 30, 32)

| Table | User access | Privileged access |
|---|---|---|
| `profiles.subscription_tier` | READ only (RLS UPDATE policy blocks changes) | Service role can change (via `changePlanAction`) |
| `subscription_plans` | READ (publicly readable) | — |
| `user_subscriptions` | READ own only (SELECT policy only) | Service role can INSERT/UPDATE |

**Users CANNOT**: assign themselves Premium, modify subscription status, change plan price, alter limits, grant credits, alter usage counters, or mark payment as successful.

All privileged operations use `createAdminClient()` (service-role) — never the browser client.

## No payment processing yet (spec Section 43)

`changePlanAction()` changes `subscription_tier` directly (dev/preview mode). Prompt 13 will:
1. Initiate payment via Paystack/Flutterwave
2. Wait for webhook confirmation
3. Only then update `subscription_tier`

The architecture is ready — the action already records `user_subscriptions` rows with provider reference placeholders (`provider`, `provider_customer_ref`, `provider_subscription_ref`).

## UI routes

| Route | Purpose |
|---|---|
| `/pricing` | Public pricing page — all plans for all 3 roles with exact prices + highlights |
| `/dashboard/subscription` | Current plan + usage bars + upgrade/cancel options |

### Pricing page (`/pricing`)
- Shows all 9 plans grouped by role (Landlord / Agent / Company)
- Each plan card: tier name, tagline, price (with /month suffix), top 5+ highlights, upgrade button
- "Most Popular" badge on Premium plans
- "Verification ≠ Subscription" info banner
- Mobile-responsive 3-column grid on desktop, stacked on mobile

### Dashboard (`/dashboard/subscription`)
- Current plan card (tier + price + tagline + cancel button)
- Usage bars (used / limit with remaining count + color-coded progress bar)
- Available plans (all 3 for the user's role with current plan highlighted)
- Upgrade buttons (calls `changePlanAction`)
- Cancel confirmation dialog (explains graceful downgrade)
- "Verification ≠ Subscription" reminder

## Audit events (spec Section 31)

- `subscription.upgraded` — user upgraded to a higher tier
- `subscription.downgraded` — user downgraded to a lower tier
- `subscription.cancelled` — user cancelled to Free

All audit events record metadata only (previous_tier, new_tier, role) — no payment secrets.

## Future extension points

- **Prompt 13**: Paystack + Flutterwave payment processing + webhooks
- **Prompt 14**: Featured listing credits (the `featuredListingCreditsPerMonth` capability + `featured_listing_credits` table from migration 0011)
- Team/staff management (the `maxTeamMembers` capability + `teams` / `team_members` tables from migration 0003)
- Analytics dashboard (the `analyticsTier` capability: basic → advanced → full → realtime)
