-- App-tracked Google API monthly usage summary.
-- This estimates app requests only; it is not Google's official billing meter.

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
