# Around My Dorm — Hybrid Google Maps / Places / Routes Integration Design

Date: 2026-09-12
Status: Approved design, pending implementation plan
Repository: `Riptwosec-collab/Around-My-Dorm-`

## 1. Objective

Upgrade Around My Dorm into a curated local discovery application powered by Google Maps Platform while preserving all existing application data, manually curated classifications, URLs, categories, filters, UI behavior, and current functionality.

The system must use `บ้านสุภาอพาร์ทเม้นต์` as the single authoritative HOME / origin for map centering, radius filtering, distance sorting, nearby search bias, and route calculations.

The implementation must not guess coordinates, phone numbers, opening hours, prices, parking, ratings, routes, or addresses. Unknown values remain explicitly unavailable in the UI.

## 2. Existing System Constraints

The current application already provides important foundations and these should be extended rather than replaced:

- `Place` already contains Google Place ID, coordinates, rating, reviews, Google Maps URL, opening-hours fields, pricing, parking, images, distance fields, source metadata, and field-level provenance.
- The current Google map already provides a distinct Home marker, radius circle, custom business markers, category coloring, marker clustering, and marker selection.
- The application already contains manual Google → Supabase enrichment, short-lived shared Google cache, match/review state, diagnostics, and cost-control behavior.
- The production dataset currently contains 91 canonical application places. Existing IDs, slugs, curated categories, custom LOCAL/CHAIN/Famous/Hidden Gem metadata, notes, pricing, and parking data must remain stable.
- Ordinary application browsing must not issue Places, Search, Place Details, Nearby Search, or Routes requests. Google data requests remain explicit user/admin actions.

## 3. Architecture Decision

Use a Hybrid architecture.

### Browser responsibilities

The browser owns:

- Google Maps JavaScript rendering.
- Existing app markers and clusters.
- Explicit manual Places enrichment actions that already use the browser-restricted Maps key.
- `Search This Area` only after a direct user action.
- Reading already cached Google-derived place data from Supabase.
- Filtering, sorting, card/marker synchronization, radius interaction, and UI state.

### Cloudflare/server responsibilities

Cloudflare owns privileged operations that should not expose credentials to the browser:

- Google Routes API calls.
- Route-matrix batching.
- Route refresh orchestration.
- Server-side validation of request limits.
- Server-side use of `GOOGLE_MAPS_SERVER_API_KEY`, stored as a Cloudflare secret and restricted to only required server APIs.

The existing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` remains the browser key and remains restricted by website referrer plus required browser-side APIs.

### Supabase responsibilities

Supabase remains the source of truth for:

- Canonical app records.
- Curated/manual metadata.
- Resolved HOME identity/configuration.
- Durable Google Place IDs.
- Bounded Google Places content cache.
- Route cache.
- Matching/review state.
- Diagnostics and enrichment status.

## 4. HOME / Origin Resolution

Create one authoritative HOME configuration record for `บ้านสุภาอพาร์ทเม้นต์`.

Proposed logical model:

```ts
HomeOrigin {
  id: "baan-supha-apartment",
  nameTh: "บ้านสุภาอพาร์ทเม้นต์",
  nameEn: string | null,
  googlePlaceId: string,
  formattedAddress: string,
  latitude: number,
  longitude: number,
  googleMapsUrl: string,
  resolvedAt: string,
  verifiedAt: string,
  source: "google_places" | "manual_verified"
}
```

Resolution rules:

1. Search exact app data first for an existing Google Place ID or independently verified coordinate/address.
2. If unavailable, perform an explicit Google Places Text Search using the exact Thai name plus known neighborhood/address clues.
3. Compare candidate name, address/area, and geographic consistency.
4. Auto-accept only when the result is unambiguous and meets a strict confidence threshold.
5. If candidates are ambiguous, show an admin confirmation UI. Do not guess.
6. Once verified, all map/radius/sorting/routing systems read the HOME record rather than a scattered hard-coded coordinate constant.
7. A fallback hard-coded HOME coordinate must not become authoritative unless independently verified and explicitly marked as manual-verified.

## 5. Place Identity and Matching

Each application place retains its existing internal `id` and `slug`. Google Place ID is an external identity, never a replacement primary key.

Matching flow for every existing place:

1. Read current name, Thai/English aliases, area, soi, address, phone/website if available, and coordinates if already verified.
2. Query Google Places only during a user-confirmed enrichment run.
3. Score candidates using normalized name, address/area agreement, coordinate proximity when available, and category/type compatibility.
4. Check whether the Google Place ID is already linked to a different app place.
5. Auto-link only high-confidence and unambiguous matches.
6. Put ambiguous matches into Review instead of guessing.
7. Never insert a duplicate canonical app shop as part of enrichment.

Duplicate detection priority:

1. Exact Google Place ID.
2. Existing verified coordinate proximity.
3. Normalized business name.
4. Address agreement.

If two canonical app records resolve to the same Google Place ID, diagnostics must flag them as a possible duplicate for manual merge review. Automatic destructive merging is out of scope for the first implementation phase.

## 6. Data Priority and Merge Rules

The merge priority is:

1. Explicit manually curated / manual-verified app data.
2. Official source data already marked stronger than Google.
3. Google verified data.
4. Computed routing data.
5. Seed/unverified data.
6. Unknown.

Google enrichment may fill missing values but must not replace stronger curated values with null, less-specific values, or weaker information.

Examples that must remain protected:

- custom price ranges,
- LOCAL / CHAIN classification,
- Famous classification,
- Hidden Gem classification,
- app categories,
- personal notes,
- parking notes and parking prices,
- special recommendations,
- manually verified URLs.

Every merged Google field must retain provenance and checked/updated timestamps.

## 7. Google Places Data Model

Extend the current `Place` model rather than replacing it.

The logical Google-derived layer should support, when Google actually provides the fields:

```ts
GooglePlaceData {
  placeId: string,
  displayName: string | null,
  nameTh: string | null,
  nameEn: string | null,
  formattedAddress: string | null,
  shortFormattedAddress: string | null,
  latitude: number | null,
  longitude: number | null,
  mapsUrl: string | null,
  primaryType: string | null,
  types: string[],
  businessStatus: string | null,
  openNow: boolean | null,
  regularOpeningHours: unknown | null,
  currentOpeningHours: unknown | null,
  weekdayDescriptions: string[],
  nextOpenTime: string | null,
  nextCloseTime: string | null,
  phone: string | null,
  internationalPhone: string | null,
  website: string | null,
  rating: number | null,
  reviewCount: number | null,
  priceLevel: string | null,
  accessibility: Record<string, boolean | null> | null,
  dineIn: boolean | null,
  takeaway: boolean | null,
  delivery: boolean | null,
  reservable: boolean | null,
  parkingOptions: Record<string, boolean | null> | null,
  paymentOptions: Record<string, boolean | null> | null,
  photoRefs: GooglePhotoRef[],
  lastUpdatedAt: string
}
```

The implementation should map useful values back into existing top-level `Place` fields so existing UI remains compatible while preserving a structured Google layer for richer UI.

## 8. Google Content Storage and Policy Guardrails

Google Place IDs may be retained as durable external identifiers.

Other Google Maps Platform content must only be cached/stored within current Google Maps Platform policy allowances. The implementation must verify current product-specific policy before committing persistence behavior.

Initial policy-safe design:

- Place ID: durable.
- Google Place Details content: bounded cache with expiry; use the existing short-lived shared cache model rather than permanent canonical overwrite.
- Photos: store permitted reference/metadata and required attribution; do not copy/store full Google photo binaries as app-owned permanent assets.
- Route results: use a bounded route cache whose TTL is configurable and compliant with current Routes terms.
- Manual independently verified values may become canonical app data when explicitly approved, rather than being treated as permanently cached Google content.

No Google HTML scraping is permitted.

## 9. Route Architecture

All routes originate from the verified HOME record.

Required travel data where supported:

```ts
RouteData {
  straightLineMeters: number | null,
  routeMeters: number | null,
  walkingSeconds: number | null,
  walkingText: string | null,
  drivingSeconds: number | null,
  drivingText: string | null,
  motorcycleSeconds: number | null,
  motorcycleText: string | null,
  lastUpdatedAt: string
}
```

### Route computation strategy

Prefer Google Routes Compute Route Matrix because there is one origin and many destinations.

For a bulk route refresh:

1. Load the verified HOME origin.
2. Load places with verified/usable coordinates.
3. Chunk destinations according to current Routes API matrix limits.
4. Calculate WALK matrix.
5. Calculate DRIVE matrix.
6. Calculate TWO_WHEELER only when currently supported by the API/region and request type.
7. Persist successful per-place results in bounded route cache.
8. A failed destination must not fail other destinations.

Do not fabricate motorcycle time. If TWO_WHEELER is unavailable or rejected for a place/region, display unavailable.

Straight-line distance remains available for fast local sorting and as a fallback display only when no route distance exists, with the UI distinguishing route vs straight-line data.

## 10. Google Enrichment Pipeline

Manual bulk flow:

```text
Confirm bulk refresh
  -> resolve HOME if needed
  -> load canonical places
  -> skip fresh/fully usable cache when appropriate
  -> search unmatched place
  -> candidate scoring/dedup check
  -> link or mark review
  -> fetch Place Details for usable candidate
  -> save bounded Google cache
  -> continue next place
  -> optional manual Routes refresh phase
  -> reload app data from Supabase
```

The pipeline must:

- show total places,
- estimate Google operations before confirmation,
- show progress,
- show matched/review/skipped/failed counts,
- persist progress continuously,
- support an explicit confirmed cancellation,
- stop on systemic API/configuration errors,
- continue on individual place errors,
- never run in the background during ordinary browsing,
- never retry indefinitely.

## 11. Map Requirements

The map data source is the filtered application place array, not Google default POIs.

Rules:

- Every application place with usable coordinates produces an app marker.
- HOME always has a distinct blue home marker and higher z-index.
- Missing-coordinate places remain in the list but are absent from the map and appear in diagnostics.
- Google base-map POIs are not considered app markers and must not be used for application marker counts.
- Marker count diagnostics must compare against filtered app records with valid coordinates.

Existing map initialization, clustering, radius circle, and custom marker system should be retained unless a focused defect requires modification.

## 12. Marker and Card Synchronization

There must be one shared selected-place state.

Card -> map:

1. Set selected place ID.
2. Pan smoothly to marker.
3. Adjust zoom only when needed.
4. Open app place preview/bottom sheet.
5. Highlight marker.

Marker -> card:

1. Set selected place ID.
2. Open app place preview/bottom sheet.
3. Highlight matching card.
4. Scroll the list to the card when it is visible in the current UI context.

No full-page reload.

## 13. Filter and Radius Synchronization

Cards and map markers must consume the same derived `visiblePlaces` collection.

All existing filters must therefore affect both automatically, including open-now, price, walking time, category, late-night, 24h, LOCAL, CHAIN, Famous, Hidden Gem, and other current filters.

Radius values:

- 500 m
- 1 km
- 2 km
- 3 km
- 5 km

Radius is centered on verified HOME.

Changing radius updates:

- visible place list,
- app markers,
- result count,
- radius circle,

without reloading the page or automatically performing a Google Places search.

## 14. Search This Area

Add an explicit `ค้นหาในพื้นที่นี้ / Search This Area` action.

Rules:

- Never call Nearby/Text Search automatically from pan/zoom.
- The user must press the button.
- Show estimated request count and current search area/radius before calling Google.
- Discovery results are candidates, not automatically canonical app records.
- Existing records are matched first using Place ID/name/coordinate/address dedup logic.
- New discoveries require explicit approval before becoming app places.

## 15. Place Detail UI

Existing Place Detail remains the primary component.

Populate the existing fields when reliable data exists:

- พื้นที่
- ที่อยู่
- ระยะทาง
- เวลาเดิน
- มอเตอร์ไซค์
- รถยนต์
- ราคา
- เบอร์โทร
- อัปเดตข้อมูล
- ที่จอดรถ

Display rule:

- Manual curated value first.
- Google verified value when no stronger manual value exists.
- Route value for route-specific fields.
- `ไม่มีข้อมูล` / localized unknown state when unavailable.

The app must not claim route data is unavailable merely because Google Places data is missing; routes and Places are independent cache layers.

## 16. Photos

For a place with Google photos:

- initial gallery loads up to 3 photo references,
- lazy-load more only on interaction,
- preserve required attribution,
- avoid full-resolution images until needed,
- keep manual/official app photos higher priority where appropriate,
- do not permanently copy Google photo content into app-owned storage unless explicitly permitted by current terms.

A missing Google photo must not replace an existing manual image with an empty state.

## 17. Google Maps Links

Every place must always have a functioning Maps action using the first available option:

1. Google-provided Maps URI for the verified Place ID.
2. Place ID destination URL.
3. Verified latitude/longitude.
4. Place name + address/area search URL.

The action must never become disabled merely because Place Details cache expired.

## 18. Admin Diagnostics

Extend Data Management with a dedicated Google/Map diagnostic view containing:

- Total canonical places.
- Google Place ID linked.
- Missing Place ID.
- Review candidates.
- Places with coordinates.
- Missing coordinates.
- Places visible on current map/filter.
- Duplicate Google Place IDs.
- Stale Google cache.
- Missing route data by mode.
- Missing photos.
- Latest API/systemic errors.

For each missing-coordinate place provide explicit action:

`ค้นหาพิกัดจาก Google`

For matched places provide:

`อัปเดตข้อมูล Google`

For bulk operations provide:

`อัปเดตทั้งหมด`

with confirmation, estimated operation count, progress, success/skipped/failed counts, and safety cap.

## 19. Error Handling

Explicitly classify and surface admin-safe errors for:

- ZERO_RESULTS
- INVALID_REQUEST
- REQUEST_DENIED
- OVER_QUERY_LIMIT / quota exhausted
- missing/invalid API configuration
- network failure
- invalid coordinates
- missing Place ID
- missing photo
- missing route
- temporary/permanent closure
- Supabase persistence failure

One failed place never crashes the map or cancels unrelated successful records.

Systemic errors stop the current bulk run to avoid repeated billable failures.

## 20. Performance

Keep the existing principle of lazy Google loading.

Requirements:

- one Maps JS loader singleton,
- no duplicate scripts,
- map instance not recreated for unrelated state changes,
- app marker derivation memoized from visible places,
- cluster rendering retained,
- no Places calls inside marker rendering,
- no Place Details call on card open,
- photo details lazy-loaded,
- Supabase cache read once per app refresh rather than per marker,
- smooth card/marker/radius updates without full reload,
- no automatic Google requests caused by React re-renders.

## 21. Mobile / PWA

Primary mobile target is iPhone 16 Pro while retaining Android/desktop compatibility.

Requirements:

- touch/pinch gestures,
- marker tap hit targets suitable for mobile,
- place preview as viewport-safe bottom sheet,
- safe-area inset support,
- no controls under Home indicator,
- marker/card selection without page reload,
- progressive image loading,
- no popup outside viewport.

## 22. Security and Key Separation

Browser key:

- environment: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- website-referrer restricted
- API-restricted to only browser-required Google Maps Platform APIs

Server key:

- environment/secret: `GOOGLE_MAPS_SERVER_API_KEY`
- Cloudflare secret, never `NEXT_PUBLIC_`
- API-restricted to Routes API and any future explicitly server-side Maps API
- never logged
- never returned to the browser

Supabase service-role credentials must not be exposed to the browser. Browser-writable shared tables must retain strict RLS and bounded schema/payload validation.

## 23. Cost Control

No request occurs simply because a user opens Home, Map, a card, or a place detail page.

Cost-bearing operations require explicit user/admin intent:

- bulk Google enrichment,
- selected-place Google refresh,
- Search This Area,
- bulk/selected route refresh.

Every bulk action shows an estimate before confirmation.

The existing per-run safety cap remains unless implementation verifies a safer lower value. Routes receive an independent per-run matrix-element/request cap.

Completed records are persisted incrementally so a later run can resume without repeating fresh work.

## 24. Database Changes

Do not replace `amd_places`.

Prefer additive tables/columns:

- HOME origin/config table.
- Existing Google link table retained.
- Existing bounded Google cache retained/extended if needed.
- New route cache table keyed by place + HOME version/origin + travel mode.
- Existing diagnostics retained/extended.

Any schema migration must:

- preserve all 91 existing canonical rows,
- keep IDs/slugs stable,
- enable RLS on exposed tables,
- grant only required operations,
- avoid service-role exposure,
- include indexes for place ID, expiry, route freshness, and diagnostics queries.

## 25. Testing Strategy

### Unit tests

- name normalization and candidate scoring,
- duplicate Place ID detection,
- manual-over-Google merge priority,
- Google-over-seed merge priority,
- null never overwrites curated value,
- cache expiry,
- route cache selection,
- radius filtering,
- marker eligibility count,
- Google Maps fallback URL construction,
- cancellation confirmation,
- systemic error fail-fast.

### Integration tests

- canonical places + Google cache merge,
- review candidate with coordinates appears on map data layer,
- HOME config drives radius/distance origin,
- selected card selects marker and vice versa,
- filters produce matching card/marker collections,
- route refresh persists walking/driving/two-wheeler independently,
- expired Google cache does not trigger automatic network requests.

### Production verification

Before completion claim:

- full unit suite,
- TypeScript,
- production Next build,
- Cloudflare Wrangler dry-run,
- Supabase verification queries,
- Cloudflare deployment success,
- production diagnostic counts.

## 26. Rollout Sequence

Implementation should be staged to minimize risk:

1. Resolve and persist HOME origin.
2. Add/verify data models and caches.
3. Complete Places enrichment fields and dedup behavior.
4. Add server-side Routes + route cache.
5. Unify visible place collection for cards/map/filter/radius.
6. Add marker/card selection synchronization and place preview.
7. Add photos/attribution enhancements.
8. Add Search This Area.
9. Complete diagnostics and per-place recovery actions.
10. Run production validation against the full canonical dataset.

No phase may delete or rewrite curated data to make later phases easier.

## 27. Acceptance Criteria

The work is complete only when all of the following are true:

1. HOME is resolved to a verified Google Place ID and exact coordinate without guessing.
2. HOME is the only source for map origin, radius, distance, and routes.
3. Every canonical place with usable coordinates appears as an application marker when not filtered out.
4. Marker diagnostics equal the number of filtered places with coordinates.
5. Missing-coordinate places appear in diagnostics with a manual Google resolution action.
6. Google matching does not create duplicate canonical records.
7. Manual curated values survive all Google refreshes.
8. Place Detail displays all reliable enriched values and explicit unknown states otherwise.
9. Walking/driving/two-wheeler values are real Routes results or unavailable; none are fabricated.
10. Cards, map markers, filters, and radius all use one synchronized visible-place collection.
11. Search This Area is explicit/manual only.
12. Place Details/Routes are not called during normal navigation/rendering.
13. Google Maps links work for every canonical place through a safe fallback chain.
14. Photos are lazy, attributed, and policy-compliant.
15. API failures affect only the relevant operation/place unless systemic, in which case the run stops safely.
16. Admin diagnostics expose place-match, coordinate, map, stale-cache, route, photo, duplicate, and API-error status.
17. Existing categories, LOCAL/CHAIN/Famous/Hidden Gem, notes, pricing, parking, links, favorites, and other current app features remain intact.
18. No TypeScript/build errors.
19. Cloudflare production deployment succeeds.
20. Mobile experience works on iPhone 16 Pro/PWA without hidden controls or broken marker sheets.

## 28. Explicit Non-Goals / Guardrails

- Do not scrape Google Maps HTML.
- Do not auto-discover businesses while panning/zooming.
- Do not guess missing values.
- Do not make Google the canonical owner of curated app metadata.
- Do not expose a server API key to the browser.
- Do not permanently cache Google content beyond current product-policy allowances.
- Do not create a second parallel canonical place database.
- Do not rewrite the entire map subsystem when the existing marker/clustering engine can be extended.
- Do not claim completion based only on frontend appearance; database, API, cache, route, diagnostics, build, and production verification are mandatory.
