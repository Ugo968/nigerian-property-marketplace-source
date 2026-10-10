# DATABASE DESIGN

This document is an alias for `DATABASE.md`. The canonical database
architecture reference lives there.

**See: [DATABASE.md](./DATABASE.md)** for:

- Migration structure (0001–0026)
- Entity relationships
- RLS strategy
- Constraints
- Indexes
- Soft-deletion behaviour
- Cascade behaviour
- ER diagram

## Migration summary (26 migrations)

| # | File | Purpose |
|---|---|---|
| 0001 | `initial_foundation.sql` | pgcrypto, set_updated_at(), profiles, admin_users, audit_logs |
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
| 0017 | `database_functions.sql` | SECURITY DEFINER helpers |
| 0018 | `storage_policies.sql` | per-bucket RLS for Supabase Storage |
| 0019 | `property_extensions.sql` | furnished_status, year_built, parking_spaces, floors |
| 0020 | `property_agent_representations.sql` | representation relationships |
| 0021 | `review_indexes.sql` | review query indexes |
| 0022 | `featured_credit_ledger.sql` | append-only credit transaction ledger |
| 0023 | `notifications_extensions.sql` | notification preferences, events, email delivery records |
| 0024 | `admin_extensions.sql` | admin_action_records, report_categories, platform_settings |
| 0025 | `property_transactions.sql` | transactions, inspections, offers, negotiation_records |
| 0026 | `security_hardening.sql` | tightened creative public-read, CHECK constraints, UNIQUE indexes |

All migrations are idempotent (`create table if not exists`, `on conflict do nothing`).
