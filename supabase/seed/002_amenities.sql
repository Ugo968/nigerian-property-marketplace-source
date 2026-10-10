-- ============================================================================
-- Seed: amenities
-- ============================================================================
-- Idempotent insert of the master amenities list. Per spec Section 9.

insert into public.amenities (slug, label, category, sort_order)
values
  ('parking',           'Parking',           'general',   10),
  ('security',          'Security',          'security',   20),
  ('swimming_pool',     'Swimming Pool',     'outdoor',    30),
  ('generator',         'Generator',         'utility',    40),
  ('electricity',       'Electricity',       'utility',    50),
  ('water',             'Water Supply',      'utility',    60),
  ('furnished',         'Furnished',         'indoor',     70),
  ('air_conditioning',  'Air Conditioning',  'appliance',  80),
  ('fitted_kitchen',    'Fitted Kitchen',    'indoor',     90),
  ('internet',          'Internet',          'utility',    100),
  ('elevator',          'Elevator',          'general',    110),
  ('gym',               'Gym',               'indoor',     120),
  ('garden',            'Garden',            'outdoor',    130),
  ('balcony',           'Balcony',           'outdoor',    140),
  ('boys_quarters',     'Boys Quarters',     'general',    150),
  ('gate',              'Gate',              'security',   160),
  ('cctv',              'CCTV',              'security',   170),
  ('pop_ceiling',       'POP Ceiling',       'indoor',     180),
  ('estate_security',   'Estate Security',   'security',   190),
  ('borehole',          'Borehole',          'utility',    200),
  ('solar_power',       'Solar Power',       'utility',    210),
  ('inverter',          'Inverter',          'utility',    220),
  ('serviced',          'Serviced',          'general',    230)
on conflict (slug) do nothing;
