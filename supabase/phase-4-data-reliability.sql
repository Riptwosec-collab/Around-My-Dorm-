-- Phase 4 Data Reliability & Operations.
-- Live production catalog verified 2026-09-18 before authoring this migration:
-- public.amd_places(id text primary key, record jsonb not null, verified boolean,
--   last_checked timestamptz, last_updated timestamptz not null)
-- public.amd_place_reports(id uuid primary key, place_id text -> amd_places(id), ...)
-- Phase 3 privileged report functions use direct JWT app_metadata.amd_admin checks
-- and reject authenticated anonymous sessions. Phase 4 uses the same boundary.

create extension if not exists pgcrypto;

create table if not exists public.amd_reliability_task_state (
  task_key text primary key,
  task_revision text not null,
  place_id text null references public.amd_places(id) on delete cascade,
  field_name text not null,
  status text not null check (status in ('open','in_review','snoozed','done')),
  snoozed_until timestamptz null,
  assigned_to uuid null,
  last_opened_at timestamptz null,
  note text null check (char_length(coalesce(note, '')) <= 1000),
  updated_at timestamptz not null default now()
);

create index if not exists amd_reliability_task_state_place_idx
  on public.amd_reliability_task_state(place_id, field_name, updated_at desc);

alter table public.amd_reliability_task_state enable row level security;
revoke all on table public.amd_reliability_task_state from public, anon, authenticated;
grant select on table public.amd_reliability_task_state to authenticated;

do $$ begin
  create policy "amd admin read reliability task state"
  on public.amd_reliability_task_state
  for select to authenticated
  using (
    coalesce((((auth.jwt() -> 'app_metadata') ->> 'amd_admin'))::boolean, false)
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );
exception when duplicate_object then null; end $$;

create table if not exists public.amd_place_verification_events (
  id uuid primary key default gen_random_uuid(),
  place_id text not null references public.amd_places(id) on delete cascade,
  field_name text not null check (field_name in ('openingHours','price','phone','parking','location')),
  action text not null check (action in ('verified_unchanged','updated_and_verified','rollback')),
  before_value jsonb null,
  after_value jsonb null,
  before_metadata jsonb not null default '{}'::jsonb,
  after_metadata jsonb not null default '{}'::jsonb,
  source text not null,
  source_url text null,
  note text null check (char_length(coalesce(note, '')) <= 1000),
  linked_report_ids uuid[] not null default '{}'::uuid[],
  verified_by uuid not null,
  created_at timestamptz not null default now(),
  rollback_of uuid null references public.amd_place_verification_events(id) on delete restrict
);

create index if not exists amd_place_verification_events_place_field_idx
  on public.amd_place_verification_events(place_id, field_name, created_at desc);

alter table public.amd_place_verification_events enable row level security;
revoke all on table public.amd_place_verification_events from public, anon, authenticated;

create or replace function public.amd_admin_set_reliability_task_state(
  p_task_key text,
  p_task_revision text,
  p_place_id text,
  p_field_name text,
  p_status text,
  p_snoozed_until timestamptz default null,
  p_note text default null
)
returns public.amd_reliability_task_state
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.amd_reliability_task_state;
  v_is_admin boolean;
begin
  v_is_admin :=
    coalesce((((auth.jwt() -> 'app_metadata') ->> 'amd_admin'))::boolean, false)
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  if not v_is_admin then raise exception 'admin required'; end if;

  if nullif(btrim(coalesce(p_task_key, '')), '') is null
     or nullif(btrim(coalesce(p_task_revision, '')), '') is null then
    raise exception 'task key and revision required';
  end if;
  if p_field_name not in ('openingHours','price','phone','parking','location','reportReview','coverage') then
    raise exception 'invalid reliability field';
  end if;
  if p_status not in ('open','in_review','snoozed','done') then
    raise exception 'invalid reliability task status';
  end if;
  if p_status = 'snoozed' and p_snoozed_until is null then
    raise exception 'snoozed_until required';
  end if;
  if char_length(coalesce(p_note, '')) > 1000 then raise exception 'note too long'; end if;
  if p_place_id is not null and not exists(select 1 from public.amd_places where id = p_place_id) then
    raise exception 'place not found';
  end if;

  insert into public.amd_reliability_task_state(
    task_key, task_revision, place_id, field_name, status,
    snoozed_until, assigned_to, last_opened_at, note, updated_at
  ) values (
    p_task_key, p_task_revision, p_place_id, p_field_name, p_status,
    case when p_status = 'snoozed' then p_snoozed_until else null end,
    auth.uid(), case when p_status = 'in_review' then now() else null end,
    nullif(btrim(coalesce(p_note, '')), ''), now()
  )
  on conflict (task_key) do update set
    task_revision = excluded.task_revision,
    place_id = excluded.place_id,
    field_name = excluded.field_name,
    status = excluded.status,
    snoozed_until = excluded.snoozed_until,
    assigned_to = excluded.assigned_to,
    last_opened_at = case
      when excluded.status = 'in_review' then now()
      else public.amd_reliability_task_state.last_opened_at
    end,
    note = excluded.note,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.amd_admin_set_reliability_task_state(text,text,text,text,text,timestamptz,text) from public, anon;
grant execute on function public.amd_admin_set_reliability_task_state(text,text,text,text,text,timestamptz,text) to authenticated;

create or replace function public.amd_admin_verify_place_field(
  p_place_id text,
  p_field_name text,
  p_new_value jsonb default null,
  p_verify_unchanged boolean default false,
  p_source text default 'manual_verified',
  p_source_url text default null,
  p_note text default null,
  p_linked_report_ids uuid[] default '{}'::uuid[],
  p_report_outcome text default null
)
returns table(place_id text, event_id uuid, record jsonb)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_is_admin boolean;
  v_before_record jsonb;
  v_after_record jsonb;
  v_before_value jsonb := '{}'::jsonb;
  v_after_value jsonb := '{}'::jsonb;
  v_before_metadata jsonb;
  v_after_metadata jsonb;
  v_allowed_keys text[];
  v_timestamp_key text;
  v_key text;
  v_now timestamptz := now();
  v_event_id uuid;
  v_report_ids uuid[];
  v_expected_report_count integer;
  v_found_report_count integer;
  v_provenance jsonb;
  v_field_provenance jsonb;
begin
  v_is_admin :=
    coalesce((((auth.jwt() -> 'app_metadata') ->> 'amd_admin'))::boolean, false)
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  if not v_is_admin then raise exception 'admin required'; end if;

  if p_field_name not in ('openingHours','price','phone','parking','location') then
    raise exception 'invalid field_name';
  end if;
  if p_source not in ('manual_verified','official') then raise exception 'invalid verification source'; end if;
  if p_report_outcome is not null and p_report_outcome not in ('resolved','rejected') then
    raise exception 'invalid report outcome';
  end if;
  if char_length(coalesce(p_note, '')) > 1000 then raise exception 'note too long'; end if;
  if char_length(coalesce(p_source_url, '')) > 2000 then raise exception 'source url too long'; end if;

  if p_verify_unchanged then
    if p_new_value is not null then raise exception 'verify unchanged must not include new value'; end if;
  else
    if p_new_value is null or jsonb_typeof(p_new_value) <> 'object' or p_new_value = '{}'::jsonb then
      raise exception 'new value object required';
    end if;
  end if;

  if p_field_name = 'openingHours' then
    v_allowed_keys := array['openingHours','structuredOpeningHours','openingHoursText','is24Hours','temporaryClosed','permanentlyClosed'];
    v_timestamp_key := 'openingHoursVerifiedAt';
  elsif p_field_name = 'price' then
    v_allowed_keys := array['priceLevel','priceText','averagePricePerPerson','minPrice','maxPrice','pricing'];
    v_timestamp_key := 'priceVerifiedAt';
  elsif p_field_name = 'phone' then
    v_allowed_keys := array['phone'];
    v_timestamp_key := 'phoneVerifiedAt';
  elsif p_field_name = 'parking' then
    v_allowed_keys := array['parking','parkingDetails'];
    v_timestamp_key := 'parkingVerifiedAt';
  else
    v_allowed_keys := array['address','latitude','longitude'];
    v_timestamp_key := 'locationVerifiedAt';
  end if;

  if not p_verify_unchanged and exists (
    select 1 from jsonb_object_keys(p_new_value) as k(key)
    where not (k.key = any(v_allowed_keys))
  ) then
    raise exception 'payload contains unsupported field key';
  end if;

  select p.record into v_before_record
  from public.amd_places p
  where p.id = p_place_id
  for update;
  if v_before_record is null then raise exception 'place not found'; end if;

  select coalesce(array_agg(distinct rid), '{}'::uuid[])
  into v_report_ids
  from unnest(coalesce(p_linked_report_ids, '{}'::uuid[])) rid;
  v_expected_report_count := cardinality(v_report_ids);

  if v_expected_report_count > 0 then
    select count(*)::integer into v_found_report_count
    from public.amd_place_reports r
    where r.id = any(v_report_ids)
      and r.place_id = p_place_id
      and r.status in ('pending','reviewed')
      and (
        r.report_type = 'other'
        or (p_field_name = 'openingHours' and r.report_type in ('opening_hours','closed'))
        or (p_field_name = 'price' and r.report_type = 'price')
        or (p_field_name = 'phone' and r.report_type = 'phone')
        or (p_field_name = 'parking' and r.report_type = 'parking')
        or (p_field_name = 'location' and r.report_type in ('location','moved'))
      );
    if v_found_report_count <> v_expected_report_count then
      raise exception 'linked report does not belong to this place/domain or is already closed';
    end if;
  elsif p_report_outcome is not null then
    raise exception 'report outcome requires linked reports';
  end if;

  foreach v_key in array v_allowed_keys loop
    v_before_value := v_before_value || jsonb_build_object(v_key, v_before_record -> v_key);
  end loop;
  v_before_metadata := jsonb_build_object(
    'verifiedAt', v_before_record -> v_timestamp_key,
    'provenance', coalesce(v_before_record -> 'fieldProvenance' -> p_field_name, 'null'::jsonb)
  );

  v_after_record := v_before_record;
  if not p_verify_unchanged then
    for v_key in select jsonb_object_keys(p_new_value) loop
      v_after_record := jsonb_set(v_after_record, array[v_key], p_new_value -> v_key, true);
    end loop;
  end if;

  v_field_provenance := coalesce(v_after_record -> 'fieldProvenance', '{}'::jsonb);
  if jsonb_typeof(v_field_provenance) <> 'object' then v_field_provenance := '{}'::jsonb; end if;
  v_after_record := jsonb_set(v_after_record, '{fieldProvenance}', v_field_provenance, true);
  v_provenance := jsonb_build_object(
    'source', p_source,
    'checkedAt', v_now,
    'verifiedAt', v_now,
    'confidence', case when p_source = 'manual_verified' then 'verified' else 'high' end,
    'sourceUrl', nullif(btrim(coalesce(p_source_url, '')), '')
  );
  v_after_record := jsonb_set(v_after_record, array['fieldProvenance', p_field_name], v_provenance, true);
  v_after_record := jsonb_set(v_after_record, array[v_timestamp_key], to_jsonb(v_now), true);
  v_after_record := jsonb_set(v_after_record, '{lastChecked}', to_jsonb(v_now), true);
  v_after_record := jsonb_set(v_after_record, '{lastUpdated}', to_jsonb(v_now), true);

  foreach v_key in array v_allowed_keys loop
    v_after_value := v_after_value || jsonb_build_object(v_key, v_after_record -> v_key);
  end loop;
  v_after_metadata := jsonb_build_object(
    'verifiedAt', v_after_record -> v_timestamp_key,
    'provenance', v_after_record -> 'fieldProvenance' -> p_field_name
  );

  update public.amd_places
  set record = v_after_record,
      last_checked = v_now,
      last_updated = v_now
  where id = p_place_id;

  insert into public.amd_place_verification_events(
    place_id, field_name, action, before_value, after_value,
    before_metadata, after_metadata, source, source_url, note,
    linked_report_ids, verified_by, created_at
  ) values (
    p_place_id, p_field_name,
    case when p_verify_unchanged then 'verified_unchanged' else 'updated_and_verified' end,
    v_before_value, v_after_value, v_before_metadata, v_after_metadata,
    p_source, nullif(btrim(coalesce(p_source_url, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''), v_report_ids, auth.uid(), v_now
  ) returning id into v_event_id;

  if p_report_outcome is not null then
    update public.amd_place_reports
    set status = p_report_outcome,
        reviewed_at = coalesce(reviewed_at, v_now),
        resolved_at = v_now,
        reviewed_by = auth.uid(),
        resolution_note = nullif(btrim(coalesce(p_note, '')), '')
    where id = any(v_report_ids);
  end if;

  return query select p_place_id, v_event_id, v_after_record;
end;
$$;

revoke all on function public.amd_admin_verify_place_field(text,text,jsonb,boolean,text,text,text,uuid[],text) from public, anon;
grant execute on function public.amd_admin_verify_place_field(text,text,jsonb,boolean,text,text,text,uuid[],text) to authenticated;

create or replace function public.amd_admin_rollback_place_verification(
  p_event_id uuid,
  p_note text default null
)
returns table(place_id text, event_id uuid, record jsonb)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_is_admin boolean;
  v_event public.amd_place_verification_events;
  v_latest_id uuid;
  v_before_record jsonb;
  v_after_record jsonb;
  v_current_value jsonb := '{}'::jsonb;
  v_current_metadata jsonb;
  v_allowed_keys text[];
  v_timestamp_key text;
  v_key text;
  v_now timestamptz := now();
  v_new_event_id uuid;
  v_restored_provenance jsonb;
  v_field_provenance jsonb;
begin
  v_is_admin :=
    coalesce((((auth.jwt() -> 'app_metadata') ->> 'amd_admin'))::boolean, false)
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  if not v_is_admin then raise exception 'admin required'; end if;
  if char_length(coalesce(p_note, '')) > 1000 then raise exception 'note too long'; end if;

  select * into v_event
  from public.amd_place_verification_events
  where id = p_event_id;
  if v_event.id is null then raise exception 'verification event not found'; end if;
  if v_event.action not in ('verified_unchanged','updated_and_verified') then
    raise exception 'rollback event is not rollback eligible';
  end if;

  select e.id into v_latest_id
  from public.amd_place_verification_events e
  where e.place_id = v_event.place_id and e.field_name = v_event.field_name
  order by e.created_at desc, e.id desc
  limit 1;
  if v_latest_id is distinct from v_event.id then
    raise exception 'newer verification exists';
  end if;

  select p.record into v_before_record
  from public.amd_places p
  where p.id = v_event.place_id
  for update;
  if v_before_record is null then raise exception 'place not found'; end if;

  if v_event.field_name = 'openingHours' then
    v_allowed_keys := array['openingHours','structuredOpeningHours','openingHoursText','is24Hours','temporaryClosed','permanentlyClosed'];
    v_timestamp_key := 'openingHoursVerifiedAt';
  elsif v_event.field_name = 'price' then
    v_allowed_keys := array['priceLevel','priceText','averagePricePerPerson','minPrice','maxPrice','pricing'];
    v_timestamp_key := 'priceVerifiedAt';
  elsif v_event.field_name = 'phone' then
    v_allowed_keys := array['phone'];
    v_timestamp_key := 'phoneVerifiedAt';
  elsif v_event.field_name = 'parking' then
    v_allowed_keys := array['parking','parkingDetails'];
    v_timestamp_key := 'parkingVerifiedAt';
  else
    v_allowed_keys := array['address','latitude','longitude'];
    v_timestamp_key := 'locationVerifiedAt';
  end if;

  foreach v_key in array v_allowed_keys loop
    v_current_value := v_current_value || jsonb_build_object(v_key, v_before_record -> v_key);
  end loop;
  v_current_metadata := jsonb_build_object(
    'verifiedAt', v_before_record -> v_timestamp_key,
    'provenance', coalesce(v_before_record -> 'fieldProvenance' -> v_event.field_name, 'null'::jsonb)
  );

  v_after_record := v_before_record;
  foreach v_key in array v_allowed_keys loop
    v_after_record := jsonb_set(v_after_record, array[v_key], coalesce(v_event.before_value -> v_key, 'null'::jsonb), true);
  end loop;

  v_after_record := jsonb_set(
    v_after_record,
    array[v_timestamp_key],
    coalesce(v_event.before_metadata -> 'verifiedAt', 'null'::jsonb),
    true
  );

  v_field_provenance := coalesce(v_after_record -> 'fieldProvenance', '{}'::jsonb);
  if jsonb_typeof(v_field_provenance) <> 'object' then v_field_provenance := '{}'::jsonb; end if;
  v_restored_provenance := v_event.before_metadata -> 'provenance';
  if v_restored_provenance is null or v_restored_provenance = 'null'::jsonb then
    v_field_provenance := v_field_provenance - v_event.field_name;
  else
    v_field_provenance := jsonb_set(v_field_provenance, array[v_event.field_name], v_restored_provenance, true);
  end if;
  v_after_record := jsonb_set(v_after_record, '{fieldProvenance}', v_field_provenance, true);
  v_after_record := jsonb_set(v_after_record, '{lastChecked}', to_jsonb(v_now), true);
  v_after_record := jsonb_set(v_after_record, '{lastUpdated}', to_jsonb(v_now), true);

  update public.amd_places
  set record = v_after_record,
      last_checked = v_now,
      last_updated = v_now
  where id = v_event.place_id;

  insert into public.amd_place_verification_events(
    place_id, field_name, action, before_value, after_value,
    before_metadata, after_metadata, source, source_url, note,
    linked_report_ids, verified_by, created_at, rollback_of
  ) values (
    v_event.place_id, v_event.field_name, 'rollback',
    v_current_value, v_event.before_value,
    v_current_metadata, v_event.before_metadata,
    'manual_verified', null,
    nullif(btrim(coalesce(p_note, '')), ''), '{}'::uuid[], auth.uid(), v_now, v_event.id
  ) returning id into v_new_event_id;

  return query select v_event.place_id, v_new_event_id, v_after_record;
end;
$$;

revoke all on function public.amd_admin_rollback_place_verification(uuid,text) from public, anon;
grant execute on function public.amd_admin_rollback_place_verification(uuid,text) to authenticated;

create or replace function public.amd_admin_place_verification_history(p_place_id text)
returns table(
  id uuid,
  place_id text,
  field_name text,
  action text,
  before_value jsonb,
  after_value jsonb,
  before_metadata jsonb,
  after_metadata jsonb,
  source text,
  source_url text,
  note text,
  linked_report_ids uuid[],
  verified_by uuid,
  created_at timestamptz,
  rollback_of uuid,
  rollback_eligible boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_is_admin boolean;
begin
  v_is_admin :=
    coalesce((((auth.jwt() -> 'app_metadata') ->> 'amd_admin'))::boolean, false)
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
  if not v_is_admin then raise exception 'admin required'; end if;

  return query
  select
    e.id, e.place_id, e.field_name, e.action,
    e.before_value, e.after_value, e.before_metadata, e.after_metadata,
    e.source, e.source_url, e.note, e.linked_report_ids,
    e.verified_by, e.created_at, e.rollback_of,
    (
      e.action in ('verified_unchanged','updated_and_verified')
      and e.id = (
        select e2.id
        from public.amd_place_verification_events e2
        where e2.place_id = e.place_id and e2.field_name = e.field_name
        order by e2.created_at desc, e2.id desc
        limit 1
      )
    ) as rollback_eligible
  from public.amd_place_verification_events e
  where e.place_id = p_place_id
  order by e.created_at desc, e.id desc;
end;
$$;

revoke all on function public.amd_admin_place_verification_history(text) from public, anon;
grant execute on function public.amd_admin_place_verification_history(text) to authenticated;
