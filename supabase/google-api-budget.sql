-- App-tracked Google API monthly usage summary.
-- This estimates app requests only; it is not Google's official billing meter.
-- The summary is project-wide because every app session consumes the same
-- Google Maps Platform project/API-key budget. Raw request logs remain RLS-scoped.

create index if not exists amd_google_request_logs_user_time_idx
  on public.amd_google_request_logs(user_id, occurred_at desc);
create index if not exists amd_google_request_logs_type_time_idx
  on public.amd_google_request_logs(request_type, occurred_at desc);

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
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null or not exists (
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
  ) then
    raise exception 'Around My Dorm admin authentication is required'
      using errcode = '42501';
  end if;

  return query
  with bounds as (
    select
      date_trunc('month', timezone('Asia/Bangkok', now())) at time zone 'Asia/Bangkok' as start_at,
      (date_trunc('month', timezone('Asia/Bangkok', now())) + interval '1 month') at time zone 'Asia/Bangkok' as end_at
  )
  select
    b.start_at,
    b.end_at,
    coalesce(sum(greatest(coalesce(l.attempted, 0), 0)), 0)::bigint,
    coalesce(sum(greatest(coalesce(l.attempted, 0), 0)) filter (where l.request_type = 'dynamic_map'), 0)::bigint,
    coalesce(sum(greatest(coalesce(l.attempted, 0), 0)) filter (where l.request_type = 'place_details'), 0)::bigint,
    coalesce(sum(greatest(coalesce(l.attempted, 0), 0)) filter (where l.request_type = 'text_search'), 0)::bigint,
    coalesce(sum(greatest(coalesce(l.attempted, 0), 0)) filter (where l.request_type = 'geocoding'), 0)::bigint,
    coalesce(sum(greatest(coalesce(l.attempted, 0), 0)) filter (where l.request_type = 'routes'), 0)::bigint,
    coalesce(sum(greatest(coalesce(l.attempted, 0), 0)) filter (where l.request_type = 'street_view'), 0)::bigint,
    coalesce(sum(greatest(coalesce(l.attempted, 0), 0)) filter (where l.request_type = 'place_photo'), 0)::bigint,
    coalesce(sum(greatest(coalesce(l.attempted, 0), 0)) filter (where l.request_type not in ('dynamic_map','place_details','text_search','geocoding','routes','street_view','place_photo')), 0)::bigint,
    count(*) filter (where l.status = 'failed')::bigint,
    coalesce(sum(greatest(coalesce(l.retry_count, 0), 0)), 0)::bigint,
    max(l.occurred_at)
  from bounds b
  left join public.amd_google_request_logs l
    on l.occurred_at >= b.start_at
   and l.occurred_at < b.end_at
  group by b.start_at, b.end_at;
end;
$$;

revoke all on function public.amd_google_usage_summary() from public, anon;
grant execute on function public.amd_google_usage_summary() to authenticated;
