-- Around My Dorm permanent Cloud image registry + Storage policies.
-- Additive migration. Existing legacy amd_place_images rows remain readable when active.

alter table public.amd_place_images
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists rights_basis text,
  add column if not exists mime_type text,
  add column if not exists byte_size bigint,
  add column if not exists is_cover boolean not null default false,
  add column if not exists status text not null default 'active',
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz not null default now();

alter table public.amd_place_images drop constraint if exists amd_place_images_status_check;
alter table public.amd_place_images add constraint amd_place_images_status_check
  check (status in ('active','archived'));

alter table public.amd_place_images drop constraint if exists amd_place_images_permanent_source_check;
alter table public.amd_place_images add constraint amd_place_images_permanent_source_check
  check (
    storage_path is null
    or (
      storage_bucket = 'amd-place-images'
      and source in ('user_upload','admin_upload','licensed_import')
      and nullif(btrim(rights_basis), '') is not null
    )
  );

alter table public.amd_place_images drop constraint if exists amd_place_images_byte_size_check;
alter table public.amd_place_images add constraint amd_place_images_byte_size_check
  check (byte_size is null or byte_size between 0 and 8388608);

alter table public.amd_place_images drop constraint if exists amd_place_images_mime_type_check;
alter table public.amd_place_images add constraint amd_place_images_mime_type_check
  check (mime_type is null or mime_type in ('image/jpeg','image/png','image/webp','image/avif'));

create unique index if not exists amd_place_images_storage_path_uidx
  on public.amd_place_images(storage_path)
  where storage_path is not null;

create unique index if not exists amd_place_images_active_cover_uidx
  on public.amd_place_images(place_id)
  where is_cover = true and status = 'active';

create index if not exists amd_place_images_place_status_idx
  on public.amd_place_images(place_id, status, is_cover desc, created_at desc);

alter table public.amd_place_images enable row level security;
revoke all on table public.amd_place_images from anon, authenticated;
grant select on table public.amd_place_images to anon, authenticated;
grant insert, update, delete on table public.amd_place_images to authenticated;

drop policy if exists "amd public read images" on public.amd_place_images;
drop policy if exists "amd public read active images" on public.amd_place_images;
drop policy if exists "amd admin insert images" on public.amd_place_images;
drop policy if exists "amd admin update images" on public.amd_place_images;
drop policy if exists "amd admin delete images" on public.amd_place_images;

create policy "amd public read active images"
  on public.amd_place_images for select to anon, authenticated
  using (status = 'active');

create policy "amd admin insert images"
  on public.amd_place_images for insert to authenticated
  with check (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    and status = 'active'
    and storage_bucket = 'amd-place-images'
    and storage_path is not null
    and source in ('user_upload','admin_upload','licensed_import')
    and nullif(btrim(rights_basis), '') is not null
    and created_by = auth.uid()
  );

create policy "amd admin update images"
  on public.amd_place_images for update to authenticated
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  )
  with check (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
    and (
      storage_path is null
      or (
        storage_bucket = 'amd-place-images'
        and source in ('user_upload','admin_upload','licensed_import')
        and nullif(btrim(rights_basis), '') is not null
      )
    )
  );

create policy "amd admin delete images"
  on public.amd_place_images for delete to authenticated
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'amd-place-images',
  'amd-place-images',
  true,
  8388608,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "amd public read place image objects" on storage.objects;
drop policy if exists "amd admin insert place image objects" on storage.objects;
drop policy if exists "amd admin update place image objects" on storage.objects;
drop policy if exists "amd admin delete place image objects" on storage.objects;

create policy "amd public read place image objects"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'amd-place-images');

create policy "amd admin insert place image objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'amd-place-images'
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );

create policy "amd admin update place image objects"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'amd-place-images'
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  )
  with check (
    bucket_id = 'amd-place-images'
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );

create policy "amd admin delete place image objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'amd-place-images'
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );

create or replace function public.amd_set_place_image_cover(p_image_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_place_id text;
begin
  if not (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
    and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  ) then
    raise exception 'Around My Dorm admin authentication is required'
      using errcode = '42501';
  end if;

  select place_id
    into v_place_id
    from public.amd_place_images
   where id = p_image_id
     and status = 'active'
   for update;

  if v_place_id is null then
    raise exception 'Active place image not found'
      using errcode = 'P0002';
  end if;

  update public.amd_place_images
     set is_cover = false,
         updated_at = now()
   where place_id = v_place_id
     and status = 'active'
     and is_cover = true;

  update public.amd_place_images
     set is_cover = true,
         updated_at = now()
   where id = p_image_id
     and status = 'active';
end;
$$;

revoke all on function public.amd_set_place_image_cover(uuid) from public, anon;
grant execute on function public.amd_set_place_image_cover(uuid) to authenticated;
