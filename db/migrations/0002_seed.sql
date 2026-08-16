-- ScoreAlert seed data
-- Migration 0002: sources (SourcePolicy register), default user, default watch rules,
--                 category synonym dictionary.
-- Mirrors docs/source-research.md. Keep in sync with backend/src/sources/registry.ts.

begin;

-- --- Sources / SourcePolicy register --------------------------------------
insert into sources (id, name, status, policy_type, base_url, active, health, notes) values
  ('ebay',       'eBay (Browse API)',        'OFFICIAL_API',  'OFFICIAL_API',
     'https://api.ebay.com/buy/browse/v1', true,  'disabled',
     'Official Browse API. OAuth client-credentials. Local-pickup + price filters. The only automated cloud source in the MVP.'),
  ('email',      'Email alert ingestion',    'EMAIL_ALERT',   'EMAIL_ALERT',
     null, true, 'disabled',
     'Parses the user''s own saved-search alert emails via inbound webhook. Event-driven.'),
  ('manual',     'Manual / Share Sheet',     'USER_PROVIDED', 'USER_PROVIDED',
     null, true, 'healthy',
     'Android Share Sheet -> POST /ingest/share. Universal legitimate fallback for FB/CL/OfferUp/etc.'),
  ('craigslist', 'Craigslist Kauaʻi',        'NOT_ALLOWED',   'NOT_ALLOWED',
     'https://honolulu.craigslist.org', false, 'policy_blocked',
     'ToS prohibits automated access; enforced aggressively ($60M RadPad, $31M Instamotor). Manual share only.'),
  ('facebook',   'Facebook Marketplace',     'NOT_ALLOWED',   'NOT_ALLOWED',
     'https://www.facebook.com/marketplace', false, 'policy_blocked',
     'No public Marketplace API. No scraping. Ingest via Share Sheet / user email only.'),
  ('offerup',    'OfferUp',                  'USER_PROVIDED', 'USER_PROVIDED',
     'https://offerup.com', false, 'disabled',
     'No official public API. Unofficial APIs unsupported and disabled. Share Sheet / native-alert email only.');

-- --- Default user ----------------------------------------------------------
-- The initial primary user. Email matches the operator; safe to change.
insert into users (id, email, display_name)
values ('00000000-0000-0000-0000-000000000001', 'jptrembath@gmail.com', 'Josh');

-- --- Default watch rules (per spec) ----------------------------------------
-- FREE STUFF: instant, price 0
insert into watch_rules
  (user_id, name, category, min_price, max_price, keywords, excluded_keywords, minimum_score, alert_velocity, high_priority_at)
values
  ('00000000-0000-0000-0000-000000000001', 'Free Stuff', 'free', 0, 0,
   '{free,curb alert,free pickup,must go,take it,first come,you haul,giveaway}',
   '{scam,shipping only,must buy,deposit required}',
   55, 'instant', 80);

-- VEHICLES: cars/trucks/vans/suv $500–$3,500 instant
insert into watch_rules
  (user_id, name, category, min_price, max_price, keywords, excluded_keywords, minimum_score, alert_velocity, high_priority_at)
values
  ('00000000-0000-0000-0000-000000000001', 'Vehicles $500–$3,500', null, 500, 3500,
   '{car,truck,van,suv,toyota,honda,ford,tacoma,cr-v,4runner,tundra,corolla,civic,4x4}',
   '{dealer,financing,down payment,monthly,parts only,for parts,salvage rebuild required}',
   60, 'instant', 90);

-- MOTORCYCLES $500–$3,500 instant
insert into watch_rules
  (user_id, name, category, min_price, max_price, keywords, excluded_keywords, minimum_score, alert_velocity, high_priority_at)
values
  ('00000000-0000-0000-0000-000000000001', 'Motorcycles / Scooters $500–$3,500', 'motorcycle', 500, 3500,
   '{motorcycle,dirt bike,dual sport,enduro,scooter,moped}',
   '{dealer,financing,parts only}',
   60, 'instant', 90);

-- BOATS $500–$3,500 instant
insert into watch_rules
  (user_id, name, category, min_price, max_price, keywords, excluded_keywords, minimum_score, alert_velocity, high_priority_at)
values
  ('00000000-0000-0000-0000-000000000001', 'Boats $500–$3,500', 'boat', 500, 3500,
   '{boat,skiff,dinghy,jon boat,sailboat,fishing boat,jet ski,whaler}',
   '{dealer,financing,parts only}',
   60, 'instant', 90);

-- --- Category synonym dictionary (semantic search) -------------------------
insert into category_synonyms (category, term) values
  -- free
  ('free','free'),('free','curb alert'),('free','free pickup'),('free','must go'),
  ('free','take it'),('free','first come'),('free','you haul'),('free','giveaway'),('free','free stuff'),
  -- car
  ('car','car'),('car','sedan'),('car','coupe'),('car','hatchback'),('car','wagon'),
  -- truck
  ('truck','truck'),('truck','pickup'),('truck','pick up'),('truck','flatbed'),
  -- suv
  ('suv','suv'),('suv','4runner'),('suv','cr-v'),('suv','crv'),('suv','tahoe'),('suv','4x4'),
  -- van
  ('van','van'),('van','minivan'),('van','cargo van'),('van','sienna'),('van','odyssey'),
  -- motorcycle
  ('motorcycle','motorcycle'),('motorcycle','bike'),('motorcycle','dirt bike'),
  ('motorcycle','enduro'),('motorcycle','dual sport'),('motorcycle','scooter'),('motorcycle','moped'),
  -- boat
  ('boat','boat'),('boat','skiff'),('boat','dinghy'),('boat','jon boat'),('boat','sailboat'),
  ('boat','fishing boat'),('boat','aluminum boat'),('boat','whaler'),('boat','jet ski'),
  ('boat','personal watercraft'),('boat','pwc'),
  -- trailer
  ('trailer','trailer'),('trailer','utility trailer'),('trailer','boat trailer'),('trailer','flatbed trailer'),
  -- tool (future category)
  ('tool','tool'),('tool','tools'),('tool','stihl'),('tool','dewalt'),('tool','makita'),
  ('tool','generator'),('tool','compressor'),('tool','lumber'),('tool','chainsaw');

commit;
