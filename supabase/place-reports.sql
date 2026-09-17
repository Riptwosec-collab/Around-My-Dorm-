-- Phase 3 Decision Intelligence: public place reports and Admin review queue.
-- Public/anonymous browser sessions submit through RPC only. The table itself
-- remains unreadable/unwritable to normal users.

create extension if not exists pgcrypto;

create table if not exists public.amd_place_reports (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references public.places(id) on delete cascade,
  report_type text not null check (report_type in ('closed','opening_hours','price','moved','parking','phone','location','other')),
  message text null check (char_length(coalesce(message, '')) <= 500),
  status text not null default 'pending' check (status in ('pending','reviewed','resolved','rejected')),
  reporter_fingerprint text not null,
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  resolved_at timestamptz null,
  reviewed_by uuid null,
  resolution_note text null check (char_length(coalesce(resolution_note, '')) <= 1000)
);

create index if not exists amd_place_reports_place_status_idx
  on public.amd_place_reports(place_id, status, created_at desc);
create index if not exists amd_place_reports_reporter_created_idx
  on public.amd_place_reports(reporter_fingerprint, created_at desc);

alter table public.amd_place_reports enable row level security;
revoke all on table public.amd_place_reports from public, anon;
grant select on table public.amd_place_reports to authenticated;

do $$ begin
  create policy "amd admin read place reports" on public.amd_place_reports
  for select to authenticated
  using (public.amd_is_admin());
exception when duplicate_object then null; end $$;

create or replace function public.amd_submit_place_report(
  p_place_id text,
  p_report_type text,
  p_message text default null,
  p_reporter_fingerprint text default null
)
returns table(status text, report_id uuid)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_reporter text;
  v_existing uuid;
  v_message text;
  v_count_10m integer;
  v_count_24h integer;
begin
  if auth.uid() is null then
    raise exception 'authenticated anonymous session required';
  end if;

  if p_place_id is null or not exists(select 1 from public.places where id = p_place_id) then
    raise exception 'invalid place_id';
  end if;

  if p_report_type is null or p_report_type not in ('closed','opening_hours','price','moved','parking','phone','location','other') then
    raise exception 'invalid report_type';
  end if;

  v_message := nullif(btrim(coalesce(p_message, '')), '');
  if char_length(coalesce(v_message, '')) > 500 then
    raise exception 'message too long';
  end if;

  -- Mix the authenticated anonymous/user id with the client reporting token so
  -- a caller cannot evade rate limits merely by choosing a new fingerprint.
  v_reporter := encode(
    digest(auth.uid()::text || ':' || coalesce(nullif(p_reporter_fingerprint, ''), 'no-client-token'), 'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtext(v_reporter));

  select id into v_existing
  from public.amd_place_reports
  where reporter_fingerprint = v_reporter
    and place_id = p_place_id
    and report_type = p_report_type
    and created_at >= now() - interval '24 hours'
  order by created_at desc
  limit 1;

  if v_existing is not null then
    update public.amd_place_reports
      set duplicate_count = duplicate_count + 1
      where id = v_existing;
    return query select 'duplicate'::text, v_existing;
    return;
  end if;

  select count(*)::integer into v_count_10m
  from public.amd_place_reports
  where reporter_fingerprint = v_reporter
    and created_at >= now() - interval '10 minutes';

  select count(*)::integer into v_count_24h
  from public.amd_place_reports
  where reporter_fingerprint = v_reporter
    and created_at >= now() - interval '24 hours';

  if v_count_10m >= 5 or v_count_24h >= 20 then
    return query select 'rate_limited'::text, null::uuid;
    return;
  end if;

  insert into public.amd_place_reports(place_id, report_type, message, reporter_fingerprint)
  values (p_place_id, p_report_type, v_message, v_reporter)
  returning id into v_existing;

  return query select 'accepted'::text, v_existing;
end;
$$;

revoke all on function public.amd_submit_place_report(text,text,text,text) from public, anon;
grant execute on function public.amd_submit_place_report(text,text,text,text) to authenticated;

create or replace function public.amd_place_report_warning(p_place_id text)
returns table(report_type text, report_count bigint)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select r.report_type, count(*)::bigint as report_count
  from public.amd_place_reports r
  where r.place_id = p_place_id
    and r.status in ('pending','reviewed')
  group by r.report_type
  order by count(*) desc, r.report_type asc;
$$;

revoke all on function public.amd_place_report_warning(text) from public, anon;
grant execute on function public.amd_place_report_warning(text) to authenticated;

create or replace function public.amd_admin_transition_place_report(
  p_report_id uuid,
  p_status text,
  p_resolution_note text default null
)
returns public.amd_place_reports
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_report public.amd_place_reports;
begin
  if not public.amd_is_admin() then
    raise exception 'admin required';
  end if;

  if p_status not in ('reviewed','resolved','rejected') then
    raise exception 'invalid status transition';
  end if;

  if char_length(coalesce(p_resolution_note, '')) > 1000 then
    raise exception 'resolution note too long';
  end if;

  update public.amd_place_reports
  set status = p_status,
      reviewed_at = case when p_status in ('reviewed','resolved','rejected') then coalesce(reviewed_at, now()) else reviewed_at end,
      resolved_at = case when p_status in ('resolved','rejected') then now() else null end,
      reviewed_by = auth.uid(),
      resolution_note = nullif(btrim(coalesce(p_resolution_note, '')), '')
  where id = p_report_id
  returning * into v_report;

  if v_report.id is null then
    raise exception 'report not found';
  end if;

  return v_report;
end;
$$;

revoke all on function public.amd_admin_transition_place_report(uuid,text,text) from public, anon;
grant execute on function public.amd_admin_transition_place_report(uuid,text,text) to authenticated;
