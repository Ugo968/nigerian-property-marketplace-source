-- ============================================================================
-- Seed: property_types
-- ============================================================================
-- Idempotent insert of the master property-type list. Per spec Section 6.

insert into public.property_types (slug, label, category, sort_order)
values
  ('apartment',            'Apartment',                'residential', 10),
  ('house',                'House',                    'residential', 20),
  ('duplex',               'Duplex',                   'residential', 30),
  ('bungalow',             'Bungalow',                'residential', 40),
  ('terrace',              'Terrace',                 'residential', 50),
  ('detached_house',       'Detached House',          'residential', 60),
  ('semi_detached_house',  'Semi-Detached House',     'residential', 70),
  ('mansion',              'Mansion',                 'residential', 80),
  ('penthouse',            'Penthouse',                'residential', 90),
  ('office',               'Office',                  'commercial', 100),
  ('shop',                 'Shop',                    'commercial', 110),
  ('warehouse',            'Warehouse',               'industrial',  120),
  ('commercial_building',  'Commercial Building',     'commercial', 130),
  ('hotel',                'Hotel',                   'commercial', 140),
  ('guest_house',          'Guest House',              'commercial', 150),
  ('event_center',         'Event Center',             'commercial', 160),
  ('school',               'School',                  'commercial', 170),
  ('hospital',             'Hospital',                'commercial', 180),
  ('farmland',             'Farmland',                'land',        190),
  ('residential_land',     'Residential Land',        'land',        200),
  ('commercial_land',      'Commercial Land',         'land',        210),
  ('industrial_land',      'Industrial Land',         'land',        220),
  ('mixed_use',            'Mixed-Use',               'mixed_use',   230),
  ('estate',               'Estate',                  'mixed_use',   240),
  ('shortlet',             'Short-let Property',      'residential', 250),
  ('other',                'Other',                   'other',       999)
on conflict (slug) do nothing;
