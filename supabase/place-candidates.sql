-- Around My Dorm Phase 2A staged place candidates.
-- Candidate records are maintenance data and are never public browsing data.

create or replace function public.amd_is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select auth.uid() is not null and exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and not coalesce(u.is_anonymous, false)
      and (
        coalesce(u.raw_app_meta_data -> 'amd_admin', 'false'::jsonb) = 'true'::jsonb
        or (
          lower(coalesce(u.email, '')) = 'misuki2803@gmail.com'
          and u.email_confirmed_at is not null
        )
      )
  );
$$;

revoke all on function public.amd_is_admin() from public, anon;
grant execute on function public.amd_is_admin() to authenticated;

create table if not exists public.amd_place_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  candidate_key text not null,
  source_provider text not null,
  source_id text,
  status text not null check (status in ('new','needs_review','approved','rejected','merged')),
  payload jsonb not null,
  possible_match_ids jsonb not null default '[]'::jsonb,
  match_score numeric not null default 0,
  validation_issues jsonb not null default '[]'::jsonb,
  completeness_score integer not null default 0,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, candidate_key)
);

create index if not exists amd_place_candidates_user_status_idx
  on public.amd_place_candidates(user_id, status, updated_at desc);

alter table public.amd_place_candidates enable row level security;
revoke all on table public.amd_place_candidates from anon;
grant select, insert, update, delete on table public.amd_place_candidates to authenticated;

do $$ begin
  create policy "amd admin place candidates" on public.amd_place_candidates
  for all to authenticated
  using (auth.uid() = user_id and public.amd_is_admin())
  with check (auth.uid() = user_id and public.amd_is_admin());
exception when duplicate_object then null; end $$;
