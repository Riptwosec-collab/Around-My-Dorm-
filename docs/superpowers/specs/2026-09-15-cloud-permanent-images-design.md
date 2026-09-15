# Cloud Permanent Images Design

Date: 2026-09-15
Project: Around My Dorm
Status: Approved direction; written spec pending final user review before implementation

## Goal

Make permanent place images survive refreshes, browser restarts, and other devices by loading them from Supabase Cloud without calling Google Places again.

The permanent-image path is limited to images the project has the right to store and redistribute, such as user/admin uploads or explicitly licensed/approved imports. Google Places photo bytes, Google photo URIs, and Google photo resource names must remain runtime-only and must not be copied into Supabase Storage.

## Existing behavior

The current app already has a `PlaceImage` model and a shared image-selection pipeline. `PlacePhoto` first renders persisted candidates and only falls back to Google runtime photos when no persisted candidate exists. Google runtime photos are stored in an in-memory `Map`, so they disappear after refresh or restart.

The repository also already contains a relational `place_images` concept and `place_sources.can_persist_photos`, but the production canonical dataset is the `amd_places` cloud dataset. The implementation therefore adds a production-specific permanent-image registry instead of coupling the live app to the legacy `places` table.

## Architecture

### 1. Supabase Storage

Create a dedicated bucket named `amd-place-images`.

Stored object path format:

`<place_id>/<uuid>.<extension>`

The bucket is public-read because the app itself is public and the goal is zero extra image-signing requests during normal browsing. Upload, replace, and delete operations are admin-only.

Allowed media types are JPEG, PNG, WebP, and AVIF. The client must enforce a size limit before upload; the default implementation target is 8 MB per file.

### 2. Permanent image registry

Create `public.amd_place_images` with one row per permanent cloud image.

Fields:

- `id uuid primary key default gen_random_uuid()`
- `place_id text not null references public.amd_places(id) on delete cascade`
- `storage_bucket text not null default 'amd-place-images'`
- `storage_path text not null unique`
- `source_kind text not null` with allowed values `user_upload`, `admin_upload`, `licensed_import`
- `source_url text null`
- `attribution text null`
- `rights_basis text not null`
- `mime_type text not null`
- `byte_size bigint null`
- `width integer null`
- `height integer null`
- `is_cover boolean not null default false`
- `status text not null default 'active'` with allowed values `active`, `archived`
- `created_by uuid null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Only one active cover image is allowed per place. Setting a new cover clears the previous cover flag in the same logical operation.

### 3. Security model

Read access to active image rows and public bucket objects is available to normal app users.

Write access is restricted to the same admin identity used by the current admin UI. Database and Storage policies must validate the authenticated JWT rather than trusting a client-side flag. The implementation will use a database helper predicate that accepts the configured admin identity and rejects anonymous sessions.

The client must never accept `google_places` as a permanent `source_kind`. The permanent uploader/importer also rejects Google-hosted runtime photo URLs and Google photo resource identifiers.

### 4. Client data layer

Add a focused module, `lib/cloud/place-images.ts`, responsible for:

- listing active permanent images for all loaded place IDs
- uploading a rights-cleared image to Supabase Storage
- inserting the registry row after successful upload
- setting/replacing a cover image
- archiving/deleting an image
- translating a registry row into a `PlaceImage`

`PlaceImage.source` will gain a cloud-owned source value so the app can rank permanent cloud images above runtime Google fallback images without pretending the image came from Google.

### 5. Loading and merge behavior

`loadPlacesFromDatabase()` will load canonical `amd_places` and the active `amd_place_images` rows in the same database-load cycle.

For each place, permanent Cloud images are merged into `imageMetadata` before the place reaches the UI.

Image priority becomes:

1. active Cloud cover image
2. other active Cloud permanent images
3. existing persisted canonical/seed/official images
4. Google runtime image for the current session
5. category fallback artwork

Opening or refreshing the app must not call Google Places merely to restore permanent images. Supabase is the only network source needed for those images.

### 6. Admin UX

Extend the existing admin photo control with a `Cloud Permanent Images` section.

For each place, the admin can:

- upload a local image file
- mark it as cover
- enter optional attribution/source URL
- choose or enter a rights basis
- replace the cover
- archive/delete a Cloud image

When the currently displayed image is a Google runtime image, the UI must clearly state that it is temporary and cannot be copied into permanent Cloud storage. The permanent action requires a rights-cleared file or explicitly approved import source.

The control shows counts for:

- permanent Cloud images
- places with a permanent Cloud cover
- Google runtime-only images
- places with no usable image

### 7. Data integrity and failure handling

Upload flow is transactional at the application level:

1. validate file and rights metadata
2. upload object to Storage
3. insert registry row
4. if row insertion fails, delete the just-uploaded object as compensation
5. refresh the place image registry

Delete flow removes the registry row or archives it first, then removes the Storage object. If object deletion fails, the row remains archived so the public UI does not reference a broken object.

A missing Storage object must not break a place card; `PlacePhoto` continues to the next candidate and ultimately the existing fallback artwork.

### 8. Migration and compatibility

Do not automatically copy or re-host existing Google Places photos.

Existing canonical image URLs remain supported unchanged. Existing runtime Google behavior remains available as a fallback for places that have no permanent Cloud image.

No destructive migration of `amd_places.record` is required. The registry is additive and can be rolled back by disabling its loader and leaving existing canonical data untouched.

### 9. Tests

Implementation follows TDD. Required behavior tests include:

- Cloud permanent image is ranked before Google runtime fallback
- permanent registry rows merge into the correct place
- Google-sourced runtime content is rejected by the permanent-save guard
- upload failure does not create a registry row
- registry insertion failure removes the uploaded object
- app startup with permanent Cloud images performs no Google photo request
- broken Cloud image falls through to the next candidate
- only admin sessions can create, update, or delete registry rows/objects
- reopening the app produces the same Cloud image candidate from Supabase data

### 10. Verification and rollout

Rollout order:

1. apply database table, indexes, and RLS policies
2. create/configure the `amd-place-images` bucket and Storage policies
3. ship the client data layer and merge logic
4. ship admin upload/manage UI
5. upload one rights-cleared test image for a real place
6. close and reopen the app
7. verify the image still renders from the Supabase URL
8. verify Google photo request logs did not increase during the reopen test
9. run unit tests, type check, production build, and Cloudflare bundle validation

Success criteria: once a rights-cleared image has been saved as a permanent Cloud image, reopening the app or using another device renders that image from Supabase without a Google Places photo request.
