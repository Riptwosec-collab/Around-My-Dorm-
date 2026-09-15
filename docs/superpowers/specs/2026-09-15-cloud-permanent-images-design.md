# Cloud Permanent Images Design

Date: 2026-09-15
Project: Around My Dorm
Status: Approved direction; written spec pending final user review before implementation

## Goal

Make permanent place images survive refreshes, browser restarts, and other devices by loading them from Supabase Cloud without calling Google Places again.

The permanent-image path is limited to images the project has the right to store and redistribute, such as user/admin uploads or explicitly licensed/approved imports. Google Places photo bytes, Google photo URIs, and Google photo resource names must remain runtime-only and must not be copied into Supabase Storage.

## Existing behavior and live state

The current app already has a `PlaceImage` model and a shared image-selection pipeline. `PlacePhoto` first renders persisted candidates and only falls back to Google runtime photos when no persisted candidate exists. Google runtime photos are stored in an in-memory `Map`, so they disappear after refresh or restart.

The live Supabase project already has `public.amd_place_images`. It currently has zero rows and a public read policy for `anon` and `authenticated`. Its existing columns are `id`, `place_id`, `source`, `source_reference`, `source_url`, `attribution`, `width`, `height`, `verified`, `last_checked`, and `created_at`.

The live admin account already carries `app_metadata.amd_admin = true`, so database and Storage write policies can use that server-issued JWT claim instead of trusting the browser allowlist.

The project does not yet have an Around My Dorm image Storage bucket.

## Architecture

### 1. Supabase Storage

Create a dedicated bucket named `amd-place-images`.

Stored object path format:

`<place_id>/<uuid>.<extension>`

The bucket is public-read because the app itself is public and the goal is zero image-signing requests during normal browsing. Upload, replace, and delete operations are admin-only.

Allowed media types are JPEG, PNG, WebP, and AVIF. The bucket and client both enforce an 8 MB maximum file size.

### 2. Extend the existing permanent image registry

Do not create a second registry table. Extend `public.amd_place_images` so the live app uses the table that already exists.

Keep all current columns and add:

- `storage_bucket text null`
- `storage_path text null`
- `rights_basis text null`
- `mime_type text null`
- `byte_size bigint null`
- `is_cover boolean not null default false`
- `status text not null default 'active'` with allowed values `active`, `archived`
- `created_by uuid null`
- `updated_at timestamptz not null default now()`

For new permanent Cloud rows:

- `storage_bucket` is `amd-place-images`
- `storage_path` is required and unique
- `source` is one of `user_upload`, `admin_upload`, or `licensed_import`
- `rights_basis` is required
- `verified` is true only after the upload and registry insert both succeed

Legacy-compatible rows without `storage_path` remain readable, so the migration is additive.

Only one active cover image is allowed per place. A partial unique index on `(place_id)` where `is_cover = true and status = 'active'` enforces that invariant.

### 3. Security model

Read access to active image rows and public bucket objects remains available to normal app users.

Write access is restricted by JWT claim:

`app_metadata.amd_admin = true`

Database and Storage policies must evaluate the authenticated JWT directly. Anonymous sessions and ordinary authenticated sessions cannot upload, update, or delete permanent images.

The browser email allowlist remains a UI convenience only; it is not the authorization boundary for Cloud writes.

The permanent uploader/importer must reject:

- `source = google_places`
- Google Places runtime photo URLs
- Google photo resource names/references
- files without an explicit `rights_basis`

### 4. Client data layer

Add a focused module, `lib/cloud/place-images.ts`, responsible for:

- listing active permanent images for loaded place IDs
- uploading a rights-cleared image to `amd-place-images`
- inserting the `amd_place_images` registry row after successful upload
- setting/replacing a cover image
- archiving/deleting an image
- translating a registry row into a `PlaceImage`
- compensating for partial failures

`PlaceImage.source` gains a Cloud-owned value, `cloud_storage`, so the app can rank permanent Cloud images without pretending they came from Google.

The registry row keeps the original provenance in `amd_place_images.source` (`user_upload`, `admin_upload`, or `licensed_import`), while the UI-facing `PlaceImage.source` is `cloud_storage`.

### 5. Loading and merge behavior

`loadPlacesFromDatabase()` will load canonical `amd_places` and active `amd_place_images` rows in the same database-load cycle.

For each place, permanent Cloud images are converted to public Supabase object URLs and merged into `imageMetadata` before the place reaches the UI.

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
- enter optional attribution and source URL
- enter a required rights basis
- replace the cover
- archive/delete a Cloud image

When the currently displayed image is a Google runtime image, the UI clearly states that it is temporary and cannot be copied into permanent Cloud storage. The permanent action requires a rights-cleared file or explicitly approved import source.

The control shows counts for:

- permanent Cloud images
- places with a permanent Cloud cover
- Google runtime-only images
- places with no usable image

### 7. Data integrity and failure handling

Upload flow is transactional at the application level:

1. validate file, source, MIME type, size, and rights metadata
2. upload object to Storage
3. insert registry row
4. if row insertion fails, delete the just-uploaded object as compensation
5. refresh the permanent image registry

Cover replacement first clears the existing active cover flag and then marks the new row as cover within one database operation/RPC so the unique-cover invariant is never temporarily violated.

Delete flow archives the registry row first, then removes the Storage object. If object deletion fails, the row stays archived so the public UI does not reference a broken object.

A missing or broken Storage object must not break a place card; `PlacePhoto` continues to the next candidate and ultimately the existing fallback artwork.

### 8. Migration and compatibility

Do not automatically copy or re-host existing Google Places photos.

Existing canonical image URLs remain supported unchanged. Existing runtime Google behavior remains available as a fallback for places that have no permanent Cloud image.

No destructive migration of `amd_places.record` is required. The existing `amd_place_images` registry is extended in place, and the loader is additive.

### 9. Tests

Implementation follows TDD. Required behavior tests include:

- Cloud permanent image is ranked before Google runtime fallback
- permanent registry rows merge into the correct place
- Google-sourced runtime content is rejected by the permanent-save guard
- upload failure does not create a registry row
- registry insertion failure removes the uploaded object
- cover replacement preserves the one-active-cover invariant
- app startup with permanent Cloud images performs no Google photo request
- broken Cloud image falls through to the next candidate
- non-admin sessions cannot create, update, or delete registry rows/objects
- reopening the app produces the same Cloud image candidate from Supabase data

### 10. Verification and rollout

Rollout order:

1. extend `amd_place_images`, add indexes/RLS write policies, and create the cover RPC
2. create/configure the `amd-place-images` bucket and Storage policies
3. ship the client data layer and merge logic
4. ship admin upload/manage UI
5. upload one rights-cleared test image for a real place
6. close and reopen the app
7. verify the image still renders from the Supabase public object URL
8. verify Google photo request logs did not increase during the reopen test
9. run unit tests, type check, production build, and Cloudflare bundle validation

Success criteria: once a rights-cleared image has been saved as a permanent Cloud image, reopening the app or using another device renders that image from Supabase without a Google Places photo request.
