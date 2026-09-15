# Cloud Permanent Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist rights-cleared place images in Supabase Storage and automatically restore them across refreshes, browser restarts, and devices without issuing a Google Places photo request.

**Architecture:** Extend the existing `public.amd_place_images` registry and add a public-read/admin-write Supabase Storage bucket named `amd-place-images`. Add a focused permanent-image domain layer, a Supabase repository for upload/list/archive/cover operations, merge active Cloud rows into `Place.imageMetadata` during `loadPlacesFromDatabase()`, and expose permanent-image management inside the existing admin photo control. Google Place Photos remain session-only, manual-only fallback content and are never copied into permanent Storage.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.8, Vitest/jsdom, Supabase JS/Postgres/RLS/Storage, Cloudflare Workers static export.

**Spec:** `docs/superpowers/specs/2026-09-15-cloud-permanent-images-design.md`

## Global Constraints

- Permanent Storage accepts only rights-cleared `user_upload`, `admin_upload`, or `licensed_import` images.
- Never copy or persist Google Place Photo bytes, Google photo URIs, Google photo resource names, or `google_places` as a permanent source.
- Extend the live `amd_place_images` table; do not create a parallel image registry.
- Bucket name is exactly `amd-place-images`, public-read, 8 MiB maximum object size, and MIME restricted to JPEG, PNG, WebP, or AVIF.
- Database and Storage writes require an authenticated, non-anonymous JWT with `app_metadata.amd_admin = true`.
- App startup may read Supabase rows/objects but must not call `fetchGoogleTransientPhoto`, `loadGoogleMaps`, or any Google Places photo endpoint to restore permanent images.
- Existing canonical/seed/official images remain compatible. Existing Google runtime behavior remains manual-only fallback.
- Every production behavior change follows RED → verify failure → GREEN → verify pass → refactor → relevant full suite.
- Implement on `feature/cloud-permanent-images`; merge/fast-forward to `main` only after the final verification task succeeds.

---

### Task 1: Add the permanent-image database, RLS, Storage, and cover-switch migration

**Files:**
- Create: `supabase/cloud-permanent-images.sql`
- Create: `tests/cloud-permanent-image-migration.test.ts`

**Interfaces:**
- Extends `public.amd_place_images` with Storage/provenance/lifecycle fields.
- Creates bucket `amd-place-images`.
- Exposes `public.amd_set_place_image_cover(p_image_id uuid)` for atomic cover replacement.

- [ ] **Step 1: Write the failing migration contract test**

Create `tests/cloud-permanent-image-migration.test.ts`:

```ts
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync("supabase/cloud-permanent-images.sql", "utf8").toLowerCase();

describe("cloud permanent image migration", () => {
  it("extends the existing live image registry and creates the dedicated bucket", () => {
    expect(sql).toContain("alter table public.amd_place_images");
    for (const column of ["storage_bucket", "storage_path", "rights_basis", "mime_type", "byte_size", "is_cover", "status", "created_by", "updated_at"]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain("amd-place-images");
    expect(sql).toContain("8388608");
    for (const mime of ["image/jpeg", "image/png", "image/webp", "image/avif"]) expect(sql).toContain(mime);
  });

  it("enforces active-only public reads and admin-only writes", () => {
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain("auth.jwt() -> 'app_metadata' ->> 'amd_admin'");
    expect(sql).toContain("storage.objects");
    expect(sql).toContain("amd_set_place_image_cover");
    expect(sql).toContain("is_cover = true");
  });

  it("does not add a persistent Google photo cache", () => {
    expect(sql).not.toContain("google_photo_uri");
    expect(sql).not.toContain("google_photo_name");
    expect(sql).not.toContain("google_photo_blob");
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

```bash
npm test -- tests/cloud-permanent-image-migration.test.ts
```

Expected: FAIL because `supabase/cloud-permanent-images.sql` does not exist.

- [ ] **Step 3: Implement the additive registry migration**

Create `supabase/cloud-permanent-images.sql` beginning with:

```sql
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

create unique index if not exists amd_place_images_storage_path_uidx
  on public.amd_place_images(storage_path)
  where storage_path is not null;

create unique index if not exists amd_place_images_active_cover_uidx
  on public.amd_place_images(place_id)
  where is_cover = true and status = 'active';
```

Replace the current unrestricted public-read policy with active-only read access:

```sql
drop policy if exists "amd public read images" on public.amd_place_images;
create policy "amd public read active images"
  on public.amd_place_images for select to anon, authenticated
  using (status = 'active');
```

Grant `authenticated` INSERT/UPDATE/DELETE and create separate policies using this predicate in both `using` and `with check` where applicable:

```sql
coalesce((auth.jwt() -> 'app_metadata' ->> 'amd_admin')::boolean, false)
and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
```

- [ ] **Step 4: Create/configure the Storage bucket and Storage policies in the same migration**

Use:

```sql
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
```

Create a public SELECT policy on `storage.objects` constrained to `bucket_id = 'amd-place-images'`. Create authenticated INSERT/UPDATE/DELETE policies constrained to both the same bucket ID and the admin JWT predicate. Drop policies with the same names before recreating them so the migration is repeatable.

- [ ] **Step 5: Add atomic cover replacement RPC**

Create `public.amd_set_place_image_cover(p_image_id uuid)` as `security invoker`. It must:

1. reject callers that fail the admin JWT predicate using SQLSTATE `42501`;
2. select the active target row and its `place_id`, raising `P0002` if missing;
3. set `is_cover=false` for every active image of the same place;
4. set the target image to `is_cover=true` and update `updated_at`;
5. grant execute to `authenticated` and revoke execute from `anon`/`public`.

Because the function runs in one transaction, an exception rolls back both cover updates and preserves the one-active-cover invariant.

- [ ] **Step 6: Verify GREEN**

```bash
npm test -- tests/cloud-permanent-image-migration.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/cloud-permanent-images.sql tests/cloud-permanent-image-migration.test.ts
git commit -m "feat: add permanent image cloud schema"
```

---

### Task 2: Add the permanent-image domain model and deterministic image priority

**Files:**
- Modify: `types/place.ts`
- Create: `lib/cloud/place-image-model.ts`
- Modify: `lib/place-images.ts`
- Create: `tests/cloud-permanent-images.test.ts`

**Interfaces:**

```ts
export type PermanentImageSource = "user_upload" | "admin_upload" | "licensed_import";

export type CloudPermanentImageRow = {
  id: string;
  place_id: string;
  source: PermanentImageSource;
  source_reference: string | null;
  source_url: string | null;
  attribution: string | null;
  width: number | null;
  height: number | null;
  verified: boolean;
  last_checked: string | null;
  created_at: string;
  storage_bucket: string | null;
  storage_path: string | null;
  rights_basis: string | null;
  mime_type: string | null;
  byte_size: number | null;
  is_cover: boolean;
  status: "active" | "archived";
  created_by: string | null;
  updated_at: string;
};
```

Add `"cloud_storage"` to `PlaceImage.source` and add `isCover?: boolean`.

- [ ] **Step 1: Write failing model/priority tests**

Create `tests/cloud-permanent-images.test.ts` with an explicit active row:

```ts
import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import {
  cloudPermanentImageToPlaceImage,
  mergePermanentImagesIntoPlaces,
  validatePermanentImageMetadata,
  type CloudPermanentImageRow,
} from "@/lib/cloud/place-image-model";
import { getPlaceImageCandidates } from "@/lib/place-images";

const seed = PLACES[0]!;
const row: CloudPermanentImageRow = {
  id: "11111111-1111-4111-8111-111111111111",
  place_id: seed.id,
  source: "admin_upload",
  source_reference: null,
  source_url: "https://around.example/source",
  attribution: "Around My Dorm",
  width: 1200,
  height: 800,
  verified: true,
  last_checked: "2026-09-15T07:00:00.000Z",
  created_at: "2026-09-15T07:00:00.000Z",
  storage_bucket: "amd-place-images",
  storage_path: `${seed.id}/11111111-1111-4111-8111-111111111111.webp`,
  rights_basis: "Owned by Around My Dorm",
  mime_type: "image/webp",
  byte_size: 2048,
  is_cover: true,
  status: "active",
  created_by: "22222222-2222-4222-8222-222222222222",
  updated_at: "2026-09-15T07:00:00.000Z",
};

it("ranks a Cloud cover before every other persisted candidate", () => {
  const place = {
    ...seed,
    imageMetadata: [
      { url: "https://official.test/a.jpg", source: "official_website" as const, verified: true },
      { url: "https://cloud.test/cover.webp", source: "cloud_storage" as const, verified: true, isCover: true },
    ],
  };
  expect(getPlaceImageCandidates(place)[0]?.url).toBe("https://cloud.test/cover.webp");
});

it("merges Cloud rows only into their matching place", () => {
  const merged = mergePermanentImagesIntoPlaces(
    [seed, { ...seed, id: "other" }],
    [row],
    () => "https://cloud.test/a.webp",
  );
  expect(merged[0]?.imageMetadata?.some((image) => image.source === "cloud_storage")).toBe(true);
  expect(merged[1]?.imageMetadata?.some((image) => image.source === "cloud_storage")).toBe(false);
});

it("rejects Google-backed metadata from the permanent path", () => {
  expect(() => validatePermanentImageMetadata({
    source: "google_places" as any,
    rightsBasis: "copied",
    sourceUrl: "https://places.googleapis.com/v1/x/media",
  })).toThrow();
});

it("recreates the same Cloud image candidate from the same persisted row", () => {
  const first = cloudPermanentImageToPlaceImage(row, "https://cloud.test/a.webp");
  const reopened = cloudPermanentImageToPlaceImage(row, "https://cloud.test/a.webp");
  expect(reopened).toEqual(first);
});
```

- [ ] **Step 2: Run tests and confirm RED**

```bash
npm test -- tests/cloud-permanent-images.test.ts
```

Expected: FAIL because `cloud_storage` and the model module do not exist.

- [ ] **Step 3: Implement the pure model**

`validatePermanentImageMetadata()` requires a non-empty rights basis and a source in the permanent allowlist. Reject explicit Google photo URLs/resource references using guards for `places.googleapis.com`, `maps.googleapis.com`, `googleusercontent.com`, and `places/<id>/photos/<id>`.

`cloudPermanentImageToPlaceImage()` returns:

```ts
{
  url: publicUrl,
  source: "cloud_storage",
  attribution: row.attribution,
  width: row.width,
  height: row.height,
  verified: row.verified,
  photoReference: null,
  isCover: row.is_cover,
}
```

`mergePermanentImagesIntoPlaces()` groups only active rows with a usable `storage_path`, maps them to public URLs, prepends them to `imageMetadata`, and leaves unrelated places unchanged.

- [ ] **Step 4: Update persisted-image ranking**

In `lib/place-images.ts`, use source/cover scoring that guarantees this order:

1. Cloud cover.
2. Other Cloud permanent images.
3. Official persisted images.
4. Existing seed/other persisted images.
5. Persisted Google-reference compatibility images.

Runtime Google remains outside this function and is handled by `PlacePhoto` after persisted candidates. Extend `sourceLabel()` so `cloud_storage` becomes `Cloud Permanent Image`.

- [ ] **Step 5: Verify GREEN and type safety**

```bash
npm test -- tests/cloud-permanent-images.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add types/place.ts lib/cloud/place-image-model.ts lib/place-images.ts tests/cloud-permanent-images.test.ts
git commit -m "feat: model permanent cloud place images"
```

---

### Task 3: Add the Supabase permanent-image repository with compensating failure handling

**Files:**
- Create: `lib/cloud/place-images.ts`
- Create: `tests/cloud-permanent-image-storage.test.ts`

**Interfaces:**

```ts
export const PERMANENT_IMAGE_BUCKET = "amd-place-images";
export const PERMANENT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export async function loadActivePermanentImageRows(placeIds: string[]): Promise<CloudPermanentImageRow[]>;
export function getPermanentImagePublicUrl(row: CloudPermanentImageRow): string;
export async function uploadPermanentPlaceImage(input: PermanentImageUploadInput): Promise<CloudPermanentImageRow>;
export async function setPermanentImageCover(imageId: string): Promise<void>;
export async function archivePermanentPlaceImage(row: CloudPermanentImageRow): Promise<{ objectRemoved: boolean }>;
```

- [ ] **Step 1: Write failing repository tests**

Mock `@/lib/cloud/supabase` and test these behaviors independently:

1. Unsupported MIME or `file.size > 8 MiB` fails before Storage upload.
2. Storage upload failure causes no registry INSERT.
3. Registry INSERT failure calls `storage.from(bucket).remove([path])` before rethrowing.
4. `isCover=true` calls RPC `amd_set_place_image_cover` after successful row insert.
5. RPC failure compensates by archiving the just-created row and attempting object removal before rethrowing.
6. Archive flow updates `status='archived'` before object removal.
7. Object-removal failure returns `{ objectRemoved:false }` while the row stays archived.
8. Listing selects only active rows and never imports a Google photo module.

- [ ] **Step 2: Run tests and confirm RED**

```bash
npm test -- tests/cloud-permanent-image-storage.test.ts
```

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement validation, path generation, upload, and insert**

Use:

```ts
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};
```

Object path is `${placeId}/${crypto.randomUUID()}.${extension}`. Before upload, call the pure metadata validator and reject files over `PERMANENT_IMAGE_MAX_BYTES` or MIME types outside the map.

Use `supabase.auth.getUser()` to obtain the authenticated user ID, then `getAdminAccessState()` to require `admin === true`. Upload to Storage first. Insert the registry row second with `verified:true`, `storage_bucket`, `storage_path`, source/provenance, MIME, byte size, `created_by`, and timestamps. If insert fails, remove the object before rethrowing.

- [ ] **Step 4: Implement public listing and URL materialization**

`loadActivePermanentImageRows()` queries `amd_place_images`, filters `status='active'`, and processes place IDs in chunks of 100 to keep the `.in("place_id", ids)` request bounded. Empty input returns `[]` without a request.

`getPermanentImagePublicUrl()` uses:

```ts
supabase.storage
  .from(row.storage_bucket || PERMANENT_IMAGE_BUCKET)
  .getPublicUrl(row.storage_path!).data.publicUrl
```

It does not sign URLs and does not call Google.

- [ ] **Step 5: Implement cover and archive operations**

`setPermanentImageCover()` calls `supabase.rpc("amd_set_place_image_cover", { p_image_id: imageId })` and throws on error.

`archivePermanentPlaceImage()` updates the row to `{ status:"archived", is_cover:false, updated_at: now }` first. Only after that succeeds does it remove the Storage object. If object deletion fails, return `{ objectRemoved:false }` without reactivating the row.

- [ ] **Step 6: Verify GREEN**

```bash
npm test -- tests/cloud-permanent-image-storage.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/cloud/place-images.ts tests/cloud-permanent-image-storage.test.ts
git commit -m "feat: add permanent image cloud repository"
```

---

### Task 4: Merge permanent Cloud images into startup loading and preserve runtime fallback order

**Files:**
- Modify: `lib/database/places.ts`
- Modify: `components/PlacePhoto.tsx`
- Create: `tests/cloud-permanent-image-loader.test.ts`
- Create: `tests/place-photo-fallback.test.ts`

**Interfaces:**

```ts
async function applyPermanentImageLayer(places: Place[]): Promise<Place[]>;
```

- [ ] **Step 1: Write the failing loader boundary test**

Assert that:

- `lib/database/places.ts` imports the permanent-image repository/model.
- `loadPlacesFromDatabase()` applies the permanent layer after user additions/overrides are assembled and before returning normalized places.
- `lib/database/places.ts`, `lib/cloud/place-images.ts`, and `lib/cloud/place-image-model.ts` do not import `google-transient-photo`, `fetchGoogleTransientPhoto`, or `loadGoogleMaps`.
- Permanent-image Cloud failure adds a warning while preserving place records.

- [ ] **Step 2: Write the failing candidate-chain UI test**

Using Testing Library in `tests/place-photo-fallback.test.ts` and `React.createElement`, render `PlacePhoto` with two persisted candidates: a Cloud URL first and a seed URL second. Fire `error` on the first `<img>` and assert the image source changes to the seed URL.

Add a second case where a Google runtime image is already present in `google-photo-runtime`: persisted candidates must still render first, but after all persisted candidates fail, the already-loaded runtime image becomes the next candidate. The test must not call Google or `fetchGoogleTransientPhoto`.

- [ ] **Step 3: Run tests and confirm RED**

```bash
npm test -- tests/cloud-permanent-image-loader.test.ts tests/place-photo-fallback.test.ts
```

Expected: loader test FAIL because the permanent layer is not wired; runtime-after-persisted test FAIL because `PlacePhoto` currently chooses persisted candidates or runtime instead of appending runtime last.

- [ ] **Step 4: Implement the loader layer**

Add:

```ts
async function applyPermanentImageLayer(places: Place[]) {
  const rows = await loadActivePermanentImageRows(places.map((place) => place.id));
  return mergePermanentImagesIntoPlaces(places, rows, getPermanentImagePublicUrl);
}
```

Call it after `applyCloudUserLayer()` so user-added places can receive permanent images. Catch failures like other optional Cloud layers and append `Permanent image cloud unavailable` while retaining the current place list.

- [ ] **Step 5: Correct `PlacePhoto` candidate composition**

Replace the persisted-vs-runtime exclusive choice with a single ordered candidate list:

```ts
const candidates = useMemo(() => {
  if (!transientImage) return persistedCandidates;
  if (persistedCandidates.some((image) => image.url === transientImage.url)) return persistedCandidates;
  return [...persistedCandidates, transientImage];
}, [persistedCandidates, transientImage]);
```

This preserves Cloud/persisted priority, permits manually loaded Google runtime as a fallback in the same session, and triggers no Google request by itself.

- [ ] **Step 6: Verify GREEN and existing database tests**

```bash
npm test -- tests/cloud-permanent-image-loader.test.ts tests/place-photo-fallback.test.ts tests/use-place-database.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/database/places.ts components/PlacePhoto.tsx tests/cloud-permanent-image-loader.test.ts tests/place-photo-fallback.test.ts
git commit -m "feat: restore permanent images from cloud on startup"
```

---

### Task 5: Add the admin Cloud Permanent Images manager

**Files:**
- Create: `components/CloudPermanentImageManager.tsx`
- Modify: `components/GoogleBulkPhotoRuntimeControl.tsx`
- Create: `tests/cloud-permanent-image-manager.test.ts`

**UX requirements:**
- Keep the existing Google Photos section manual-only.
- Add a visually separate `CLOUD PERMANENT IMAGES` section.
- Select a place, select a local image file, choose `admin_upload` or `licensed_import`, enter required rights basis, optional attribution/source URL, and optional `Set as cover`.
- Show current active Cloud images for the selected place with `Set cover` and `Archive` actions.
- Show aggregate counts: permanent Cloud images, places with a Cloud cover, runtime-only Google images, and places with no persisted image.
- Explicitly state that a displayed Google runtime photo cannot be copied into Cloud Storage by this feature.

- [ ] **Step 1: Write failing manager contract tests**

The test reads the new component and asserts:

```ts
expect(source).toContain("CLOUD PERMANENT IMAGES");
expect(source).toContain('accept="image/jpeg,image/png,image/webp,image/avif"');
expect(source).toContain("rightsBasis");
expect(source).toContain("uploadPermanentPlaceImage");
expect(source).toContain("setPermanentImageCover");
expect(source).toContain("archivePermanentPlaceImage");
expect(source).not.toContain("fetchGoogleTransientPhoto");
```

Also assert `GoogleBulkPhotoRuntimeControl.tsx` renders `<CloudPermanentImageManager` inside the existing admin-only control.

- [ ] **Step 2: Run test and confirm RED**

```bash
npm test -- tests/cloud-permanent-image-manager.test.ts
```

Expected: FAIL because the manager does not exist.

- [ ] **Step 3: Implement the manager**

Use controlled state for `selectedPlaceId`, `file`, `source`, `rightsBasis`, `attribution`, `sourceUrl`, `isCover`, `running`, and `message`.

Disable upload until a place, file, and non-empty rights basis are present. On success, reload active image rows, clear file/provenance inputs, invoke parent `onChanged`, and show a Thai/English success message. Errors display the validation/Supabase error and never silently fall back to Google.

- [ ] **Step 4: Embed in the existing global photo control**

Pass the already-loaded `places` and `refreshPlaces` callback. Do not add another login gate and do not mount a second global floating control.

- [ ] **Step 5: Verify GREEN**

```bash
npm test -- tests/cloud-permanent-image-manager.test.ts tests/data-management-admin-gate.test.ts tests/google-bulk-photo-runtime.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/CloudPermanentImageManager.tsx components/GoogleBulkPhotoRuntimeControl.tsx tests/cloud-permanent-image-manager.test.ts
git commit -m "feat: manage permanent place images in admin control"
```

---

### Task 6: Lock the Google-runtime/permanent-storage boundary with regression tests

**Files:**
- Modify: `tests/google-bulk-photo-runtime.test.ts`
- Modify: `tests/google-photo-cloud-metadata.test.ts`
- Modify: `tests/photo-api-budget.test.ts`
- Modify: `tests/cloud-only-storage.test.ts`

- [ ] **Step 1: Add boundary assertions**

Assert that:

- `GoogleTransientPhotoPanel` and `GoogleBulkPhotoRuntimeControl` still call Google only from explicit user actions.
- `lib/google-transient-photo.ts` still marks Google photo URLs as runtime-only.
- `lib/cloud/place-images.ts` never imports `google-transient-photo`, `google-photo-runtime`, or `loadGoogleMaps`.
- `lib/cloud/place-images.ts` contains no `localStorage` or `sessionStorage`.
- Startup restoration uses `amd_place_images` and Supabase Storage public URLs.
- No migration adds `google_photo_uri`, `google_photo_name`, or binary Google cache fields.

- [ ] **Step 2: Run the regression group**

```bash
npm test -- tests/google-bulk-photo-runtime.test.ts tests/google-photo-cloud-metadata.test.ts tests/photo-api-budget.test.ts tests/google-manual-request-architecture.test.ts tests/cloud-only-storage.test.ts
```

Expected: PASS after Tasks 1–5. Any failure is a storage/API-boundary regression and must be corrected before proceeding.

- [ ] **Step 3: Commit the boundary tests**

```bash
git add tests/google-bulk-photo-runtime.test.ts tests/google-photo-cloud-metadata.test.ts tests/photo-api-budget.test.ts tests/cloud-only-storage.test.ts
git commit -m "test: protect permanent image storage boundaries"
```

---

### Task 7: Apply the live Supabase migration and verify authorization/storage state

**Files:**
- Apply: `supabase/cloud-permanent-images.sql` to project `gfqkexnqbjtuwsyqacsw` using the Supabase migration operation.

- [ ] **Step 1: Apply the migration**

Use the connector's DDL migration action rather than `execute_sql` for schema changes. Apply the exact SQL committed in Task 1.

- [ ] **Step 2: Verify the live registry schema**

Read `information_schema.columns` and confirm all new fields exist with the expected defaults/constraints. Confirm the pre-migration row count is preserved.

- [ ] **Step 3: Verify live RLS policies**

Query `pg_policies` and confirm:

- anon/authenticated SELECT is restricted to active `amd_place_images` rows;
- INSERT/UPDATE/DELETE on `amd_place_images` use the admin JWT predicate;
- Storage object writes are restricted to authenticated admins and bucket `amd-place-images`.

- [ ] **Step 4: Verify bucket configuration**

Read `storage.buckets` and confirm:

```text
id/name: amd-place-images
public: true
file_size_limit: 8388608
allowed_mime_types: image/jpeg, image/png, image/webp, image/avif
```

- [ ] **Step 5: Verify the cover RPC exists**

Confirm `amd_set_place_image_cover(uuid)` exists and is executable by `authenticated`, not `anon`.

No production image row is fabricated during this task.

---

### Task 8: End-to-end verification, CI, and merge

**Files:**
- Update: `docs/superpowers/specs/2026-09-15-cloud-permanent-images-design.md` status line only after successful implementation acceptance.

- [ ] **Step 1: Run the full CI-equivalent suite**

```bash
npm test
npm run typecheck
npm run build
npx wrangler deploy --dry-run
```

Expected: every command exits 0.

- [ ] **Step 2: Perform the rights-cleared image acceptance test**

Using the new admin UI, upload one real image that the project has permission to store and mark it as cover. Record the affected place ID, the active `amd_place_images` row, and the Storage object path.

If no rights-cleared image file has been supplied, stop this acceptance step without fabricating one. Infrastructure/code verification may complete, but real-image restart persistence remains explicitly unverified until such a file is available.

- [ ] **Step 3: Prove restart persistence without Google photo usage**

For the acceptance-test place:

1. Record the count of `amd_google_request_logs` where `request_type='place_photo'`.
2. Hard-refresh/reopen the app.
3. Confirm the place renders the Supabase public object URL as its first persisted image.
4. Re-read the `place_photo` request count.
5. Assert the count did not increase because of the reopen.

- [ ] **Step 4: Mark the spec implemented only when acceptance is complete**

Change the spec status line to `Status: Approved and implemented` only when code verification and the real-image restart test have succeeded.

- [ ] **Step 5: Commit final verification documentation when applicable**

```bash
git add docs/superpowers/specs/2026-09-15-cloud-permanent-images-design.md
git commit -m "docs: mark cloud permanent images implemented"
```

Do not create this commit while the real-image acceptance test is waiting for a rights-cleared file.

- [ ] **Step 6: Check GitHub Build Check for the feature head SHA**

Require Unit tests, Type check, Build production, and Validate Cloudflare Workers bundle to all conclude `success`.

- [ ] **Step 7: Integrate**

Fast-forward `main` to `feature/cloud-permanent-images` only when the feature branch is based on current `main`, the full suite is green, and GitHub Build Check succeeds. Do not claim Cloudflare deployment unless a separate real deploy action is executed and verified.

---

## Completion Criteria

The feature is complete when a rights-cleared image uploaded once is represented by an active `amd_place_images` row plus an object in `amd-place-images`, the normal place loader automatically merges that image on every fresh app session/device, `PlacePhoto` renders it before an already-loaded Google runtime fallback, reopening the app does not create a Google Places photo request, and unauthorized/anonymous clients cannot mutate the registry or Storage bucket.