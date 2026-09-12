-- Around My Dorm: user-scoped, short-lived Google Places cloud cache.
-- Applied to Supabase project gfqkexnqbjtuwsyqacsw on 2026-09-12.
-- Place IDs are retained separately as durable external identifiers; Places content expires.

create table if not exists public.amd_google_place_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null,
  google_place_id text not null,
  payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  source text not null default 'google_places_admin',
  primary key (user_id, place_id)
);

create index if not exists amd_google_place_cache_expires_at_idx
  on public.amd_google_place_cache (expires_at);

create index if not exists amd_google_place_cache_google_place_id_idx
  on public.amd_google_place_cache (google_place_id);

alter table public.amd_google_place_cache enable row level security;

drop policy if exists "amd own google place cache" on public.amd_google_place_cache;
create policy "amd own google place cache"
  on public.amd_google_place_cache
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.amd_google_place_matches
  add column if not exists candidate_expires_at timestamptz;

comment on table public.amd_google_place_cache is
  'Short-lived Google Places content cache. Place IDs may be retained separately; payload rows must expire and be refreshed/deleted per Google Maps Platform terms.';
