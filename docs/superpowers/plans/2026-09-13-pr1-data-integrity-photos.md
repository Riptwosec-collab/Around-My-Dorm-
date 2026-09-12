# PR 1 — Data Integrity & Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Around My Dorm V3 slice: deterministic duplicate detection/review, category deficit tracking, measurable photo coverage with missing/failed-only manual Google fetches, and a safe persistent owned/authorized image layer without ever persisting Google runtime photo URLs.

**Architecture:** Keep duplicate analysis, coverage math, and photo-health logic as pure modules that can be unit tested without React or Supabase. Persist only shared state that must survive sessions: duplicate review decisions and owned/authorized image metadata. Keep Google photo URLs in the existing runtime store only. Surface the new health/review controls inside the existing admin Data Management flow, and reuse the existing explicit/manual Google request architecture.

**Tech Stack:** Next.js 15 / React / TypeScript / Vitest / Supabase Postgres + Storage / Cloudflare Workers static deployment / existing Google Maps JavaScript + Places manual request layer.

**Spec:** `docs/superpowers/specs/2026-09-13-around-my-dorm-v3-design.md`

## Global Constraints

- External Google Places/Photos operations remain explicit and user/admin initiated.
- Normal Home, Explore, Map, Saved, Recent, filters, place details, route transitions, hover, scroll, and component mount must not create new Google Places requests.
- Google runtime photo URLs must never be persisted as owned or authorized persistent image records.
- Production currently uses `amd_*` tables; do not apply the older generic `public.places` schema as a production migration.
- Canonical production target is 100 places.
- Admin-only destructive mutations must use the existing authenticated admin authorization pattern; UI hiding alone is not authorization.
- Unknown data remains unknown; do not infer business facts or promote review Google matches to verified as a side effect of photo work.
- Every task uses TDD: failing test first, verify RED, implement minimal behavior, verify GREEN, then commit.
- Before merge run: `npm test`, `npm run typecheck`, `npm run build`, `npx wrangler deploy --dry-run`.

---

## File Structure

### New files

- `lib/duplicate-guard.ts` — pure duplicate analysis, normalization, distance/name similarity, stable pair keys.
- `lib/photo-health.ts` — pure photo coverage summary and fetch-target selection.
- `lib/coverage-targets.ts` — category group targets and deficit calculation.
- `components/DuplicateReviewPanel.tsx` — admin duplicate queue and actions.
- `components/PhotoCoveragePanel.tsx` — coverage metrics plus missing-only / failed-only controls.
- `components/CoverageTargetPanel.tsx` — current/target/deficit category coverage.
- `supabase/v3-data-integrity-photos.sql` — additive production-safe migration for duplicate resolutions, image metadata fields, storage bucket/policies, and admin RPCs.
- `tests/duplicate-guard.test.ts` — duplicate logic.
- `tests/photo-health.test.ts` — photo health/targeting logic.
- `tests/coverage-targets.test.ts` — category deficits.
- `tests/owned-image-layer.test.ts` — persistence/source priority and Google runtime isolation.
- `tests/v3-admin-data-integrity.test.ts` — migration/admin contract and Data Management wiring.

### Existing files to modify

- `types/place.ts` — explicit persistent/runtime image classification types.
- `lib/google-photo-runtime.ts` — runtime photo outcome state (`loaded`, `no_photo`, `failed`) and events.
- `lib/place-images.ts` — persistent image priority and source classification.
- `lib/database/places.ts` — merge shared `amd_place_images` metadata into canonical places.
- `components/GoogleBulkPhotoRuntimeControl.tsx` — use shared target selector, update per-place outcome, expose missing/failed retry paths through a reusable runner.
- `components/PlacePhoto.tsx` — preserve priority: persistent owned/authorized image first, Google runtime second, fallback last.
- `components/DataManagement.tsx` — mount the three PR1 admin panels and connect replacement discovery.
- `README.md` — document PR1 image ownership semantics and duplicate guard.

---

### Task 1: Deterministic Duplicate Guard

**Files:**
- Create: `lib/duplicate-guard.ts`
- Create: `tests/duplicate-guard.test.ts`
- Modify: `lib/place-update-engine.ts`

**Interfaces:**
- Produces:
  - `type DuplicateVerdict = "unique" | "suspected_duplicate" | "duplicate"`
  - `type DuplicateReason = "same_google_place_id" | "same_phone" | "name_and_distance" | "name_and_area" | "branch_conflict"`
  - `type DuplicateAnalysis = { pairKey: string; a: Place; b: Place; verdict: DuplicateVerdict; score: number; distanceMeters: number | null; reasons: DuplicateReason[] }`
  - `normalizeBusinessName(name: string): string`
  - `businessNameSimilarity(a: string, b: string): number`
  - `analyzeDuplicatePair(a: Place, b: Place): DuplicateAnalysis`
  - `findDuplicateAnalyses(places: Place[]): DuplicateAnalysis[]`
- `lib/place-update-engine.ts` keeps its public `findDuplicatePairs()` export for backward compatibility but delegates to the new module and returns only non-unique pairs.

- [ ] **Step 1: Write duplicate regression tests**

```ts
import { describe, expect, it } from "vitest";
import { analyzeDuplicatePair, findDuplicateAnalyses, normalizeBusinessName } from "@/lib/duplicate-guard";
import type { Place } from "@/types/place";

function place(input: Partial<Place> & Pick<Place, "id" | "name">): Place {
  return {
    id: input.id,
    name: input.name,
    nameEn: null,
    slug: input.id,
    category: "cafe",
    categories: ["cafe"],
    subcategory: null,
    shortDescription: "",
    description: "",
    address: null,
    area: "ลาดพร้าว",
    soi: null,
    latitude: 13.8,
    longitude: 100.58,
    distanceKm: null,
    walkingMinutes: null,
    drivingMinutes: null,
    openingHours: { monday:null,tuesday:null,wednesday:null,thursday:null,friday:null,saturday:null,sunday:null },
    is24Hours: false,
    priceLevel: null,
    priceText: null,
    averagePricePerPerson: null,
    minPrice: null,
    maxPrice: null,
    popularMenus: [],
    recommendedItems: [],
    tags: [],
    rating: null,
    reviewCount: null,
    phone: null,
    line: null,
    facebook: null,
    instagram: null,
    website: null,
    googleMapsUrl: null,
    googlePlaceId: null,
    image: null,
    images: [],
    paymentMethods: [],
    delivery: null,
    deliveryApps: [],
    dineIn: null,
    takeaway: null,
    parking: { available:null,type:null,price:null,note:null },
    airConditioned: null,
    wifi: null,
    powerOutlet: null,
    toilet: null,
    petFriendly: null,
    wheelchairAccessible: null,
    openLate: null,
    studentFriendly: null,
    goodForWorking: null,
    recommended: false,
    localFavorite: false,
    verified: false,
    lastVerified: null,
    source: [],
    notes: null,
    ...input,
  };
}

describe("duplicate guard", () => {
  it("treats an identical Google Place ID as a hard duplicate", () => {
    const a = place({ id: "a", name: "Cafe A", googlePlaceId: "ChIJ123" });
    const b = place({ id: "b", name: "Cafe A Ladprao", googlePlaceId: "ChIJ123" });
    expect(analyzeDuplicatePair(a, b).verdict).toBe("duplicate");
  });

  it("does not collapse different verified branches just because the brand name is similar", () => {
    const a = place({ id: "a", name: "7-Eleven ลาดพร้าว 35", googlePlaceId: "ChIJ-A" });
    const b = place({ id: "b", name: "7-Eleven ลาดพร้าว 41", googlePlaceId: "ChIJ-B" });
    expect(analyzeDuplicatePair(a, b).verdict).toBe("unique");
  });

  it("flags a near-identical nearby business without stable IDs for review", () => {
    const a = place({ id: "a", name: "Roller Cofster", latitude: 13.801, longitude: 100.581 });
    const b = place({ id: "b", name: "Roller Cofster Cafe", latitude: 13.8012, longitude: 100.5811 });
    expect(analyzeDuplicatePair(a, b).verdict).toBe("suspected_duplicate");
  });

  it("normalizes punctuation and repeated whitespace", () => {
    expect(normalizeBusinessName("  THE  OLIVE—CAFE  ")).toBe(normalizeBusinessName("the olive cafe"));
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- tests/duplicate-guard.test.ts
```

Expected: FAIL because `@/lib/duplicate-guard` does not exist.

- [ ] **Step 3: Implement normalization, similarity, branch guard, and stable pair keys**

Core rules in `lib/duplicate-guard.ts`:

```ts
export function stablePairKey(aId: string, bId: string) {
  return [aId, bId].sort().join("::");
}

export function normalizeBusinessName(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

Implement Dice bigram similarity in the same file; no new dependency. Apply the decision order exactly:

1. Same non-empty `googlePlaceId` -> `duplicate`, score `1.0`.
2. Same normalized phone with at least 8 digits -> `duplicate`, score `0.99`.
3. If both Google IDs exist and differ -> default `unique`; only return `suspected_duplicate` when distance <= 60 m, name similarity >= 0.96, and branch qualifiers are not contradictory.
4. Without conflicting stable IDs: distance <= 80 m + similarity >= 0.92 -> `suspected_duplicate`.
5. Same normalized area/address + similarity >= 0.88 -> `suspected_duplicate`.
6. Otherwise -> `unique`.

Branch qualifiers should preserve meaningful numeric/soi suffixes such as `ลาดพร้าว 35`, `ลาดพร้าว 41`, `สาขา 1`, `สาขา 2`; a mismatch adds `branch_conflict` and blocks soft duplicate classification unless a hard identity signal already matched.

- [ ] **Step 4: Delegate legacy duplicate helpers to the new engine**

In `lib/place-update-engine.ts`, replace the old pairwise heuristics with:

```ts
import { analyzeDuplicatePair, findDuplicateAnalyses } from "@/lib/duplicate-guard";

export function possibleDuplicate(a: Place, b: Place) {
  return analyzeDuplicatePair(a, b).verdict !== "unique";
}

export function findDuplicatePairs(places: Place[]) {
  return findDuplicateAnalyses(places)
    .filter((item) => item.verdict !== "unique")
    .map(({ a, b }) => ({ a, b }));
}
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- tests/duplicate-guard.test.ts tests/data-quality.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/duplicate-guard.ts lib/place-update-engine.ts tests/duplicate-guard.test.ts
git commit -m "feat: add deterministic duplicate guard"
```

---

### Task 2: Shared Duplicate Review Decisions and Safe Resolution RPCs

**Files:**
- Create: `supabase/v3-data-integrity-photos.sql`
- Create: `tests/v3-admin-data-integrity.test.ts`

**Interfaces:**
- Produces table `public.amd_duplicate_resolutions`.
- Produces RPC `public.amd_set_duplicate_resolution(p_place_id_a text, p_place_id_b text, p_decision text)`.
- Produces RPC `public.amd_merge_duplicate_place(p_survivor_id text, p_duplicate_id text, p_survivor_record jsonb)`.
- Decisions: `both_unique | keep_a | keep_b | merged`.
- Both RPCs perform internal admin authorization and expose no service-role key to the browser.

- [ ] **Step 1: Write SQL-contract tests before the migration exists**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").toLowerCase();

describe("V3 duplicate admin migration", () => {
  it("defines persistent pair decisions and admin-gated resolution RPCs", () => {
    const sql = read("supabase/v3-data-integrity-photos.sql");
    expect(sql).toContain("amd_duplicate_resolutions");
    expect(sql).toContain("amd_set_duplicate_resolution");
    expect(sql).toContain("amd_merge_duplicate_place");
    expect(sql).toContain("security definer");
    expect(sql).toContain("from auth.users");
    expect(sql).toContain("raw_app_meta_data");
    expect(sql).toContain("email_confirmed_at");
  });

  it("makes duplicate deletion cascade through existing place foreign keys", () => {
    const sql = read("supabase/v3-data-integrity-photos.sql");
    expect(sql).toContain("delete from public.amd_places");
    expect(sql).toContain("for update");
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- tests/v3-admin-data-integrity.test.ts
```

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Add the duplicate resolution table**

Migration contract:

```sql
create table if not exists public.amd_duplicate_resolutions (
  pair_key text primary key,
  place_id_a text not null,
  place_id_b text not null,
  decision text not null check (decision in ('both_unique','keep_a','keep_b','merged')),
  resolved_by uuid not null,
  resolved_at timestamptz not null default now(),
  note text
);
```

Use a canonical pair key generated in SQL with `least()` / `greatest()` so A/B order cannot create duplicate decisions.

Enable RLS. Allow authenticated users to read only aggregate/review state needed by the admin UI if appropriate, but mutation must occur only through the admin RPCs. Revoke direct insert/update/delete from `anon` and `authenticated`.

- [ ] **Step 4: Add reusable internal admin check inside both RPCs**

Mirror the existing project-wide admin pattern: require `auth.uid()`, non-anonymous `auth.users`, and either trusted `raw_app_meta_data.amd_admin = true` or the existing confirmed-email allowlist rule already used by the project. Keep `SECURITY DEFINER` and `set search_path = pg_catalog`.

- [ ] **Step 5: Implement `amd_set_duplicate_resolution`**

Required behavior:

```sql
-- pseudocode contract inside function
v_a := least(p_place_id_a, p_place_id_b);
v_b := greatest(p_place_id_a, p_place_id_b);
if v_a = v_b then raise exception 'Duplicate pair must contain two places'; end if;
if p_decision not in (...) then raise exception 'Invalid decision'; end if;
insert ... on conflict (pair_key) do update ...;
```

Do not delete places in this RPC.

- [ ] **Step 6: Implement transactional `amd_merge_duplicate_place`**

The function must:

1. lock both `amd_places` rows with `FOR UPDATE`;
2. require both rows to exist and IDs differ;
3. update survivor `record`, mirrored scalar columns (`slug`, `name`, `category`, `area`, coordinates, Google ID, verification timestamps) from the supplied reviewed survivor record;
4. delete only `p_duplicate_id` from `amd_places` so existing `ON DELETE CASCADE` foreign keys clean linked cache/image/source rows;
5. persist a `merged` decision for the canonical pair;
6. return `{ survivorId, removedId }` JSON.

The RPC must not auto-create a replacement place and must not call Google.

- [ ] **Step 7: Verify GREEN**

```bash
npm test -- tests/v3-admin-data-integrity.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/v3-data-integrity-photos.sql tests/v3-admin-data-integrity.test.ts
git commit -m "feat: add duplicate review persistence"
```

---

### Task 3: Runtime Photo Health and Missing/Failed-Only Target Selection

**Files:**
- Create: `lib/photo-health.ts`
- Create: `tests/photo-health.test.ts`
- Modify: `lib/google-photo-runtime.ts`
- Modify: `components/GoogleBulkPhotoRuntimeControl.tsx`

**Interfaces:**
- Produces:
  - `type GoogleRuntimePhotoOutcome = { status: "idle" | "loaded" | "no_photo" | "failed"; attemptedAt: string | null; error: string | null }`
  - `getGoogleRuntimePhotoOutcome(placeId: string): GoogleRuntimePhotoOutcome`
  - `setGoogleRuntimePhotoOutcome(placeId: string, outcome: GoogleRuntimePhotoOutcome): void`
  - `type PhotoCoverageSummary`
  - `buildPhotoCoverage(places, links, runtimePhotoIds, outcomes): PhotoCoverageSummary`
  - `selectPhotoTargets(summary, mode: "missing" | "failed"): PhotoFetchTarget[]`

- [ ] **Step 1: Write target-selection tests**

```ts
import { describe, expect, it } from "vitest";
import { buildPhotoCoverage, selectPhotoTargets } from "@/lib/photo-health";

describe("photo health", () => {
  it("does not request a place that already has a persistent image", () => {
    const summary = buildPhotoCoverage(
      [{ id: "a", persistent: true }, { id: "b", persistent: false }] as any,
      new Map([["a", "g-a"], ["b", "g-b"]]),
      new Set<string>(),
      new Map(),
    );
    expect(selectPhotoTargets(summary, "missing").map((x) => x.placeId)).toEqual(["b"]);
  });

  it("retries only the places whose last manual photo attempt failed", () => {
    const outcomes = new Map([["a", { status: "failed", attemptedAt: "2026-09-13T00:00:00Z", error: "denied" }]]);
    const summary = buildPhotoCoverage([{ id: "a" }, { id: "b" }] as any, new Map([["a","g-a"],["b","g-b"]]), new Set(), outcomes as any);
    expect(selectPhotoTargets(summary, "failed").map((x) => x.placeId)).toEqual(["a"]);
  });
});
```

Use a small normalized input type in the implementation instead of coupling the pure builder to React state; add helper `photoHealthInputFromPlace(place)` for real `Place` records.

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- tests/photo-health.test.ts
```

Expected: FAIL because `photo-health.ts` and outcome APIs do not exist.

- [ ] **Step 3: Extend the runtime store with outcome state**

Keep photos and outcomes in separate Maps so clearing a photo does not accidentally erase diagnostics unless explicitly requested.

```ts
const runtimePhotoOutcomes = new Map<string, GoogleRuntimePhotoOutcome>();

export function setGoogleRuntimePhotoOutcome(placeId: string, outcome: GoogleRuntimePhotoOutcome) {
  runtimePhotoOutcomes.set(placeId, outcome);
  window.dispatchEvent(new CustomEvent(GOOGLE_PHOTO_RUNTIME_CHANGED_EVENT, { detail: { placeId } }));
}
```

`clearGoogleRuntimePhotos()` should clear runtime photo URLs; add `clearGoogleRuntimePhotoOutcomes()` for diagnostics reset.

- [ ] **Step 4: Implement coverage math**

`PhotoCoverageSummary` must expose:

```ts
{
  total: number;
  persistent: number;
  runtime: number;
  missing: number;
  failed: number;
  noPhoto: number;
  missingGooglePlaceId: number;
  items: PhotoCoverageItem[];
}
```

An item with persistent owned/authorized media is never a missing Google-photo target. A `loaded` runtime photo counts as covered for the current session only.

- [ ] **Step 5: Refactor the bulk photo component to one runner**

Replace the component-local `summary.targets` construction with `buildPhotoCoverage()` and a reusable:

```ts
async function runPhotoTargets(mode: "missing" | "failed") {
  const targets = selectPhotoTargets(summary, mode).slice(0, PHOTO_REQUEST_LIMIT);
  // existing explicit foreground request loop
}
```

On each attempt:

```ts
if (photo) {
  setGoogleRuntimePhoto(...);
  setGoogleRuntimePhotoOutcome(placeId, { status: "loaded", attemptedAt: now, error: null });
} else {
  setGoogleRuntimePhotoOutcome(placeId, { status: "no_photo", attemptedAt: now, error: null });
}
```

On exception set `status: "failed"` with the actionable error string. Keep `recordTrackedGoogleRequest({ requestType: "place_photo" ... })` exactly once per actual Google photo attempt.

- [ ] **Step 6: Verify no automatic photo requests were introduced**

Add to `tests/photo-health.test.ts` a source contract:

```ts
const bulk = readFileSync(join(process.cwd(), "components/GoogleBulkPhotoRuntimeControl.tsx"), "utf8");
expect(bulk).toContain('runPhotoTargets("missing")');
expect(bulk).toContain('runPhotoTargets("failed")');
expect(bulk).not.toMatch(/useEffect\([^]*fetchGoogleTransientPhoto/);
```

- [ ] **Step 7: Run GREEN tests**

```bash
npm test -- tests/photo-health.test.ts tests/photo-api-budget.test.ts tests/google-bulk-photo-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/photo-health.ts lib/google-photo-runtime.ts components/GoogleBulkPhotoRuntimeControl.tsx tests/photo-health.test.ts
git commit -m "feat: add photo coverage and targeted retries"
```

---

### Task 4: Owned / Authorized Persistent Image Layer

**Files:**
- Modify: `types/place.ts`
- Modify: `lib/place-images.ts`
- Modify: `lib/database/places.ts`
- Modify: `components/PlacePhoto.tsx`
- Extend: `supabase/v3-data-integrity-photos.sql`
- Create: `tests/owned-image-layer.test.ts`

**Interfaces:**
- Add:
  - `type PlaceImagePersistence = "owned_persistent" | "authorized_external_persistent" | "google_runtime" | "fallback"`
  - `PlaceImage.persistence?: PlaceImagePersistence`
  - persistent DB rows mapped to `Place.imageMetadata` with explicit persistence.
- Image selection priority:
  1. verified `owned_persistent`
  2. verified `authorized_external_persistent`
  3. other verified legacy persistent images
  4. Google runtime photo (only when no persistent candidate exists)
  5. fallback artwork

- [ ] **Step 1: Write source-priority and isolation tests**

```ts
import { describe, expect, it } from "vitest";
import { selectBestPlaceImage } from "@/lib/place-images";

describe("owned image layer", () => {
  it("prefers an owned persistent image over other sources", () => {
    const best = selectBestPlaceImage({
      imageMetadata: [
        { url: "https://example.com/social.jpg", source: "official_social", persistence: "authorized_external_persistent", verified: true },
        { url: "https://cdn.example.com/owned.jpg", source: "user_upload", persistence: "owned_persistent", verified: true },
      ],
    } as any);
    expect(best?.url).toContain("owned.jpg");
  });

  it("does not classify a Google runtime image as persistent", () => {
    const google = { url: "https://places.googleapis.com/runtime", source: "google_places", persistence: "google_runtime", verified: true } as const;
    expect(google.persistence).toBe("google_runtime");
  });
});
```

Add a source-contract assertion that no code writes a Google runtime URL into `amd_place_images`.

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- tests/owned-image-layer.test.ts
```

Expected: FAIL because `persistence` and `user_upload` are not defined.

- [ ] **Step 3: Expand the image types without breaking legacy rows**

In `types/place.ts`:

```ts
export type PlaceImageSource =
  | "user_upload"
  | "authorized_external"
  | "official_website"
  | "official_social"
  | "seed"
  | "google_places"
  | "fallback";

export type PlaceImagePersistence =
  | "owned_persistent"
  | "authorized_external_persistent"
  | "google_runtime"
  | "fallback";
```

Make `persistence` optional on legacy `PlaceImage` records and infer legacy behavior in `place-images.ts` so current data continues rendering.

- [ ] **Step 4: Extend production image metadata schema additively**

Add to `amd_place_images` only if absent:

```sql
alter table public.amd_place_images add column if not exists url text;
alter table public.amd_place_images add column if not exists storage_key text;
alter table public.amd_place_images add column if not exists persistence_class text;
alter table public.amd_place_images add column if not exists is_cover boolean not null default false;
alter table public.amd_place_images add column if not exists updated_at timestamptz not null default now();
```

Add a check constraint allowing only `owned_persistent` and `authorized_external_persistent` in this persistent table. Google runtime must be impossible to insert by constraint.

- [ ] **Step 5: Add the public Supabase Storage bucket and admin-only writes**

Create/ensure bucket `amd-place-images` with:

- public read URLs;
- image MIME types only (`image/jpeg`, `image/png`, `image/webp`, `image/avif`);
- 8 MB maximum object size;
- admin-only insert/update/delete policies using the same trusted admin claim pattern;
- path convention `<placeId>/<uuid>.<ext>`.

Do not put Google photo responses into this bucket.

- [ ] **Step 6: Add admin-gated metadata RPCs**

Add:

```sql
amd_upsert_place_image(
  p_place_id text,
  p_url text,
  p_storage_key text,
  p_source text,
  p_persistence_class text,
  p_attribution text,
  p_is_cover boolean
)
```

and `amd_delete_place_image(p_image_id uuid)`. Both must reject `p_source = 'google_places'` and `p_persistence_class = 'google_runtime'`.

- [ ] **Step 7: Merge `amd_place_images` into database-loaded places**

In `lib/database/places.ts`, fetch all image rows once per place-load cycle:

```ts
const { data: imageRows, error } = await supabase
  .from("amd_place_images")
  .select("id,place_id,url,storage_key,source,source_url,attribution,width,height,verified,persistence_class,is_cover,last_checked");
```

Group by `place_id`, map to `PlaceImage`, and merge into `imageMetadata` before user overlays. Do not use this path for Google runtime state.

- [ ] **Step 8: Update selection scoring and rendering**

`selectBestPlaceImage()` must rank persistence class before source/resolution. `PlacePhoto` keeps its current `persistedCandidates.length ? persistedCandidates : transientImage` structure so Google runtime remains fallback-only.

- [ ] **Step 9: Verify GREEN**

```bash
npm test -- tests/owned-image-layer.test.ts tests/photo-enrichment-safety.test.ts tests/google-transient-photo.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add types/place.ts lib/place-images.ts lib/database/places.ts components/PlacePhoto.tsx supabase/v3-data-integrity-photos.sql tests/owned-image-layer.test.ts
git commit -m "feat: add owned persistent image layer"
```

---

### Task 5: Category Coverage Targets

**Files:**
- Create: `lib/coverage-targets.ts`
- Create: `tests/coverage-targets.test.ts`

**Interfaces:**
- Produces:
  - `type CoverageGroupId = "food" | "cafe" | "mookata_hotpot" | "fitness" | "laundry" | "pharmacy" | "parking" | "convenience_market" | "services"`
  - `CATEGORY_COVERAGE_TARGETS`
  - `buildCoverageTargets(places: Place[]): CoverageTargetResult[]`
  - `nextCoveragePriority(places: Place[]): CoverageTargetResult | null`

- [ ] **Step 1: Write deficit tests**

```ts
import { describe, expect, it } from "vitest";
import { buildCoverageTargets, nextCoveragePriority } from "@/lib/coverage-targets";

describe("coverage targets", () => {
  it("counts each place once within a coverage group", () => {
    const rows = buildCoverageTargets([
      { id: "a", category: "local_food", categories: ["local_food", "noodle"] },
      { id: "b", category: "cafe", categories: ["cafe"] },
    ] as any);
    expect(rows.find((x) => x.id === "food")?.current).toBe(1);
    expect(rows.find((x) => x.id === "cafe")?.current).toBe(1);
  });

  it("prioritizes the largest proportional deficit", () => {
    const next = nextCoveragePriority([] as any);
    expect(next?.deficit).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- tests/coverage-targets.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement target config**

Initial targets sum to 100 and reflect the app's discovery focus:

```ts
export const CATEGORY_COVERAGE_TARGETS = {
  food: { target: 35, categories: ["food","local_food","noodle","thai_food","isan_food","japanese","korean_food","vietnamese_food","chinese_food","night_food","bbq"] },
  cafe: { target: 20, categories: ["cafe","bar"] },
  mookata_hotpot: { target: 8, categories: ["mookata","hotpot"] },
  fitness: { target: 7, categories: ["fitness"] },
  laundry: { target: 5, categories: ["laundry"] },
  pharmacy: { target: 5, categories: ["pharmacy","clinic"] },
  parking: { target: 5, categories: ["parking","monthly_parking"] },
  convenience_market: { target: 8, categories: ["convenience","supermarket","market"] },
  services: { target: 7, categories: ["service","salon","barber","hardware","mobile_repair","computer_repair","parcel","copy_print"] },
} as const;
```

A place counts once in the first matching group based on primary category; secondary categories are fallback only. This prevents one multi-category place inflating multiple target counts.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- tests/coverage-targets.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/coverage-targets.ts tests/coverage-targets.test.ts
git commit -m "feat: add category coverage targets"
```

---

### Task 6: Admin PR1 Panels and Replacement Workflow

**Files:**
- Create: `components/DuplicateReviewPanel.tsx`
- Create: `components/PhotoCoveragePanel.tsx`
- Create: `components/CoverageTargetPanel.tsx`
- Modify: `components/DataManagement.tsx`
- Extend: `tests/v3-admin-data-integrity.test.ts`

**Interfaces:**
- `DuplicateReviewPanel({ places, language, onChanged })`
- `PhotoCoveragePanel({ places, language })`
- `CoverageTargetPanel({ places, language, onFindReplacement })`
- `onFindReplacement(category)` opens the existing explicit Google discovery flow with the suggested category; it must not send a request by itself.

- [ ] **Step 1: Write UI source-contract tests**

```ts
it("mounts all PR1 health panels in Data Management", () => {
  const screen = read("components/DataManagement.tsx");
  expect(screen).toContain("<DuplicateReviewPanel");
  expect(screen).toContain("<PhotoCoveragePanel");
  expect(screen).toContain("<CoverageTargetPanel");
});

it("keeps replacement discovery explicit", () => {
  const panel = read("components/CoverageTargetPanel.tsx");
  expect(panel).toContain("onFindReplacement");
  expect(panel).not.toContain("fetchGoogle");
  expect(panel).not.toContain("discoverGooglePlaces");
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- tests/v3-admin-data-integrity.test.ts
```

Expected: FAIL because the panels do not exist.

- [ ] **Step 3: Implement `DuplicateReviewPanel`**

Behavior:

- show counts for hard duplicates and suspected duplicates;
- omit pairs with a persisted `both_unique` resolution;
- show reasons, similarity score, distance, Google identity status;
- buttons: `Keep A`, `Keep B`, `Merge into A/B`, `Both unique`;
- destructive actions require a second confirmation state;
- `Merge` constructs a reviewed survivor record that fills only missing survivor fields from the duplicate, never overwriting a known value with `null`;
- call the admin RPC then `onChanged()` to reload cloud places.

Do not automatically merge or delete on detection.

- [ ] **Step 4: Implement `PhotoCoveragePanel`**

Display:

- Persistent
- Runtime this session
- Missing
- Failed
- No Google photo
- Missing Place ID

Actions:

- `Load Missing Photos Only`
- `Retry Failed Only`
- `Clear Runtime Photos`
- `Clear Diagnostics`

Reuse the photo runner logic extracted from `GoogleBulkPhotoRuntimeControl`; do not duplicate Google API loops. If needed, move the runner into `lib/google-photo-bulk-runner.ts` as a focused module and test it through the existing photo tests.

- [ ] **Step 5: Implement `CoverageTargetPanel`**

Render `current / target / deficit` for every group and mark the largest proportional deficit as `NEXT PRIORITY`. The `Find replacement` button calls:

```ts
onFindReplacement(primaryCategoryForGroup(item.id));
```

No external call occurs until the existing Google discovery sheet's explicit confirm/send step.

- [ ] **Step 6: Integrate into Data Management**

Mount the panels near `DataQualityDashboard` / Google maintenance controls. For replacement discovery:

```ts
function openReplacementDiscovery(category: CategoryId) {
  setScopeCategory(category);
  setGoogleSearchOpen(true);
}
```

Keep existing admin gating. Non-admin users must not see destructive controls.

- [ ] **Step 7: Verify GREEN**

```bash
npm test -- tests/v3-admin-data-integrity.test.ts tests/data-management-admin-gate.test.ts tests/google-manual-request-architecture.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/DuplicateReviewPanel.tsx components/PhotoCoveragePanel.tsx components/CoverageTargetPanel.tsx components/DataManagement.tsx tests/v3-admin-data-integrity.test.ts
git commit -m "feat: add PR1 admin integrity panels"
```

---

### Task 7: Admin Owned-Image Management UI

**Files:**
- Create: `components/OwnedImageManager.tsx`
- Modify: `components/DataManagement.tsx`
- Extend: `tests/owned-image-layer.test.ts`

**Interfaces:**
- `OwnedImageManager({ places, language, onChanged })`
- Supports two explicit persistent inputs:
  - local file upload -> `owned_persistent`
  - authorized external URL -> `authorized_external_persistent`
- Never accepts or promotes a URL whose host/path is identified as a Google Places runtime photo endpoint.

- [ ] **Step 1: Write source-contract tests**

```ts
it("rejects Google Places runtime URLs from persistent image actions", () => {
  const manager = read("components/OwnedImageManager.tsx");
  expect(manager).toContain("isGoogleRuntimePhotoUrl");
  expect(manager).toContain("owned_persistent");
  expect(manager).toContain("authorized_external_persistent");
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- tests/owned-image-layer.test.ts
```

Expected: FAIL because `OwnedImageManager.tsx` does not exist.

- [ ] **Step 3: Implement URL safety helper**

In `lib/place-images.ts` export:

```ts
export function isGoogleRuntimePhotoUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === "places.googleapis.com" || url.hostname.endsWith("googleusercontent.com");
  } catch {
    return false;
  }
}
```

Treat this as a safety guard, not as a license determination engine. Admin still explicitly confirms that an external URL is authorized for persistence.

- [ ] **Step 4: Implement file upload**

Flow:

1. admin selects a place;
2. validate file MIME and <= 8 MB client-side;
3. upload to `amd-place-images/<placeId>/<uuid>.<ext>` with the authenticated Supabase client;
4. obtain public URL;
5. call `amd_upsert_place_image` with `source='user_upload'` and `persistence_class='owned_persistent'`;
6. reload places.

- [ ] **Step 5: Implement authorized external URL entry**

Require an explicit checkbox:

`I confirm this image is owned by me or authorized for permanent use.`

Then call the RPC with `source='authorized_external'`, `persistence_class='authorized_external_persistent'`. Reject Google runtime URLs before RPC.

- [ ] **Step 6: Add image deletion / cover selection**

List persistent rows for the selected place. Allow admin to set cover or delete the persistent metadata/object. For an uploaded storage object, delete the object after the metadata RPC succeeds or use a worker/RPC workflow that keeps operations atomic enough to report partial failure clearly.

- [ ] **Step 7: Mount inside Data Management**

Place it below `PhotoCoveragePanel`; it is admin-only and collapsed by default.

- [ ] **Step 8: Verify GREEN**

```bash
npm test -- tests/owned-image-layer.test.ts tests/data-management-admin-gate.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add components/OwnedImageManager.tsx components/DataManagement.tsx lib/place-images.ts tests/owned-image-layer.test.ts
git commit -m "feat: add owned image management"
```

---

### Task 8: Documentation, Migration Verification, Full PR Gate

**Files:**
- Modify: `README.md`
- Verify: `supabase/v3-data-integrity-photos.sql`
- Verify all PR1 test files.

**Interfaces:** None new. This task validates the complete PR1 slice and prepares it for review/merge.

- [ ] **Step 1: Update README**

Document:

- duplicate verdict semantics;
- admin-only duplicate resolution;
- production target count 100;
- photo coverage meanings;
- owned vs authorized persistent images;
- Google runtime photos are session-only and never promoted;
- `Load Missing Only` and `Retry Failed Only` remain manual Google requests;
- category coverage targets are planning guidance, not automatic crawling.

- [ ] **Step 2: Run focused PR1 tests**

```bash
npm test -- \
  tests/duplicate-guard.test.ts \
  tests/photo-health.test.ts \
  tests/coverage-targets.test.ts \
  tests/owned-image-layer.test.ts \
  tests/v3-admin-data-integrity.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Run regression tests that protect manual Google policy and existing admin behavior**

```bash
npm test -- \
  tests/photo-api-budget.test.ts \
  tests/google-bulk-photo-runtime.test.ts \
  tests/google-manual-request-architecture.test.ts \
  tests/photo-enrichment-safety.test.ts \
  tests/data-management-admin-gate.test.ts \
  tests/data-quality.test.ts
```

Expected: all PASS.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: 0 failed tests.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 6: Run production build**

```bash
npm run build
```

Expected: exit 0 and static export completes.

- [ ] **Step 7: Validate Cloudflare bundle**

```bash
npx wrangler deploy --dry-run
```

Expected: exit 0; this is validation only, not production deployment.

- [ ] **Step 8: Preflight the production migration without mutating place records**

Before `Supabase.apply_migration`, verify production invariants:

```sql
select count(*) as total_places from public.amd_places;
select count(*) as google_links, count(distinct google_place_id) as unique_google_ids
from public.amd_google_public_links
where google_place_id is not null;
select count(*) as persistent_images from public.amd_place_images;
```

Expected before migration at the current baseline: 100 places, 100 Google link rows / 100 unique Google IDs, and persistent image count may be 0 until owned images are added.

- [ ] **Step 9: Apply only the additive PR1 migration**

Use `Supabase.apply_migration` with migration name:

```text
v3_data_integrity_photos
```

Do not run the whole old `supabase/schema.sql` against production.

- [ ] **Step 10: Post-migration security verification**

Verify:

- `amd_duplicate_resolutions` exists;
- `amd_place_images` has the new columns and the persistence constraint;
- `amd_set_duplicate_resolution`, `amd_merge_duplicate_place`, `amd_upsert_place_image`, `amd_delete_place_image` are `SECURITY DEFINER` with pinned search path;
- anon cannot execute mutation RPCs;
- authenticated non-admin is rejected inside each RPC;
- existing 100 `amd_places` rows and 100 distinct Google IDs remain unchanged;
- no Google runtime URL was inserted into `amd_place_images`.

- [ ] **Step 11: Commit docs / final adjustments**

```bash
git add README.md supabase/v3-data-integrity-photos.sql
git commit -m "docs: document V3 data integrity and photo controls"
```

- [ ] **Step 12: Open PR 1**

Title:

```text
feat: add V3 data integrity and photo coverage
```

PR body must summarize:

- duplicate guard + persistent admin decisions;
- transactional reviewed duplicate merge only;
- target count / replacement guidance;
- photo coverage + missing/failed-only manual requests;
- owned/authorized persistent image layer;
- category coverage targets;
- migration/security verification;
- full test/typecheck/build/Workers dry-run results.

Do not merge until PR checks are green and review comments are resolved.

---

## Plan Self-Review

### Spec coverage

- Duplicate Guard: Tasks 1, 2, 6.
- Replacement workflow: Tasks 5, 6.
- Photo Coverage Dashboard: Tasks 3, 6.
- Missing-only / failed-only manual requests: Tasks 3, 6.
- Owned Photo Cache: Tasks 4, 7.
- Google runtime photo isolation: Tasks 3, 4, 7.
- Category coverage targets: Tasks 5, 6.
- Admin-only destructive operations: Tasks 2, 6.
- No automatic Google requests: Global Constraints + Tasks 3, 6, 8.
- Production-safe `amd_*` migration: Tasks 2, 4, 8.

### Placeholder scan

No TBD/TODO/"implement later" steps remain. Each new interface is named before downstream use.

### Type consistency

The plan uses one duplicate verdict model, one runtime photo outcome model, one persistent image classification model, and one coverage target result model throughout. Google runtime images never enter the persistent image model or table.
