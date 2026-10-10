-- ============================================================================
-- Seed: advertising_placements
-- ============================================================================
-- Idempotent insert of master placement list. Per spec Section 19.

insert into public.advertising_placements (slug, label, sort_order)
values
  ('homepage',                  'Homepage',                    10),
  ('search_results',            'Search Results',             20),
  ('property_pages',            'Property Pages',             30),
  ('category_pages',            'Category Pages',            40),
  ('location_pages',            'Location Pages',             50),
  ('sponsored_business_cards',  'Sponsored Business Cards',  60),
  ('banners',                   'Banners',                    70)
on conflict (slug) do nothing;
