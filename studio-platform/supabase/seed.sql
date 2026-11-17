-- Generated from packages/sitegen so trades and niches match the generator.
insert into public.trades (id, name) values
  ('construction', 'Construction'),
  ('electrical', 'Electrical'),
  ('retail', 'Retail'),
  ('banking', 'Banking'),
  ('law', 'Law'),
  ('it', 'IT'),
  ('food', 'Food'),
  ('beauty', 'Beauty'),
  ('fitness', 'Fitness')
on conflict (id) do nothing;

insert into public.niches (key, name, trade_id) values
  ('con', 'Construction', 'construction'),
  ('trades', 'Electrical and plumbing', 'electrical'),
  ('ret', 'Retail store', 'retail'),
  ('bnk', 'Banking and finance', 'banking'),
  ('law', 'Law firm', 'law'),
  ('it', 'IT services', 'it'),
  ('ita', 'Italian', 'food'),
  ('jpn', 'Japanese', 'food'),
  ('indi', 'Indian', 'food'),
  ('mex', 'Mexican', 'food'),
  ('chn', 'Chinese', 'food'),
  ('mid', 'Middle Eastern', 'food'),
  ('sa', 'South African braai', 'food'),
  ('dnr', 'American grill', 'food'),
  ('caf', 'Café and bakery', 'food'),
  ('nls', 'Nails', 'beauty'),
  ('mup', 'Make-up artist', 'beauty'),
  ('lsh', 'Lashes and brows', 'beauty'),
  ('hair', 'Hair salon', 'beauty'),
  ('brb', 'Barber', 'beauty'),
  ('spa', 'Skin and spa', 'beauty'),
  ('fit', 'Gym or personal trainer', 'fitness')
on conflict (key) do nothing;
