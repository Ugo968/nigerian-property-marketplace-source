-- ============================================================================
-- Seed: subscription_plans
-- ============================================================================
-- Idempotent insert of the master subscription plan matrix.
-- Source of truth for pricing in the application codebase is
-- src/lib/subscriptions/plans.ts — this seed mirrors those values into
-- the database so the DB can be queried for reporting without joining
-- to the application code.
--
-- Per spec Section 17 (immutable):
--   Landlord:  Free ₦0   | Pro ₦3,500   | Premium ₦9,500
--   Agent:      Free ₦0   | Pro ₦5,000   | Premium ₦12,000
--   Company:    Free ₦0   | Pro ₦20,000  | Premium ₦35,000+ (variable)
--
-- All amounts in NAIRA MAJOR UNITS (the application converts to kobo for
-- payment provider calls). The column price_naira stores major units here
-- for human readability — see notes in 0009_subscriptions.sql.

insert into public.subscription_plans
  (role, tier, price_naira, is_variable_price, billing_cycle, is_default, is_sellable, tagline, highlights)
values
  ('landlord', 'free',    0,     false, 'monthly', true,  true,
   'List your property and connect with agents.',
   '["Up to 5 property photos","No property videos","Basic search","Receive agent applications","Chat with applicants","Application tracking","Reviews & ratings","Basic analytics","Basic property alerts","Featured listings paid separately"]'::jsonb),
  ('landlord', 'pro',     3500,  false, 'monthly', false, true,
   'More visibility and tools for active landlords.',
   '["Up to 25 property photos","Up to 2 videos per property","Advanced search","Advanced analytics","3 saved searches","Advanced alerts","Eligible for verification","Featured listing credits included","Search ranking boost","Limited homepage exposure","Priority support","Social media handles"]'::jsonb),
  ('landlord', 'premium', 9500,  false, 'monthly', false, true,
   'Everything Pro, plus premium exposure and analytics.',
   '["Unlimited photos (fair-use applies)","Property videos","Advanced search","Full analytics","Unlimited saved searches","Real-time alerts","Eligible for verification","More featured listing credits","Priority search ranking","Priority homepage exposure","Bulk management","Social media handles","Priority support"]'::jsonb),
  ('agent', 'free',    0,     false, 'monthly', true,  true,
   'Start discovering properties and applying to represent them.',
   '["Browse properties","Basic search","10 applications / month","Chat (per plan limits)","Basic application functionality","Reviews & ratings","10 saved properties","3 saved searches","Basic alerts","No verification badge"]'::jsonb),
  ('agent', 'pro',     5000,  false, 'monthly', false, true,
   'Higher limits and Bronze verification eligibility.',
   '["Advanced search","25 applications / month","Chat (per plan limits)","Application tracking","25 saved properties","15 saved searches","Instant alerts","Bronze verification eligibility","Advanced analytics","Featured / visibility benefits","Search ranking boost","Priority support","Social media handles"]'::jsonb),
  ('agent', 'premium', 12000, false, 'monthly', false, true,
   'Unlimited activity and Blue verification eligibility.',
   '["Advanced search","Unlimited applications (fair-use applies)","Unlimited saved properties","Unlimited saved searches","Instant + Priority alerts","Blue verification eligibility","Full analytics","Priority search visibility","Featured profile","Priority support","Social media handles"]'::jsonb),
  ('company', 'free',    0,     false, 'monthly', true,  true,
   'List company properties and receive agent applications.',
   '["Up to 10 property listings / month","Up to 3 photos per listing","No listing videos","Basic search","Receive agent applications","Chat (per plan limits)","Application tracking","Reviews & ratings","Basic saved-search functionality","Basic alerts","Verification application","Basic analytics","Featured listings paid separately","1 team / staff account"]'::jsonb),
  ('company', 'pro',     20000, false, 'monthly', false, true,
   'Higher limits and Bronze verification eligibility.',
   '["Up to 20 property listings / month","Up to 5 photos per listing","Up to 2 videos per listing","Advanced search","Receive agent applications","Application tracking","Reviews & ratings","Saved searches","Advanced alerts","Bronze verification eligibility","Advanced analytics","Featured listing credits included","Search ranking boost","Bulk management","5 team / staff accounts","Priority support"]'::jsonb),
  ('company', 'premium', 35000, true,  'monthly', false, true,
   'Unlimited capacity and Blue verification eligibility.',
   '["Unlimited listings (fair-use applies)","Unlimited listing media (fair-use applies)","Advanced search","Unlimited saved searches","Real-time alerts","Blue verification eligibility","Real-time analytics","More featured listing credits","Priority search ranking","Bulk management","Unlimited team / staff accounts","Dedicated support","Social media handles"]'::jsonb)
on conflict (role, tier, billing_cycle) do nothing;

-- Tenant plans (spec Section 2: ₦1,500/month, 7-day free trial)
  ('tenant', 'free',    0,     false, 'monthly', true,  false,
   '7-day free trial. Browse up to 10 listings.',
   '["7-day free trial","Browse up to 10 listings","Search and filter properties","View public property details","Save preferences"]'::jsonb),
  ('tenant', 'pro',     1500,  false, 'monthly', false, true,
   'Full tenant access. Contact landlords directly.',
   '["Browse all listings","Advanced search and filters","Contact landlords directly","Save properties","Save searches","Property alerts","Manage enquiries","Report suspicious listings"]'::jsonb)
on conflict (role, tier, billing_cycle) do nothing;
