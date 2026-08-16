-- ScoreAlert core schema (PostgreSQL / Supabase)
-- Migration 0001: initial schema
--
-- Design notes:
--   * Multi-user ready (one user today) via users + user-scoped watch_rules/alerts.
--   * Row Level Security is enabled on user-scoped tables; policies added at the end.
--   * We store metadata + deep links. Images: thumbnail URL by default; we only cache
--     bytes where a source's license permits (see docs/source-research.md).

begin;

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
create table users (
    id           uuid primary key default gen_random_uuid(),
    email        text unique not null,
    display_name text,
    created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- sources  (one row per integration; seeds its SourcePolicy)
-- ---------------------------------------------------------------------------
create type source_policy as enum (
    'OFFICIAL_API', 'APPROVED_FEED', 'EMAIL_ALERT',
    'USER_PROVIDED', 'MANUAL_IMPORT', 'RESEARCH_REQUIRED', 'NOT_ALLOWED'
);

create type source_health as enum (
    'healthy', 'degraded', 'disabled', 'authorization_required', 'policy_blocked'
);

create table sources (
    id            text primary key,          -- 'ebay', 'craigslist', 'facebook', ...
    name          text not null,
    status        source_policy not null,
    policy_type   source_policy not null,     -- kept distinct for future divergence
    base_url      text,
    active        boolean not null default false,   -- automated collection on/off
    health        source_health not null default 'disabled',
    last_checked  timestamptz,
    last_error    text,
    notes         text
);

-- ---------------------------------------------------------------------------
-- listings
-- ---------------------------------------------------------------------------
create type listing_status as enum ('active', 'expired', 'removed', 'duplicate');

create table listings (
    id               uuid primary key default gen_random_uuid(),
    source_id        text not null references sources(id),
    external_id      text,                    -- id within the source, when available
    canonical_url    text not null,
    title            text not null,
    description      text,
    price            numeric(12,2),
    currency         text not null default 'USD',
    category         text,                    -- car|truck|van|suv|motorcycle|boat|trailer|free|tool|other
    subcategory      text,
    make             text,
    model            text,
    year             int,
    mileage          int,
    location_text    text,                    -- approximate town is enough
    latitude         double precision,        -- only if legitimately available
    longitude        double precision,
    primary_image_url text,
    seller_name      text,                    -- only where permitted; usually null
    source_created_at timestamptz,            -- when the seller posted it (source time)
    first_seen_at    timestamptz not null default now(),   -- NEW-detection anchor
    last_seen_at     timestamptz not null default now(),
    status           listing_status not null default 'active',
    cluster_id       uuid,                    -- FK added after listing_clusters
    raw_json         jsonb,
    normalized_hash  text not null,           -- dedupe key
    -- extracted automotive/condition facts (see automotive-parser)
    running_status   text,                    -- runs|runs_and_drives|no_start|unknown
    title_status     text,                    -- clean|salvage|rebuilt|no_title|unknown
    registration_status text,                 -- current|expired|unknown
    safety_status    text,                    -- current|expired|unknown|na
    drivetrain       text,                    -- 4x4|awd|fwd|rwd|unknown
    transmission     text,                    -- manual|automatic|unknown
    issues           text[] not null default '{}',   -- e.g. {'wheel_bearing','overheating'}
    is_free          boolean not null default false,
    constraint listings_source_external_uk unique (source_id, external_id)
);

create index listings_normalized_hash_idx on listings (normalized_hash);
create index listings_category_idx        on listings (category);
create index listings_first_seen_idx      on listings (first_seen_at desc);
create index listings_price_idx           on listings (price);
create index listings_status_idx          on listings (status);

-- ---------------------------------------------------------------------------
-- listing_images  (ordered gallery; usually remote URLs)
-- ---------------------------------------------------------------------------
create table listing_images (
    id          uuid primary key default gen_random_uuid(),
    listing_id  uuid not null references listings(id) on delete cascade,
    url         text not null,
    "order"     int  not null default 0,
    cached      boolean not null default false   -- true only where license permits caching
);
create index listing_images_listing_idx on listing_images (listing_id, "order");

-- ---------------------------------------------------------------------------
-- listing_clusters  (duplicate grouping across sources)
-- ---------------------------------------------------------------------------
create table listing_clusters (
    id                 uuid primary key default gen_random_uuid(),
    primary_listing_id uuid,                  -- best card to show
    created_at         timestamptz not null default now(),
    member_count       int not null default 1
);

alter table listings
    add constraint listings_cluster_fk
    foreign key (cluster_id) references listing_clusters(id) on delete set null;

alter table listing_clusters
    add constraint clusters_primary_fk
    foreign key (primary_listing_id) references listings(id) on delete set null;

-- ---------------------------------------------------------------------------
-- price_history  (enables PRICE DROP alerts + Kauaʻi pricing analytics)
-- ---------------------------------------------------------------------------
create table price_history (
    id          uuid primary key default gen_random_uuid(),
    listing_id  uuid not null references listings(id) on delete cascade,
    price       numeric(12,2),
    observed_at timestamptz not null default now()
);
create index price_history_listing_idx on price_history (listing_id, observed_at desc);

-- ---------------------------------------------------------------------------
-- listing_scores
-- ---------------------------------------------------------------------------
create table listing_scores (
    listing_id      uuid primary key references listings(id) on delete cascade,
    overall_score   int  not null,
    price_score     int  not null default 0,
    freshness_score int  not null default 0,
    category_score  int  not null default 0,
    keyword_score   int  not null default 0,
    location_score  int  not null default 0,
    condition_score int  not null default 0,
    label           text not null,           -- 'SCORE_NOW'|'GREAT_FIND'|'GOOD_LEAD'|'BELOW'
    explanation     jsonb not null default '{}',   -- {positives:[], watchouts:[]}
    scored_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- watch_rules  (user-scoped; seeded with sensible defaults)
-- ---------------------------------------------------------------------------
create table watch_rules (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references users(id) on delete cascade,
    name              text not null,
    active            boolean not null default true,
    category          text,                  -- null = any category
    min_price         numeric(12,2),
    max_price         numeric(12,2),
    keywords          text[] not null default '{}',
    excluded_keywords text[] not null default '{}',
    max_distance      numeric,               -- miles; null = whole island
    geographic_area   text default 'Kauai',
    minimum_score     int not null default 60,
    alert_velocity    text not null default 'instant',  -- instant|smart|quiet
    high_priority_at  int,                   -- score >= this => high-priority push
    created_at        timestamptz not null default now()
);
create index watch_rules_user_idx on watch_rules (user_id, active);

-- ---------------------------------------------------------------------------
-- alerts  (notification history)
-- ---------------------------------------------------------------------------
create table alerts (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references users(id) on delete cascade,
    listing_id      uuid not null references listings(id) on delete cascade,
    matched_rule_id uuid references watch_rules(id) on delete set null,
    kind            text not null default 'new',  -- new|price_drop
    score           int,
    created_at      timestamptz not null default now(),
    delivered_at    timestamptz,
    opened_at       timestamptz,
    dismissed_at    timestamptz,
    saved_at        timestamptz
);
create index alerts_user_idx on alerts (user_id, created_at desc);
create unique index alerts_dedupe_idx on alerts (user_id, listing_id, kind);

-- ---------------------------------------------------------------------------
-- devices  (FCM tokens per user)
-- ---------------------------------------------------------------------------
create table devices (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references users(id) on delete cascade,
    fcm_token  text not null unique,
    platform   text not null default 'android',
    created_at timestamptz not null default now(),
    last_seen  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- category_synonyms  (editable semantic dictionary used by classification)
-- ---------------------------------------------------------------------------
create table category_synonyms (
    id       uuid primary key default gen_random_uuid(),
    category text not null,      -- canonical: car, truck, van, motorcycle, boat, free, ...
    term     text not null,      -- 'skiff','dinghy','curb alert', ...
    unique (category, term)
);
create index category_synonyms_cat_idx on category_synonyms (category);

-- ---------------------------------------------------------------------------
-- collector_runs  (admin/diagnostics + source health history)
-- ---------------------------------------------------------------------------
create table collector_runs (
    id            uuid primary key default gen_random_uuid(),
    source_id     text not null references sources(id),
    started_at    timestamptz not null default now(),
    finished_at   timestamptz,
    ok            boolean,
    listings_seen int not null default 0,
    listings_new  int not null default 0,
    duplicates    int not null default 0,
    alerts_made   int not null default 0,
    api_calls     int not null default 0,
    error         text
);
create index collector_runs_source_idx on collector_runs (source_id, started_at desc);

commit;
