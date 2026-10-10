-- ============================================================================
-- Seed: advertiser_categories
-- ============================================================================
-- Idempotent insert of master business categories. Per spec Section 19.

insert into public.advertiser_categories (slug, label, sort_order)
values
  ('carpenter',                       'Carpenter',                          10),
  ('interior_designer',               'Interior Designer',                  20),
  ('furniture_business',              'Furniture Business',                 30),
  ('plumber',                         'Plumber',                            40),
  ('electrician',                     'Electrician',                        50),
  ('architect',                       'Architect',                          60),
  ('painter',                         'Painter',                            70),
  ('mover',                           'Mover / Moving Company',             80),
  ('security_company',                'Security Company',                   90),
  ('cleaning_company',                'Cleaning Company',                   100),
  ('landscaping',                     'Landscaping',                         110),
  ('building_materials_supplier',     'Building Materials Supplier',       120),
  ('generator_solar',                 'Generator / Solar',                   130),
  ('home_appliance_business',         'Home Appliance Business',            140),
  ('other',                           'Other',                              999)
on conflict (slug) do nothing;
