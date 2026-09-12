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

-- App-tracked Google API usage. This is an application estimate, not Google's
-- official billing meter. Photo requests use request_type = 'place_photo'.
create table if not exists public.amd_google_request_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  occurred_at timestamptz not null default now(),
  request_type text not null,
  place_id text,
  place_name text,
  google_place_id text,
  query text,
  status text not null,
  attempted integer not null default 0,
  retry_count integer not null default 0,
  duration_ms integer,
  candidate_count integer
);
create index if not exists amd_google_request_logs_user_time_idx on public.amd_google_request_logs(user_id, occurred_at desc);
create index if not exists amd_google_request_logs_type_time_idx on public.amd_google_request_logs(request_type, occurred_at desc);

alter table public.amd_google_request_logs enable row level security;
revoke all on table public.amd_google_request_logs from anon, authenticated;
grant select, insert on table public.amd_google_request_logs to authenticated;
do $$ begin
  create policy "amd own google request logs" on public.amd_google_request_logs for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create or replace function public.amd_google_usage_summary()
returns table (
  period_start timestamptz,
  reset_at timestamptz,
  total_attempts bigint,
  dynamic_map bigint,
  place_details bigint,
  text_search bigint,
  geocoding bigint,
  routes bigint,
  street_view bigint,
  place_photo bigint,
  other_requests bigint,
  failed_requests bigint,
  retries bigint,
  last_request timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', timezone('Asia/Bangkok', now())) at time zone 'Asia/Bangkok' as start_at,
      (date_trunc('month', timezone('Asia/Bangkok', now())) + interval '1 month') at time zone 'Asia/Bangkok' as end_at
  ),
  scoped as (
    select l.*
    from public.amd_google_request_logs l
    cross join bounds b
    where l.user_id = auth.uid()
      and l.occurred_at >= b.start_at
      and l.occurred_at < b.end_at
  )
  select
    b.start_at,
    b.end_at,
    coalesce(sum(greatest(coalesce(s.attempted, 0), 0)), 0)::bigint,
    coalesce(sum(greatest(coalesce(s.attempted, 0), 0)) filter (where s.request_type = 'dynamic_map'), 0)::bigint,
    coalesce(sum(greatest(coalesce(s.attempted, 0), 0)) filter (where s.request_type = 'place_details'), 0)::bigint,
    coalesce(sum(greatest(coalesce(s.attempted, 0), 0)) filter (where s.request_type = 'text_search'), 0)::bigint,
    coalesce(sum(greatest(coalesce(s.attempted, 0), 0)) filter (where s.request_type = 'geocoding'), 0)::bigint,
    coalesce(sum(greatest(coalesce(s.attempted, 0), 0)) filter (where s.request_type = 'routes'), 0)::bigint,
    coalesce(sum(greatest(coalesce(s.attempted, 0), 0)) filter (where s.request_type = 'street_view'), 0)::bigint,
    coalesce(sum(greatest(coalesce(s.attempted, 0), 0)) filter (where s.request_type = 'place_photo'), 0)::bigint,
    coalesce(sum(greatest(coalesce(s.attempted, 0), 0)) filter (where s.request_type not in ('dynamic_map','place_details','text_search','geocoding','routes','street_view','place_photo')), 0)::bigint,
    count(*) filter (where s.status = 'failed')::bigint,
    coalesce(sum(greatest(coalesce(s.retry_count, 0), 0)), 0)::bigint,
    max(s.occurred_at)
  from bounds b
  left join scoped s on true
  group by b.start_at, b.end_at;
$$;

revoke all on function public.amd_google_usage_summary() from public, anon;
grant execute on function public.amd_google_usage_summary() to authenticated;
