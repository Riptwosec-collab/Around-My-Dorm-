-- Around My Dorm hybrid Google platform schema.
-- Additive only: never replace, truncate, or rewrite amd_places.
-- Google Routes distance/duration is intentionally NOT persisted. Routes
-- responses remain runtime-only after an explicit admin request.

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
