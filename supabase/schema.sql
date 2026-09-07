-- Around My Dorm database-first schema
-- Public browsing is read-only. Maintenance writes should use a trusted admin/service role.

create extension if not exists pgcrypto;

create table if not exists public.places (
  id text primary key,
  slug text unique not null,
  name text not null,
  name_en text,
  category text not null,
  categories jsonb not null default '[]'::jsonb,
  latitude double precision,
  longitude double precision,
  address text,
  area text not null default '',
  soi text,
  opening_hours jsonb not null default '{}'::jsonb,
  structured_opening_hours jsonb,
  opening_hours_text text,
  is_24_hours boolean not null default false,
  open_late boolean,
  price_level integer check (price_level between 1 and 4),
  price_text text,
  average_price_per_person numeric,
  min_price numeric,
  max_price numeric,
  rating numeric,
  review_count integer,
  image text,
  cover_image text,
  images jsonb not null default '[]'::jsonb,
  gallery_images jsonb not null default '[]'::jsonb,
  image_metadata jsonb not null default '[]'::jsonb,
  image_source text,
  image_attribution text,
  image_verified_at timestamptz,
  place_type text,
  local_favorite boolean not null default false,
  hidden_gem boolean not null default false,
  recommended boolean not null default false,
  parking jsonb not null default '{}'::jsonb,
  parking_details jsonb,
  wifi boolean,
  power_outlet boolean,
  air_conditioned boolean,
  delivery boolean,
  takeaway boolean,
  phone text,
  website text,
  facebook text,
  instagram text,
  line text,
  google_place_id text,
  google_maps_url text,
  tags jsonb not null default '[]'::jsonb,
  popular_menus jsonb not null default '[]'::jsonb,
  recommended_items jsonb not null default '[]'::jsonb,
  payment_methods jsonb not null default '[]'::jsonb,
  source jsonb not null default '[]'::jsonb,
  source_id text,
  source_url text,
  verified boolean not null default false,
  data_status text,
  last_verified timestamptz,
  last_checked timestamptz,
  last_updated timestamptz not null default now(),
  notes text,
  record jsonb not null default '{}'::jsonb
);

create index if not exists places_category_idx on public.places(category);
create index if not exists places_verified_idx on public.places(verified);
create index if not exists places_area_idx on public.places(area);
create index if not exists places_last_checked_idx on public.places(last_checked);
create index if not exists places_location_idx on public.places(latitude, longitude);
create index if not exists places_categories_gin_idx on public.places using gin(categories);
create index if not exists places_name_search_idx on public.places using gin(to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(area, '')));

create table if not exists public.place_images (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references public.places(id) on delete cascade,
  url text,
  storage_key text,
  source text not null,
  source_reference text,
  source_url text,
  attribution text,
  width integer,
  height integer,
  verified boolean not null default false,
  last_checked timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists place_images_place_idx on public.place_images(place_id);

create table if not exists public.place_sources (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references public.places(id) on delete cascade,
  provider text not null,
  source_id text,
  source_url text,
  can_persist_places boolean not null default false,
  can_persist_photos boolean not null default false,
  can_persist_ratings boolean not null default false,
  can_persist_hours boolean not null default false,
  last_checked timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists place_sources_place_idx on public.place_sources(place_id);
create unique index if not exists place_sources_provider_source_id_idx on public.place_sources(provider, source_id) where source_id is not null;

create table if not exists public.place_updates (
  id uuid primary key default gen_random_uuid(),
  place_id text references public.places(id) on delete set null,
  place_name text not null,
  source text not null,
  risk text not null check (risk in ('safe','review','high')),
  status text not null default 'pending' check (status in ('pending','applied','ignored','rejected','failed','rolled_back')),
  detected_at timestamptz not null default now(),
  applied_at timestamptz,
  previous_data jsonb not null default '{}'::jsonb,
  incoming_data jsonb not null default '{}'::jsonb,
  error_message text
);
create index if not exists place_updates_place_idx on public.place_updates(place_id);
create index if not exists place_updates_status_idx on public.place_updates(status, detected_at desc);

create table if not exists public.place_update_changes (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.place_updates(id) on delete cascade,
  field_name text not null,
  previous_value jsonb,
  incoming_value jsonb,
  risk text not null check (risk in ('safe','review','high')),
  decision text not null default 'pending' check (decision in ('pending','accept','keep_existing','reject'))
);
create index if not exists place_update_changes_update_idx on public.place_update_changes(update_id);

create table if not exists public.place_verifications (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references public.places(id) on delete cascade,
  field_name text,
  source text not null,
  verified_at timestamptz not null default now(),
  note text
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  anonymous_user_id text not null,
  place_id text not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(anonymous_user_id, place_id)
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  anonymous_user_id text not null,
  title text not null,
  icon text,
  created_at timestamptz not null default now()
);

create table if not exists public.collection_places (
  collection_id uuid not null references public.collections(id) on delete cascade,
  place_id text not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(collection_id, place_id)
);

create table if not exists public.recent_views (
  id uuid primary key default gen_random_uuid(),
  anonymous_user_id text not null,
  place_id text not null references public.places(id) on delete cascade,
  viewed_at timestamptz not null default now()
);
create index if not exists recent_views_user_time_idx on public.recent_views(anonymous_user_id, viewed_at desc);

create table if not exists public.user_settings (
  anonymous_user_id text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.places enable row level security;
alter table public.place_images enable row level security;
alter table public.place_sources enable row level security;
alter table public.place_updates enable row level security;
alter table public.place_update_changes enable row level security;
alter table public.place_verifications enable row level security;

-- Normal users can browse place records. Maintenance writes remain unavailable to anon.
do $$ begin
  create policy "public read places" on public.places for select to anon using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public read place images" on public.place_images for select to anon using (true);
exception when duplicate_object then null; end $$;

-- Admin/service-role workflows bypass RLS and should be the only path for permanent maintenance writes.
