-- Around My Dorm hybrid Google platform schema.
-- Additive only: never replace, truncate, or rewrite amd_places.

create table if not exists public.amd_home_origin (
  id text primary key check (id = 'baan-supha-apartment'),
  name_th text not null,
  name_en text,
  google_place_id text,
  formatted_address text,
  latitude double precision,
  longitude double precision,
  google_maps_url text,
  resolved_at timestamptz,
  verified_at timestamptz,
  source text not null default 'unresolved' check (source in ('google_places','manual_verified','unresolved')),
  updated_at timestamptz not null default now(),
  constraint amd_home_origin_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint amd_home_origin_longitude_check check (longitude is null or longitude between -180 and 180)
);

alter table public.amd_home_origin enable row level security;
revoke all on table public.amd_home_origin from anon, authenticated;
grant select on table public.amd_home_origin to anon, authenticated;
grant insert, update on table public.amd_home_origin to authenticated;

create policy "amd home origin public read" on public.amd_home_origin for select to anon, authenticated using (true);
create policy "amd home origin admin insert" on public.amd_home_origin for insert to authenticated
with check (
  coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
);
create policy "amd home origin admin update" on public.amd_home_origin for update to authenticated
using (
  coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
)
with check (
  coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
);

insert into public.amd_home_origin (id, name_th, source)
values ('baan-supha-apartment', 'บ้านสุภาอพาร์ทเม้นต์', 'unresolved')
on conflict (id) do nothing;

create table if not exists public.amd_route_cache (
  origin_id text not null references public.amd_home_origin(id) on delete cascade,
  place_id text not null references public.amd_places(id) on delete cascade,
  travel_mode text not null check (travel_mode in ('WALK','DRIVE','TWO_WHEELER')),
  distance_meters integer,
  duration_seconds integer,
  status text not null default 'UNKNOWN',
  status_message text,
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  source text not null default 'google_routes',
  updated_at timestamptz not null default now(),
  primary key (origin_id, place_id, travel_mode),
  constraint amd_route_cache_distance_check check (distance_meters is null or distance_meters >= 0),
  constraint amd_route_cache_duration_check check (duration_seconds is null or duration_seconds >= 0)
);

create index if not exists amd_route_cache_expires_idx on public.amd_route_cache(expires_at);
create index if not exists amd_route_cache_place_idx on public.amd_route_cache(place_id);

alter table public.amd_route_cache enable row level security;
revoke all on table public.amd_route_cache from anon, authenticated;
grant select on table public.amd_route_cache to anon, authenticated;
grant insert, update on table public.amd_route_cache to authenticated;

create policy "amd route cache public read" on public.amd_route_cache for select to anon, authenticated using (true);
create policy "amd route cache admin insert" on public.amd_route_cache for insert to authenticated
with check (
  coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
);
create policy "amd route cache admin update" on public.amd_route_cache for update to authenticated
using (
  coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
)
with check (
  coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
  and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
);
