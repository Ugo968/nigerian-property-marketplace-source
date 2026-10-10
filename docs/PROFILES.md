# PROFILES

This document records the profile + public-profile architecture as actually implemented.

## Architecture overview

```mermaid
flowchart TD
    A[Profile row] --> B{role}
    B -->|landlord| C[landlord_profiles row]
    B -->|agent| D[agent_profiles row]
    B -->|company| E[company_profiles row]

    A --> F[Public profile fetcher]
    C -.-> F
    D -.-> F
    E -.-> F

    F --> G[PublicProfile type — public fields only]
    G --> H[Public profile pages]
    H --> I[/agents/[id]]
    H --> J[/companies/[id]]
    H --> K[/landlords/[id]]

    A --> L[Edit actions]
    C -.-> L
    D -.-> L
    E -.-> L
    L --> M[/dashboard/profile]
```

## Profile model

The main `profiles` table contains shared identity. Role-specific fields live in three 1:1 child tables:

| Table | Fields | Notes |
|---|---|---|
| `profiles` | role, full_name, phone, email, avatar_url, bio, preferred_location, verification_state, subscription_tier, account_status | Owned by `auth.users` |
| `landlord_profiles` | preferred_contact_method, preferred_contact_value, ownership_summary | 1:1 with profiles |
| `agent_profiles` | professional_name, agency_name, years_of_experience, license_number, license_issuing_body, professional_description, portfolio_url | 1:1 with profiles |
| `company_profiles` | company_name, company_logo_url, company_description, cac_registration_number, cac_registered, office_address, office_state, office_lga, website, social_handles | 1:1 with profiles |

## Public vs private fields

Per spec Section 4 + 26, public profiles use **explicit column-select** (never `SELECT *`). The public-profile fetcher (`src/lib/profiles/public-profile.ts`) returns only:

### Public

- `id`
- `role`
- `full_name` (or `company_name` for companies)
- `bio`
- `avatar_url` (or `company_logo_url` for companies)
- `areas_served`
- `social_handles` — **only if the caller's plan permits (capability-gated)**
- `verification_state` (but only `bronze` / `blue` are publicly visible via `VerificationBadge`'s `hideWhenNotBadged` prop)
- `account_status` (only for filter purposes — never shown to viewers)
- `created_at` (displayed as "Member since")

### Role-specific public

- **Landlord**: `ownership_summary`, `preferred_contact_method` (NOT `preferred_contact_value` — that's private)
- **Agent**: `professional_name`, `agency_name`, `years_of_experience`, `license_issuing_body`, `professional_description`, `portfolio_url`
- **Company**: `company_name`, `company_logo_url`, `company_description`, `office_state`, `office_lga`, `website`, `cac_registered` (NOT `cac_registration_number` — admin-viewable only via verification review)

### Private (never exposed publicly)

- `verification_payload` (the JSONB blob on role-specific rows — internal use only)
- `phone` (only exposed via the messaging system, which respects plan + verification rules)
- `email` (only via the messaging system)
- `account_status` detailed values
- `suspended_at`, `suspended_reason`
- `deleted_at`
- `email_verified`, `phone_verified` (only shown as a chip if true)
- `subscription_tier` (only the capability derivation is public, not the tier name itself)

## Profile completeness

`src/lib/profiles/completeness.ts` calculates a 0–100 percentage per role based on weighted fields.

| Role | Required fields for `meetsMinimum` | Min % |
|---|---|---|
| Landlord | full_name, phone, preferred_location | ~45% |
| Agent | full_name, phone, professional_name, areas_served | ~50% |
| Company | company_name, company_description, office_address, phone | ~55% |

The calculation is honest, not gamified. The same `computeProfileCompleteness()` drives:
- The onboarding form's live preview
- The dashboard/profile edit form's live preview
- The verification eligibility check (Bronze requires ≥60%, Blue requires ≥80%)

## Profile editing

`/dashboard/profile` — single page with multiple sections:

1. **Profile completeness banner** (live % bar)
2. **Profile photo / company logo** upload (avatars bucket, MIME-validated, ≤5MB)
3. **Basic information**: name, phone, bio, preferred location
4. **Role-specific information**: landlord / agent / company fields
5. **Social media** (capability-gated — Premium only)
6. **Account information** (read-only display of role, subscription, verification, member-since)

### What users CANNOT edit

- `role` — DB RLS UPDATE policy enforces immutability
- `subscription_tier` — DB RLS UPDATE policy enforces immutability
- `verification_state` — no client-writable path; admin-only
- `account_status` — set by onboarding finalizer (to `active`) OR admin actions; never client-writable
- `email_verified`, `phone_verified` — set by Supabase Auth flows
- `deleted_at` — admin-only
- Another user's profile — RLS blocks cross-user access

## Public profile pages

| Route | What it shows |
|---|---|
| `/agents/[id]` | Header + About + Professional info + Areas served + Social (if Premium) + Reviews placeholder |
| `/companies/[id]` | Header + Company description + Business info + Social (if Premium) + Reviews placeholder |
| `/landlords/[id]` | Header + About + Ownership summary + Reviews placeholder |

All public profile pages:
- Fetch via `getPublicProfile()` (public-safe column-select)
- Return 404 / EmptyState when profile not found, soft-deleted, or banned
- Include the `SafetyNotice` component at the bottom (per spec Section 8)

## Trust indicators

`src/components/profiles/trust-indicators.tsx` shows a row of chips:

- `VerificationBadge` — only `bronze` or `blue` are publicly visible
- "Email verified" — only when `email_verified === true`
- "Phone verified" — only when `phone_verified === true`
- "Member since {month} {year}"
- "{N} active listings" — only when `N > 0`
- "{rating} ★ ({reviewCount})" — only when there ARE reviews

Per spec Section 25: **never show a trust indicator unless the underlying condition is actually true**. No green checkmark icons that imply more than they mean.

## Contact actions

`src/components/profiles/contact-actions.tsx` shows:

- **View properties** → links to `/properties?owner={id}` (filter listings by owner)
- **Call** → `tel:` link (only when the profile owner has opted in — future privacy setting; currently hidden by default)
- **Email** → `mailto:` link (only when opted in)
- **Message** → links to `/dashboard/messages?new=true&to={id}` (messaging UI comes in P6)
- **Report** → opens a dialog with reason + description fields

Per spec Section 27: access respects role / subscription / verification rules / chat limits / privacy settings. The messaging system (P6) will enforce those rules server-side.

## Profile reporting

The Report dialog (`src/components/profiles/contact-actions.tsx` → `ReportProfileButton`) calls `submitProfileReport()` in `src/lib/profiles/edit-actions.ts`.

Reports are inserted into the existing `reports` table (migration 0016) with `entity_type='profile'`, `entity_id={profileId}`, and one of the spec-defined reasons. The reporter_id is set to the caller's profile id. Self-reports are blocked.

Rate-limited: 10 reports per hour per user (via `RATE_LIMITS.report`).

## Social media capability gating

Per spec Section 23: social handles are Premium-only. The capability `canShowSocialMediaHandles` is set to `false` for Free AND Pro plans; `true` only for Premium.

Enforcement layers:
1. **Capability system** (`src/lib/capabilities/index.ts`) — single source of truth
2. **Server action** (`updateSocialHandles()` in `src/lib/profiles/edit-actions.ts`) — checks capability before persisting
3. **Public profile fetcher** — strips `social_handles` if the profile owner's plan doesn't permit (so even if the row has handles stored, they're not exposed publicly when the plan doesn't allow)
4. **UI** — the edit form shows "Social media handles are available on the Premium plan" when the capability is false

## Storage strategy

| Bucket | Visibility | Path convention | Used by |
|---|---|---|---|
| `avatars` | Public read | `{user_id}/{uuid}.{ext}` | Profile photos + company logos |
| `verification-documents` | **PRIVATE** — applicant + admin only | `{application_id}/{uuid}.{ext}` | Verification documents |
| `property-media` | Public read (active properties only) | `{property_id}/{uuid}.{ext}` | (Future — P2) |
| `advertising-creatives` | Public read (active campaigns only) | `{business_id}/{uuid}.{ext}` | (Future — P12) |
| `message-attachments` | **PRIVATE** — participants only | `{conversation_id}/{uuid}.{ext}` | (Future — P6) |
| `report-evidence` | **PRIVATE** — reporter + admin only | `{report_id}/{uuid}.{ext}` | (Future — P14) |

Storage policies live in `supabase/migrations/0018_storage_policies.sql`. They use the `can_manage_property()` and `is_caller_admin()` SECURITY DEFINER helper functions to avoid recursive RLS.

## File validation

`src/lib/storage/file-validation.ts` enforces:

1. **Magic-byte MIME sniffing** — read first 16 bytes, match against known signatures (JPEG / PNG / WebP / PDF)
2. **Extension blocklist** — `.exe`, `.bat`, `.cmd`, `.sh`, `.bin`, `.msi`, `.dmg`, `.app`, `.deb`, `.rpm`, `.apk`, `.jar`, `.js`, `.ts`, `.html`, `.svg`, `.zip`, `.rar`, `.7z`, `.tar`, `.gz`
3. **Extension allowlist** — for documents: `.jpg`, `.jpeg`, `.png`, `.webp`, `.pdf`; for avatars: same minus PDF
4. **Size limit** — 10 MB for documents, 5 MB for avatars
5. **Empty-file rejection**
6. **Client-reported MIME cross-check** — if client says `application/pdf` but bytes are PNG, the sniffed type (`image/png`) wins. The mismatch is logged for review.

Per spec Section 13: client-provided MIME is NEVER trusted alone. Magic-byte sniffing is the authoritative source.

## Verification workflow

See `docs/VERIFICATION.md` for the full verification system documentation.
