-- Around My Dorm hybrid Google platform schema.
-- This file is intentionally additive: it must never replace or truncate amd_places.

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

create policy "amd home origin public read"
on public.amd_home_origin
for select
to anon, authenticated
using (true);

insert into public.amd_home_origin (id, name_th, source)
values ('baan-supha-apartment', 'บ้านสุภาอพาร์ทเม้นต์', 'unresolved')
on conflict (id) do nothing;
