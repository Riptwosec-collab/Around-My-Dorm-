-- Shared Admin Notes for Around My Dorm.
-- Public browsing continues to read amd_places.record through the existing SELECT policy.
-- Permanent note writes are restricted to authenticated admins and only mutate record.notes.

create or replace function public.amd_set_admin_note(p_place_id text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claims jsonb := auth.jwt();
  v_is_admin boolean := false;
  v_note text;
  v_record jsonb;
  v_updated_at timestamptz := now();
begin
  if auth.uid() is null or coalesce((v_claims ->> 'is_anonymous')::boolean, false) then
    raise exception 'Admin authentication is required' using errcode = '42501';
  end if;

  v_is_admin :=
    coalesce((v_claims -> 'app_metadata' ->> 'amd_admin')::boolean, false)
    or lower(coalesce(v_claims ->> 'email', '')) = 'misuki2803@gmail.com';

  if not v_is_admin then
    raise exception 'This account is not authorized as an Around My Dorm admin' using errcode = '42501';
  end if;

  if p_place_id is null or btrim(p_place_id) = '' then
    raise exception 'Place id is required' using errcode = '22023';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Admin note must be 500 characters or fewer' using errcode = '22023';
  end if;

  select record
  into v_record
  from public.amd_places
  where id = btrim(p_place_id)
  for update;

  if not found then
    raise exception 'Place not found' using errcode = 'P0002';
  end if;

  v_record := jsonb_set(
    coalesce(v_record, '{}'::jsonb),
    '{notes}',
    case when v_note is null then 'null'::jsonb else to_jsonb(v_note) end,
    true
  );
  v_record := jsonb_set(v_record, '{lastUpdated}', to_jsonb(v_updated_at), true);

  update public.amd_places
  set record = v_record,
      last_updated = v_updated_at
  where id = btrim(p_place_id);

  return jsonb_build_object(
    'placeId', btrim(p_place_id),
    'note', v_note,
    'updatedAt', v_updated_at
  );
end;
$$;

revoke execute on function public.amd_set_admin_note(text, text) from public;
revoke execute on function public.amd_set_admin_note(text, text) from anon;
grant execute on function public.amd_set_admin_note(text, text) to authenticated;

comment on function public.amd_set_admin_note(text, text) is
  'Admin-only shared note update. Mutates only amd_places.record.notes and lastUpdated metadata.';
