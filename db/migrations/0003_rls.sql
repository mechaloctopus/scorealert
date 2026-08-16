-- ScoreAlert Row Level Security (Supabase)
-- Migration 0003: RLS on user-scoped tables. Server uses the service-role key and
-- bypasses RLS; the Android client uses the anon key + user JWT and only sees its own rows.

begin;

alter table users        enable row level security;
alter table watch_rules  enable row level security;
alter table alerts       enable row level security;
alter table devices      enable row level security;

-- A user can see/manage only their own row(s). auth.uid() is the Supabase JWT subject.
create policy users_self on users
    using (id = auth.uid());

create policy watch_rules_self on watch_rules
    using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy alerts_self on alerts
    using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy devices_self on devices
    using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Listings, scores, images, sources, synonyms are shared read-only reference data for
-- authenticated users. (Alerts link a user to the listings they should see.)
alter table listings          enable row level security;
alter table listing_scores    enable row level security;
alter table listing_images    enable row level security;
alter table listing_clusters  enable row level security;
alter table sources           enable row level security;
alter table category_synonyms enable row level security;

create policy listings_read          on listings          for select using (auth.role() = 'authenticated');
create policy listing_scores_read    on listing_scores    for select using (auth.role() = 'authenticated');
create policy listing_images_read    on listing_images    for select using (auth.role() = 'authenticated');
create policy listing_clusters_read  on listing_clusters  for select using (auth.role() = 'authenticated');
create policy sources_read           on sources           for select using (auth.role() = 'authenticated');
create policy category_synonyms_read on category_synonyms for select using (auth.role() = 'authenticated');

commit;
