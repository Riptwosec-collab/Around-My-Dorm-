# Around My Dorm Hybrid Google Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Around My Dorm use one verified `บ้านสุภาอพาร์ทเม้นต์` origin, enrich all existing places from Google without destroying curated data, render every coordinate-bearing place as an app marker, and add manually triggered cached Routes data through a secret-bearing Cloudflare Worker.

**Architecture:** Keep the current Next.js static export for the PWA and add a small Cloudflare Worker front controller for `/api/*`; all other requests fall through to the existing static `ASSETS` binding. Browser-side Google Maps/Places remains explicit/manual and uses the referrer-restricted public key. Supabase remains the canonical app database plus bounded Google/route caches; Google Place IDs are durable external identities, while Google content uses bounded caches and provenance-aware merge rules.

**Tech Stack:** Next.js 15 static export, React 19, TypeScript 5.8, Vitest, Playwright, Supabase JS/Postgres/RLS, Cloudflare Workers + static assets, Google Maps JavaScript API, Places API (New), Routes API.

**Spec:** `docs/superpowers/specs/2026-09-12-around-my-dorm-hybrid-google-integration-design.md`

## Global Constraints

- Preserve all 91 existing canonical places, IDs, slugs, categories, saved URLs, favorites, LOCAL/CHAIN/Famous/Hidden Gem metadata, notes, pricing, parking, and existing functionality.
- `บ้านสุภาอพาร์ทเม้นต์` is the only authoritative HOME/origin after verification; never guess its coordinates.
- Ordinary browsing must not call Places Search, Place Details, Nearby Search, Routes, or bulk photo endpoints.
- All cost-bearing bulk operations are explicit user/admin actions with confirmation, progress, caps, and diagnostics.
- Manual/curated values outrank Google values; Google may only fill missing/weaker fields and must never overwrite useful curated values with null/unknown.
- Missing values display `ไม่มีข้อมูล` or equivalent; never fabricate address, phone, hours, rating, price, parking, or route times.
- Google Place IDs may be durable; Google content remains bounded by the app's cache policy and platform requirements.
- Browser key stays public/referrer-restricted. `GOOGLE_MAPS_SERVER_API_KEY` is a Cloudflare secret and is never emitted into client bundles.
- Routes bulk operations require a real authenticated admin session; anonymous sessions are not admin authorization.
- Keep current dark/futuristic UI, PWA behavior, touch support, and iPhone safe-area handling.
- Each task follows TDD: failing test first, minimal implementation, passing test, full relevant suite, then commit.

---

### Task 1: Establish HOME origin model, repository, and database schema

**Files:**
- Modify: `types/place.ts`
- Create: `lib/home-origin.ts`
- Create: `tests/home-origin.test.ts`
- Create: `supabase/hybrid-google-platform.sql`

**Interfaces:**
- Produces `HomeOrigin`, `loadHomeOrigin()`, `saveVerifiedHomeOrigin()`, `isUsableHomeOrigin()`.
- Later tasks consume the verified origin for map center, distance, Places bias, and Routes.

- [ ] **Step 1: Write failing HOME repository tests**

```ts
import { describe, expect, it } from "vitest";
import { isUsableHomeOrigin } from "@/lib/home-origin";

describe("HOME origin", () => {
  it("rejects unresolved HOME records", () => {
    expect(isUsableHomeOrigin({ googlePlaceId: null, latitude: null, longitude: null } as any)).toBe(false);
  });

  it("accepts only a verified Google/manual origin with valid coordinates", () => {
    expect(isUsableHomeOrigin({
      googlePlaceId: "ChIJ-home",
      latitude: 13.82,
      longitude: 100.58,
      verifiedAt: "2026-09-12T00:00:00Z",
    } as any)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm test -- tests/home-origin.test.ts`

Expected: FAIL because `@/lib/home-origin` does not exist.

- [ ] **Step 3: Add focused HOME types and repository functions**

Add to `types/place.ts`:

```ts
export type HomeOrigin = {
  id: "baan-supha-apartment";
  nameTh: "บ้านสุภาอพาร์ทเม้นต์";
  nameEn: string | null;
  googlePlaceId: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string | null;
  resolvedAt: string | null;
  verifiedAt: string | null;
  source: "google_places" | "manual_verified" | "unresolved";
};
```

Create `lib/home-origin.ts` with:

```ts
export async function loadHomeOrigin(): Promise<HomeOrigin | null>;
export async function saveVerifiedHomeOrigin(origin: HomeOrigin): Promise<void>;
export function isUsableHomeOrigin(value: Pick<HomeOrigin, "googlePlaceId" | "latitude" | "longitude" | "verifiedAt">): boolean;
```

Validation requires finite latitude `[-90,90]`, longitude `[-180,180]`, non-empty Place ID, and `verifiedAt`.

- [ ] **Step 4: Add the schema migration SQL file**

`supabase/hybrid-google-platform.sql` must define:

```sql
create table if not exists public.amd_home_origin (
  id text primary key check (id = 'baan-supha-apartment'),
  name_th text not null,
  name_en text,
  google_place_id text,
  formatted_address text,
  latitude double precision,
  longitude double precision,
  google_maps_url text,
  resolved_at timestamptz,
  verified_at timestamptz,
  source text not null check (source in ('google_places','manual_verified','unresolved')),
  updated_at timestamptz not null default now()
);
```

Enable RLS. Grant public SELECT only. Admin writes are added in Task 2 after authorization exists.

- [ ] **Step 5: Run targeted and type tests**

Run:

```bash
npm test -- tests/home-origin.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add types/place.ts lib/home-origin.ts tests/home-origin.test.ts supabase/hybrid-google-platform.sql
git commit -m "feat: add verified home origin model"
```

---

### Task 2: Add real admin authorization for cost-bearing operations

**Files:**
- Create: `lib/admin-auth.ts`
- Create: `components/AdminGoogleAccess.tsx`
- Modify: `components/DataManagement.tsx`
- Modify: `lib/cloud/supabase.ts`
- Append: `supabase/hybrid-google-platform.sql`
- Test: `tests/admin-auth.test.ts`

**Interfaces:**
- Produces `getAdminAccessState()`, `requireAdminSessionToken()`, and `AdminGoogleAccess`.
- Browser bulk Places and route refresh controls remain disabled until admin authorization is true.

- [ ] **Step 1: Write failing authorization tests**

```ts
it("does not treat anonymous Supabase users as Google admins", () => {
  expect(isAuthorizedAdmin({ is_anonymous: true, app_metadata: { amd_admin: true } } as any)).toBe(false);
});

it("accepts a non-anonymous user with server-controlled app_metadata", () => {
  expect(isAuthorizedAdmin({ is_anonymous: false, app_metadata: { amd_admin: true } } as any)).toBe(true);
});
```

- [ ] **Step 2: Run test and confirm RED**

Run: `npm test -- tests/admin-auth.test.ts`

- [ ] **Step 3: Implement authorization helpers**

```ts
export function isAuthorizedAdmin(user: User | null): boolean;
export async function getAdminAccessState(): Promise<{ authenticated: boolean; admin: boolean; email: string | null }>;
export async function requireAdminSessionToken(): Promise<string>;
```

`isAuthorizedAdmin()` must reject `user.is_anonymous === true` and require `user.app_metadata.amd_admin === true`.

- [ ] **Step 4: Add minimal admin login/access UI**

`AdminGoogleAccess` exposes email sign-in using the Supabase-supported configured flow, sign-out, and an explicit status badge. Data Management Google bulk controls receive `adminAllowed` and are disabled otherwise.

- [ ] **Step 5: Add database policy support**

Add an `amd_is_admin()` SQL helper as `security invoker` where possible; do not use a public `SECURITY DEFINER` bypass. Write policies that allow HOME/cache admin updates only for authenticated non-anonymous users whose JWT `app_metadata.amd_admin` is true.

- [ ] **Step 6: Verify**

```bash
npm test -- tests/admin-auth.test.ts
npm run typecheck
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add lib/admin-auth.ts components/AdminGoogleAccess.tsx components/DataManagement.tsx lib/cloud/supabase.ts tests/admin-auth.test.ts supabase/hybrid-google-platform.sql
git commit -m "feat: gate Google maintenance behind admin auth"
```

---

### Task 3: Expand Google place cache payload and preserve curated data

**Files:**
- Modify: `types/place.ts`
- Modify: `lib/google-live.ts`
- Modify: `lib/google-cloud-enrichment.ts`
- Test: `tests/google-cloud-enrichment.test.ts`
- Test: `tests/google-place-details.test.ts`

**Interfaces:**
- Extends cached Google details with supported names, types, phones, accessibility/service flags, photos metadata, and timestamps.
- Produces `mergeGoogleCloudPayload(place, placeId, payload)` with explicit manual-data precedence.

- [ ] **Step 1: Add failing merge-priority tests**

Test that curated `priceText`, parking notes, hiddenGem, LOCAL/CHAIN, custom category, existing phone, and manual images survive a richer Google payload.

```ts
expect(merged.priceText).toBe("50–80 บาท");
expect(merged.parking.note).toBe("จอดข้างร้านหลัง 18:00");
expect(merged.hiddenGem).toBe(true);
expect(merged.phone).toBe("02-111-2222");
expect(merged.address).toBe("Google verified address"); // only because local address was null
```

- [ ] **Step 2: Run tests and confirm RED for newly supported fields**

Run: `npm test -- tests/google-cloud-enrichment.test.ts tests/google-place-details.test.ts`

- [ ] **Step 3: Extend live Google detail selection**

Add only fields supported by Places API (New) in the current JS library, mapping absent values to null. Keep `photos` as reference/attribution metadata rather than permanently downloading image bytes.

- [ ] **Step 4: Extend bounded cache payload**

Add fields such as:

```ts
nameTh: string | null;
nameEn: string | null;
types: string[];
internationalPhone: string | null;
photos: Array<{ reference: string; attribution: string | null; width: number | null; height: number | null }>;
accessibility: Record<string, boolean | null>;
services: { dineIn: boolean | null; takeaway: boolean | null; delivery: boolean | null; reservable: boolean | null };
googleLastUpdatedAt: string;
```

- [ ] **Step 5: Implement provenance-aware merge**

Never overwrite an existing meaningful manual value with null or a weaker Google value. Google may populate null fields and Google-specific metadata. Preserve `fieldProvenance` entries.

- [ ] **Step 6: Verify**

```bash
npm test -- tests/google-cloud-enrichment.test.ts tests/google-place-details.test.ts
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add types/place.ts lib/google-live.ts lib/google-cloud-enrichment.ts tests/google-cloud-enrichment.test.ts tests/google-place-details.test.ts
git commit -m "feat: enrich Google place details without overwriting curated data"
```

---

### Task 4: Resolve and verify บ้านสุภาอพาร์ทเม้นต์ from Google

**Files:**
- Create: `lib/home-origin-resolver.ts`
- Create: `components/HomeOriginManager.tsx`
- Modify: `components/DataManagement.tsx`
- Modify: `lib/google-request-manager.ts`
- Test: `tests/home-origin-resolver.test.ts`

**Interfaces:**
- Produces `searchHomeOriginCandidates()`, `assessHomeOriginCandidate()`, `confirmHomeOrigin()`.
- Uses existing manual Google request boundary; no automatic request on render.

- [ ] **Step 1: Write failing candidate scoring tests**

Require exact/near name agreement plus Bangkok/known-area consistency. Never accept a candidate solely because it is nearest to the current approximate map center.

- [ ] **Step 2: Run RED test**

Run: `npm test -- tests/home-origin-resolver.test.ts`

- [ ] **Step 3: Implement resolver**

Use query variants beginning with the exact Thai name `บ้านสุภาอพาร์ทเม้นต์`, then known address clues already present in app data. Return scored candidates with Google Place ID/address/coordinates/Maps URL.

- [ ] **Step 4: Implement manager UI**

Show unresolved state, candidate list, confidence, address, map link, and `ยืนยันเป็น HOME` action. No candidate is persisted until explicit confirmation unless the strict unambiguous threshold passes and the user confirms the bulk operation.

- [ ] **Step 5: Replace hard-coded origin consumers with repository-backed origin**

Keep existing hard-coded value only as a non-authoritative UI fallback while unresolved; diagnostics must label it `UNVERIFIED FALLBACK` and Routes must refuse to run against it.

- [ ] **Step 6: Verify**

```bash
npm test -- tests/home-origin-resolver.test.ts
npm run typecheck
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add lib/home-origin-resolver.ts components/HomeOriginManager.tsx components/DataManagement.tsx lib/google-request-manager.ts tests/home-origin-resolver.test.ts
git commit -m "feat: resolve and verify Baan Supha home origin"
```

---

### Task 5: Make bulk Google enrichment process all 91 places safely and deduplicate identities

**Files:**
- Modify: `lib/google-cloud-enrichment.ts`
- Modify: `lib/google-place-id-manager.ts`
- Modify: `components/GoogleCloudAutoEnrichment.tsx`
- Test: `tests/google-cloud-enrichment.test.ts`
- Test: `tests/google-place-id-manager.test.ts`

**Interfaces:**
- Bulk runner continues through review candidates, details fetch, and cache write without silently stopping.
- Produces duplicate diagnostics when two internal places claim one Google Place ID.

- [ ] **Step 1: Add failing 91-place continuation regression**

Use mocked search/details calls for three representative records: clear match, review match, and zero-result. Assert the loop reaches all records unless explicit cancellation/systemic failure/safety cap occurs.

- [ ] **Step 2: Add failing duplicate identity test**

Two different local IDs resolving to the same Google Place ID must not both become `linked`; second becomes review/duplicate diagnostic.

- [ ] **Step 3: Implement minimal runner corrections**

Preserve fail-fast for systemic errors. Per-place `ZERO_RESULTS` increments skipped/review and continues. A review candidate with coordinates/details is cached for display but is not treated as a verified identity.

- [ ] **Step 4: Improve progress UI**

Display `processed / total`, `linked`, `review`, `cached`, `skipped`, `failed`, exact stopped reason, and a `Continue remaining` action when a safety cap stops the run.

- [ ] **Step 5: Verify**

```bash
npm test -- tests/google-cloud-enrichment.test.ts tests/google-place-id-manager.test.ts
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add lib/google-cloud-enrichment.ts lib/google-place-id-manager.ts components/GoogleCloudAutoEnrichment.tsx tests/google-cloud-enrichment.test.ts tests/google-place-id-manager.test.ts
git commit -m "fix: complete bulk Google enrichment and protect duplicate identities"
```

---

### Task 6: Add Cloudflare Worker front controller and secret Routes client

**Files:**
- Create: `worker/index.ts`
- Create: `worker/admin-auth.ts`
- Create: `worker/google-routes.ts`
- Modify: `wrangler.jsonc`
- Modify: `.env.example`
- Test: `tests/worker-routes.test.ts`

**Interfaces:**
- Worker routes `/api/routes/refresh` and `/api/routes/place/:id`.
- Non-API requests call `env.ASSETS.fetch(request)` so the existing static export remains unchanged.
- Consumes `GOOGLE_MAPS_SERVER_API_KEY`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` from Worker bindings/secrets.

- [ ] **Step 1: Write failing Worker routing/auth tests**

```ts
it("serves static assets for non-api requests", async () => { /* ASSETS.fetch called */ });
it("returns 401 for route refresh without bearer token", async () => { /* expect 401 */ });
it("never exposes GOOGLE_MAPS_SERVER_API_KEY in response bodies", async () => { /* expect not.toContain */ });
```

- [ ] **Step 2: Run RED tests**

Run: `npm test -- tests/worker-routes.test.ts`

- [ ] **Step 3: Convert Wrangler from assets-only to Worker + assets binding**

Use:

```jsonc
{
  "main": "worker/index.ts",
  "assets": {
    "directory": "./out",
    "binding": "ASSETS",
    "html_handling": "force-trailing-slash",
    "not_found_handling": "404-page"
  }
}
```

- [ ] **Step 4: Verify admin token server-side**

Call Supabase Auth `/auth/v1/user` with the supplied bearer token and publishable key. Reject missing/invalid token, anonymous user, or user without `app_metadata.amd_admin === true`.

- [ ] **Step 5: Implement Google Routes request client**

`worker/google-routes.ts` exposes:

```ts
export async function computeRouteMatrix(env, input: {
  origin: { latitude: number; longitude: number };
  destinations: Array<{ id: string; latitude: number; longitude: number }>;
  mode: "WALK" | "DRIVE" | "TWO_WHEELER";
}): Promise<RouteResult[]>;
```

Use explicit field masks and bounded destination batches. Convert Google errors into stable app error codes; never leak the secret key.

- [ ] **Step 6: Verify worker bundle**

```bash
npm test -- tests/worker-routes.test.ts
npm run typecheck
npm run build
npx wrangler deploy --dry-run
```

- [ ] **Step 7: Commit**

```bash
git add worker wrangler.jsonc .env.example tests/worker-routes.test.ts
git commit -m "feat: add authenticated Cloudflare Routes proxy"
```

---

### Task 7: Add route cache schema, client repository, and manual route refresh UI

**Files:**
- Create: `lib/route-cache.ts`
- Create: `components/GoogleRouteRefresh.tsx`
- Modify: `types/place.ts`
- Modify: `lib/database/places.ts`
- Modify: `components/DataManagement.tsx`
- Append: `supabase/hybrid-google-platform.sql`
- Test: `tests/route-cache.test.ts`

**Interfaces:**
- Produces `loadRouteCache()`, `mergeRouteCacheIntoPlaces()`, `refreshRoutesForPlaces()`.
- Route data populates walking/driving/two-wheel fields only from Google responses; unavailable mode remains null.

- [ ] **Step 1: Add failing route merge tests**

Assert route distance/time populates legacy UI fields while straight-line distance is retained. Assert missing TWO_WHEELER result leaves motorcycle time null.

- [ ] **Step 2: Add `amd_route_cache` schema**

Primary key `(origin_id, place_id, travel_mode)` with distance meters, duration seconds, status, fetched/expires timestamps, and source. Enable RLS public read; admin write only.

- [ ] **Step 3: Implement repository and place merge**

Map seconds → rounded UI minutes, preserve raw seconds/meters, and set `routeLastUpdatedAt`.

- [ ] **Step 4: Implement manual admin refresh**

Show eligible destination count, operation estimate, confirmation, progress, success/skipped/failed counts. Call Worker only after explicit confirmation and valid HOME origin.

- [ ] **Step 5: Verify**

```bash
npm test -- tests/route-cache.test.ts
npm run typecheck
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add lib/route-cache.ts components/GoogleRouteRefresh.tsx types/place.ts lib/database/places.ts components/DataManagement.tsx supabase/hybrid-google-platform.sql tests/route-cache.test.ts
git commit -m "feat: cache and display Google route data"
```

---

### Task 8: Make map/list/filter/radius use one place collection and expose all valid app markers

**Files:**
- Modify: `components/AroundMyDormApp.tsx`
- Modify: `components/GoogleMapsMap.tsx`
- Modify: `components/PlaceCard.tsx` if present; otherwise the existing card component used by `AroundMyDormApp`
- Modify: `components/FilterSheet.tsx`
- Test: `tests/map-place-selection.test.tsx`
- E2E: `e2e/map-markers.spec.ts`

**Interfaces:**
- One derived `visiblePlaces` collection feeds both cards and map.
- `selectedPlaceId` drives both marker highlight and card highlight.

- [ ] **Step 1: Write failing marker-count/filter tests**

For a fixture of 5 filtered places where 4 have coordinates, assert `4` app markers and `1` HOME marker. Applying `cafe` filter must reduce both card count and marker count consistently.

- [ ] **Step 2: Create one memoized visible-place derivation**

Order: search/category/quick filters → radius from verified HOME → sort. Map receives exactly this collection; it does not independently re-filter by category.

- [ ] **Step 3: Implement bidirectional selection**

Card click: set selected ID, pan/zoom, open map card. Marker click: set selected ID and scroll matching card into view without navigation/full reload.

- [ ] **Step 4: Keep clustering and improve category marker semantics**

Retain current clustering engine. Replace plain dots with compact category-specific icon content where legible; HOME remains blue/home/pulse and highest z-index.

- [ ] **Step 5: Radius controls**

Support `500m`, `1km`, `2km`, `3km`, `5km`; default remains current configured radius. Circle and visible result count update without Google network requests.

- [ ] **Step 6: Verify**

```bash
npm test -- tests/map-place-selection.test.tsx
npm run test:e2e -- e2e/map-markers.spec.ts
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add components/AroundMyDormApp.tsx components/GoogleMapsMap.tsx components/FilterSheet.tsx tests/map-place-selection.test.tsx e2e/map-markers.spec.ts
git commit -m "feat: synchronize app cards filters radius and map markers"
```

---

### Task 9: Add manual Search This Area and safe Google Maps link fallbacks

**Files:**
- Modify: `components/GoogleDiscoverySheet.tsx`
- Modify: `components/GoogleMapsMap.tsx`
- Create: `lib/google-maps-link.ts`
- Test: `tests/google-maps-link.test.ts`
- Test: `tests/google-discovery-manual.test.tsx`

**Interfaces:**
- Produces `buildGoogleMapsDestinationUrl(place)`.
- Search runs only from `ค้นหาในพื้นที่นี้ / Search This Area` button.

- [ ] **Step 1: Write URL fallback tests**

Priority: Google Maps URL → Place ID query URL → coordinates → name+address. No valid identity returns a disabled button state rather than a broken URL.

- [ ] **Step 2: Verify discovery remains manual**

Add component test proving pan/zoom callbacks do not invoke Places discovery. Explicit Search This Area click invokes exactly one discovery call.

- [ ] **Step 3: Implement deduplicated candidate presentation**

Candidates matching an existing durable Google Place ID are labelled existing, not insertable duplicates. Import/merge remains explicit.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/google-maps-link.test.ts tests/google-discovery-manual.test.tsx
npm run typecheck
git add components/GoogleDiscoverySheet.tsx components/GoogleMapsMap.tsx lib/google-maps-link.ts tests/google-maps-link.test.ts tests/google-discovery-manual.test.tsx
git commit -m "feat: add manual map-area discovery and reliable Maps links"
```

---

### Task 10: Display Google details/photos/attribution and explicit unavailable states

**Files:**
- Modify: `components/PlaceDetail.tsx`
- Modify: `components/PlaceRouteClient.tsx`
- Modify: `app/globals.css`
- Test: `tests/place-detail-google-data.test.tsx`

**Interfaces:**
- UI consumes only cached merged place data; opening a detail page must issue zero Places/Routes requests.

- [ ] **Step 1: Add failing detail rendering tests**

Test address, rating/review count, opening state, phone, website, Google Maps link, price level, route distance/times, photo attribution, and `ไม่มีข้อมูล` for absent values.

- [ ] **Step 2: Implement photo gallery**

Render at most 3 initially cached/allowed Google photo references with lazy loading and attribution; curated local images remain first priority when present.

- [ ] **Step 3: Implement route/unavailable display**

Walking/driving/two-wheel values show only when cached data exists. TWO_WHEELER unavailable stays `ไม่มีข้อมูล` and includes the required route caution copy when data exists.

- [ ] **Step 4: Verify no request-on-render regression**

Mock request manager and assert zero calls during `PlaceDetail` render/navigation.

- [ ] **Step 5: Verify and commit**

```bash
npm test -- tests/place-detail-google-data.test.tsx
npm run typecheck
npm run build
git add components/PlaceDetail.tsx components/PlaceRouteClient.tsx app/globals.css tests/place-detail-google-data.test.tsx
git commit -m "feat: show cached Google details routes and photo attribution"
```

---

### Task 11: Add comprehensive Google/map/admin diagnostics

**Files:**
- Create: `lib/google-platform-diagnostics.ts`
- Create: `components/GooglePlatformDiagnostics.tsx`
- Modify: `components/DataManagement.tsx`
- Test: `tests/google-platform-diagnostics.test.ts`

**Interfaces:**
- Produces `buildGooglePlatformDiagnostics(places, origin, links, caches, routes)`.

- [ ] **Step 1: Write failing diagnostic aggregation test**

Assert counts for total, matched, missing Place ID, coordinates, missing coordinates, visible markers, duplicate Place IDs, stale Google data, missing routes, missing photos, API errors.

- [ ] **Step 2: Implement pure aggregator**

No Google calls. All metrics derive from current app/Supabase data.

- [ ] **Step 3: Implement diagnostics UI**

Include `Missing Map Location` list and per-row `ค้นหาพิกัดจาก Google` explicit action. Show duplicate IDs and stale cache lists.

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/google-platform-diagnostics.test.ts
npm run typecheck
git add lib/google-platform-diagnostics.ts components/GooglePlatformDiagnostics.tsx components/DataManagement.tsx tests/google-platform-diagnostics.test.ts
git commit -m "feat: add Google platform and map coverage diagnostics"
```

---

### Task 12: Apply Supabase schema safely and verify RLS/data preservation

**Files:**
- Finalize: `supabase/hybrid-google-platform.sql`
- Modify: `README.md`

**Interfaces:**
- Creates/updates HOME and route-cache tables and required policies without deleting or replacing `amd_places`.

- [ ] **Step 1: Snapshot production invariants before migration**

SQL checks:

```sql
select count(*) from public.amd_places; -- must remain 91
select count(distinct id) from public.amd_places; -- must remain 91
```

- [ ] **Step 2: Apply schema migration via Supabase migration tool**

No destructive DROP/TRUNCATE of canonical tables. Enable RLS on every new exposed table. Explicit grants only for the operations required by browser/admin roles.

- [ ] **Step 3: Verify policies and invariants**

Check `pg_policies`, grants, HOME table visibility, route cache visibility, and canonical row count `91`.

- [ ] **Step 4: Run Supabase security advisor and document unrelated pre-existing findings separately**

Do not claim the whole project is warning-free unless the advisor is actually clean.

- [ ] **Step 5: Document required Cloudflare secret**

README instructions:

```bash
wrangler secret put GOOGLE_MAPS_SERVER_API_KEY
```

Also document that Routes API must be enabled and the server key API-restricted.

- [ ] **Step 6: Commit documentation/migration finalization**

```bash
git add supabase/hybrid-google-platform.sql README.md
git commit -m "docs: finalize Google platform schema and deployment requirements"
```

---

### Task 13: Full regression, production build, deployment, and acceptance verification

**Files:**
- Modify as needed only to fix failures exposed by verification.
- E2E: `e2e/google-platform-acceptance.spec.ts`

**Interfaces:**
- No new feature interfaces; this task proves the integrated system.

- [ ] **Step 1: Add acceptance E2E cases**

Cover:

```text
HOME unresolved -> Routes disabled
HOME verified -> map centers on verified origin
filtered coordinate-bearing places -> same card/marker count
marker selection -> matching card selected
card selection -> marker selected/map pans
place detail -> cached Google fields, no request-on-render
missing coordinates -> diagnostics row
manual Search This Area -> one request only after click
bulk admin controls -> unavailable to non-admin/anonymous users
```

- [ ] **Step 2: Run full automated verification**

```bash
npm run lint
npm run typecheck
npm run validate:data
npm test
npm run build
npx wrangler deploy --dry-run
npm run test:e2e
```

Expected: all commands PASS. Record exact counts/results in the completion report.

- [ ] **Step 3: Verify production data preservation**

Re-check Supabase canonical count and duplicate IDs. Expected: 91 canonical rows, no unintended deletions.

- [ ] **Step 4: Verify secret/config blocker before production deploy**

Production route functionality requires `GOOGLE_MAPS_SERVER_API_KEY` to exist in Cloudflare and Routes API to be enabled. If missing, stop before claiming Routes production-ready; the rest of the client/database work may still be deployable.

- [ ] **Step 5: Deploy and inspect Cloudflare check run**

Deploy only after all checks pass. Confirm Cloudflare Worker build `completed/success` and record production Version ID.

- [ ] **Step 6: Live acceptance**

Using explicit admin actions only, verify the 23 final-verification requirements from the design spec, including HOME identity, marker coverage, filters, radius, Maps links, cached details, routes, mobile layout, no console/build errors, and no automatic Google requests during normal browsing.

- [ ] **Step 7: Commit any verification-only test additions**

```bash
git add e2e/google-platform-acceptance.spec.ts
git commit -m "test: verify hybrid Google platform acceptance flow"
```

---

## Plan self-review

- **Spec coverage:** HOME, Places enrichment, durable external identity, duplicate protection, manual-data precedence, bounded cache, secret Routes Worker, walking/driving/two-wheel routes, all coordinate-bearing markers, clustering, card/marker sync, filters, radius, Search This Area, Maps links, photos/attribution, admin diagnostics, auth/cost control, mobile/error/performance constraints, and production verification are mapped to Tasks 1–13.
- **Static-export constraint addressed:** current `next.config.ts` uses `output: "export"`, so Task 6 adds a Worker front controller while retaining the static `out` asset bundle instead of introducing unsupported Next server routes.
- **No placeholder work:** every task names concrete files, interfaces, tests, commands, and success conditions.
- **Type consistency:** HOME uses `HomeOrigin`; routes use raw meters/seconds plus the existing `PlaceDistance` compatibility fields; cached Google details merge through one enrichment layer rather than parallel canonical records.
- **Operational blocker is explicit:** server Routes cannot be declared production-ready until the Cloudflare secret exists and Routes API is enabled.
