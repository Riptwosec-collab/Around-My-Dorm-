# Around My Dorm — Hybrid Google Maps / Places / Routes Integration Design

Date: 2026-09-12
Status: Approved architecture direction; pending written-spec review before implementation planning
Repository: `Riptwosec-collab/Around-My-Dorm-`

## 1. Objective

Upgrade Around My Dorm into a curated local discovery application powered by Google Maps Platform while preserving all existing application data, manually curated classifications, URLs, categories, filters, UI behavior, and current functionality.

`บ้านสุภาอพาร์ทเม้นต์` is the single authoritative HOME / origin for map centering, radius filtering, distance sorting, nearby-search bias, and route calculations.

Never guess coordinates, phone numbers, opening hours, prices, parking, ratings, routes, or addresses. Unknown values display `ไม่มีข้อมูล` or the localized equivalent.

## 2. Existing System Constraints

Extend the current system rather than replacing it:

- `Place` already contains Google Place ID, coordinates, rating/reviews, Maps URL, opening hours, pricing, parking, images, distance fields, source metadata, and field provenance.
- The current Google map already provides a distinct Home marker, radius circle, custom business markers, clustering, and marker selection.
- The app already has manual Google → Supabase enrichment, shared bounded cache, match/review state, diagnostics, and cost-control behavior.
- Production currently contains 91 canonical places. Existing IDs, slugs, categories, LOCAL/CHAIN/Famous/Hidden Gem metadata, notes, pricing, parking, saved URLs, favorites, and related app features remain stable.
- Ordinary browsing must not issue Places Search, Place Details, Nearby Search, Routes, or bulk photo requests.

## 3. Architecture Decision: Hybrid

### Browser

The browser owns:

- Google Maps JavaScript rendering.
- Existing app markers and clustering.
- Explicit manual Places enrichment using the browser-restricted Maps key.
- `Search This Area` only after direct user action.
- Reading already cached Google-derived data from Supabase.
- Filters, sorting, radius state, card/marker synchronization, and UI.

### Cloudflare/server

Cloudflare owns privileged/cost-sensitive server operations:

- Google Routes API calls.
- Route Matrix batching.
- Route refresh orchestration and request caps.
- Server-side use of `GOOGLE_MAPS_SERVER_API_KEY`, stored only as a Cloudflare secret and API-restricted to required server-side Maps products.

### Supabase

Supabase remains the source of truth for:

- canonical app records,
- curated/manual metadata,
- verified HOME configuration,
- durable Google Place IDs,
- bounded Google Places cache,
- route cache,
- matching/review state,
- diagnostics and enrichment status.

Do not create a second canonical place database.

## 4. Authorization for Cost-Bearing Operations

Bulk enrichment and server-side route refreshes must not be freely callable by arbitrary public visitors.

Required design:

- Data Management bulk actions require a real authenticated admin session.
- Anonymous Supabase sessions are not sufficient authorization.
- Admin authorization uses Supabase Auth plus an explicit server-controlled authorization source such as `app_metadata` or a dedicated admin allowlist table protected by RLS.
- Never authorize from user-editable `user_metadata`.
- Route endpoints verify admin authorization server-side before calling Google.
- Add server-side rate limits and per-run safety caps even for authorized admins.
- Public `Search This Area`, if retained for non-admin users, gets a small explicit per-session/request cap and relies on Google quota/budget protections; it cannot invoke bulk canonical refresh or Routes bulk refresh.

This is necessary to keep the server key secret and prevent uncontrolled API spend.

## 5. HOME / Origin Resolution

Create one authoritative HOME record for `บ้านสุภาอพาร์ทเม้นต์`.

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

1. Check existing app data for an independently verified Place ID/address/coordinate.
2. Otherwise perform an explicit Places Text Search for the exact Thai name plus known neighborhood/address clues.
3. Compare candidate name, address/area, and geographic consistency.
4. Auto-accept only an unambiguous high-confidence candidate.
5. Ambiguous candidates require admin confirmation. Do not guess.
6. Once verified, map/radius/sorting/routing read this HOME record instead of scattered hard-coded coordinates.
7. A hard-coded fallback coordinate may render a temporary map only if clearly marked non-authoritative; it cannot be persisted as verified HOME without independent verification.

## 6. Place Identity, Matching, and Duplicate Protection

Each place retains its internal `id` and `slug`. Google Place ID is an external identity, not the app primary key.

Matching flow:

1. Read current names, area, soi, address, verified coordinates, phone/website clues, and category.
2. Search Google only during an explicit confirmed run.
3. Score candidates using normalized name, address/area agreement, coordinate proximity when available, and type/category compatibility.
4. Check whether the candidate Place ID already belongs to another app record.
5. Auto-link only strong, unambiguous matches.
6. Ambiguous matches become Review, never guessed links.
7. Enrichment never inserts a duplicate canonical shop.

Duplicate priority:

1. Google Place ID.
2. Verified coordinate proximity.
3. Normalized business name.
4. Address agreement.

If two existing canonical records resolve to the same Google Place ID, create a duplicate group in diagnostics. The admin merge action must:

- choose a surviving canonical record,
- preserve the strongest/manual values from both records,
- preserve aliases and useful source URLs,
- prevent loss of favorites/collections by remapping references when necessary,
- keep an old-slug/ID redirect or alias mapping where the app supports it,
- perform the destructive removal only after explicit admin confirmation.

No duplicate is silently deleted.

## 7. Data Priority and Merge Rules

Priority:

1. explicit manual-verified/curated data,
2. stronger official source data,
3. Google verified data,
4. computed routing data,
5. seed/unverified data,
6. unknown.

Google fills missing/weaker fields but never replaces stronger curated data with null or less useful values.

Protected examples:

- custom price ranges,
- LOCAL / CHAIN,
- Famous / Hidden Gem,
- app categories,
- personal notes,
- parking notes/prices,
- recommendations,
- manually verified URLs.

Every Google/route field records provenance and checked/updated timestamps.

## 8. Google Places Data Layer

Extend the existing model; do not replace `Place`.

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

Map useful values back into existing top-level fields so current UI remains compatible while preserving structured Google metadata for richer UI.

`area` remains curated app data when present. Google addresses may supplement it but do not blindly rewrite a useful local area label.

## 9. Storage / Google Policy Guardrails

- Google Place ID is a durable external identifier.
- Other Google Maps Platform content is cached/stored only within current product-specific policy allowances.
- Place Details remains a bounded shared cache with expiry rather than a permanent canonical overwrite.
- Photos store only permitted reference/metadata/attribution; do not permanently copy Google photo binaries into app-owned storage unless current terms explicitly permit it.
- Route results use a bounded configurable cache compliant with current Routes terms.
- Independently/manual-verified app values can become canonical when explicitly approved; they are not treated as indefinitely cached Google content.
- No Google Maps HTML scraping.

Implementation planning must re-check current Google Places, Photos, and Routes policy before finalizing TTLs.

## 10. Routes Architecture

All routes originate from verified HOME.

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

Prefer Google Routes Compute Route Matrix because the app has one origin and many destinations.

Bulk route refresh:

1. Load verified HOME.
2. Load places with usable coordinates.
3. Chunk destinations according to current Route Matrix limits.
4. Compute WALK.
5. Compute DRIVE.
6. Compute TWO_WHEELER only when currently supported for Thailand/request type.
7. Persist successful per-place results to bounded route cache.
8. One failed destination does not fail the rest.

Never fabricate motorcycle travel time. If unsupported/unavailable, display unavailable.

Straight-line distance remains available for fast sorting and clearly labeled fallback only.

Where Google requires route-mode warnings (for example walking/two-wheeler safety notices), the UI must display the required notice.

## 11. Google Enrichment Pipeline

```text
Admin confirms bulk refresh
  -> verify HOME if needed
  -> load canonical places
  -> skip fresh usable cache when appropriate
  -> search unmatched place
  -> score/dedup candidates
  -> link or mark Review
  -> fetch Place Details for a usable candidate
  -> persist bounded Google cache
  -> continue next place
  -> optional explicit Routes refresh
  -> reload app data from Supabase
```

The run shows:

- total places,
- estimated operations,
- progress,
- matched/review/skipped/failed counts,
- latest safe diagnostic,
- explicit confirmed cancellation.

Persist progress incrementally. Continue on individual-place errors. Stop on systemic API/config/quota errors. Never retry indefinitely and never run during ordinary browsing.

## 12. Main Map and Marker Eligibility

The app marker data source is the filtered application place array, not Google base-map POIs.

Rules:

- Every visible app place with usable coordinates gets an app marker.
- HOME is a distinct blue home marker with pulse/radius treatment and highest z-index.
- Missing-coordinate places stay in lists but appear in diagnostics as `Missing Map Location`.
- Google default POIs are not counted as Around My Dorm markers.
- Marker diagnostics equal the filtered app-place count with usable coordinates.

Retain current map initialization/clustering unless a focused defect requires change.

### Marker visual taxonomy

Upgrade shop markers from generic dots to compact category-aware symbols while keeping clustering/performance:

- restaurant / food: fork/food symbol,
- cafe: coffee,
- noodles: bowl,
- mookata/BBQ: grill,
- shabu/hotpot: pot,
- parking: P,
- 24H: 24H,
- Hidden Gem: gem/star accent,
- Famous: flame/popular accent,
- chain: store/chain treatment,
- local: local/store treatment.

Selected marker receives a clear highlight without recreating the map instance.

## 13. Marker Interaction / Place Preview

Tapping/clicking an app marker opens a premium floating card or mobile bottom sheet containing available data:

- photo,
- name,
- category,
- LOCAL / CHAIN,
- Famous / Hidden Gem,
- rating + review count,
- price,
- open/closed state,
- distance from HOME,
- walking / motorcycle / driving time,
- phone when available.

Actions:

- `ดูรายละเอียด`,
- `เปิด Google Maps`,
- `เส้นทาง`,
- `โทร`,
- `เว็บไซต์`.

Buttons with unavailable data are disabled or hidden with a clear state; do not create fake values.

## 14. Card / Marker Synchronization

Use one shared selected-place state.

Card -> map:

1. set selected ID,
2. smoothly pan to marker,
3. adjust zoom only if needed,
4. open preview/bottom sheet,
5. highlight marker.

Marker -> card:

1. set selected ID,
2. open preview/bottom sheet,
3. highlight matching card,
4. scroll list to the matching card when appropriate.

No full-page reload.

## 15. Filters and Radius

Cards and markers consume the same derived `visiblePlaces` collection.

All current filters therefore apply to both: open now, price, walking time, category, late-night, 24h, LOCAL, CHAIN, Famous, Hidden Gem, and existing filters.

Radius options centered on HOME:

- 500 m
- 1 km
- 2 km
- 3 km
- 5 km

Changing radius updates list, markers, result count, and radius circle without full reload and without automatically calling Google Search.

## 16. Search This Area

Add explicit `ค้นหาในพื้นที่นี้ / Search This Area`.

- Never search automatically on pan/zoom.
- User must press the action.
- Show current area/radius and request estimate first.
- Discovery results are candidates, not instant canonical records.
- Match existing records first using Place ID/name/coordinates/address.
- New discoveries require explicit approval before becoming canonical app places.

## 17. Place Detail

Keep the existing Place Detail component and populate reliable values:

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

Display priority follows the merge rules. Route data is independent from Places cache; missing Places data must not incorrectly erase valid route data.

## 18. Photos and Attribution

- Load at most 3 Google photo references initially.
- Lazy-load additional photos after interaction.
- Preserve required attribution.
- Avoid full-resolution images until needed.
- Existing manual/official images keep priority where appropriate.
- Missing Google photo never clears an existing app image.
- Do not permanently copy Google photo binaries unless permitted by current terms.

## 19. Google Maps Link Fallback

Every place always gets a working Maps action using the first available source:

1. Google-provided Maps URI,
2. verified Place ID destination URL,
3. verified latitude/longitude,
4. name + address/area search URL.

An expired Place Details cache must not break the Maps button.

## 20. Admin Diagnostics

Data Management gets a dedicated Google/Map diagnostic section containing:

- total canonical places,
- linked Place IDs,
- missing Place IDs,
- Review candidates,
- places with coordinates,
- missing coordinates,
- visible map markers under current filter/radius,
- duplicate Place IDs/groups,
- stale Google cache,
- missing routes by mode,
- missing photos,
- latest API/systemic errors.

Per missing-coordinate place:

`ค้นหาพิกัดจาก Google`

Per matched place:

`อัปเดตข้อมูล Google`

Bulk:

`อัปเดตทั้งหมด`

Bulk actions show operation estimate, confirmation, progress, success/skipped/failed counts, and safety cap.

## 21. Error Handling

Classify and surface admin-safe errors for:

- ZERO_RESULTS,
- INVALID_REQUEST,
- REQUEST_DENIED,
- OVER_QUERY_LIMIT/quota,
- missing/invalid API config,
- network failures,
- invalid coordinates,
- missing Place ID,
- missing photo,
- missing route,
- temporary/permanent closure,
- Supabase persistence failure.

One failed place never crashes the map or cancels unrelated successful places. Systemic errors stop the bulk run to avoid repeated billable failures. Technical details remain in admin/development diagnostics rather than normal consumer UI.

## 22. Performance

- one Maps JS loader singleton,
- no duplicate scripts,
- map instance survives unrelated React state updates,
- marker data memoized from `visiblePlaces`,
- clustering retained,
- no Places calls from marker render functions,
- no Place Details request on card open,
- photo details lazy-loaded,
- Supabase shared cache loaded per app refresh, not per marker,
- no Google request caused by React re-render,
- smooth marker/card/radius transitions without full reload or flicker.

## 23. Mobile / PWA

Primary target: iPhone 16 Pro, while retaining Android/desktop support.

- touch and pinch zoom,
- mobile-sized marker hit targets,
- viewport-safe bottom sheet,
- safe-area insets,
- no controls hidden under the Home indicator,
- marker/card selection without reload,
- progressive image loading,
- no popup outside viewport.

## 24. Key Separation and Security

Browser key:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- website-referrer restricted,
- API-restricted to browser-required Google Maps APIs.

Server key:

- `GOOGLE_MAPS_SERVER_API_KEY`
- Cloudflare secret only,
- API-restricted to Routes and any explicitly approved server-side Maps API,
- never logged,
- never returned to browser.

Supabase service-role credentials never enter browser code. Exposed shared tables require RLS, least-privilege grants, payload limits, and indexes.

## 25. Cost Control

No cost-bearing request occurs simply because a user opens Home, Map, a card, or Place Detail.

Explicit actions only:

- bulk Google enrichment,
- selected-place Google refresh,
- Search This Area,
- bulk/selected route refresh.

Every bulk action shows an estimate before confirmation. Keep per-run safety caps; Routes gets independent matrix-element/request caps. Persist completed work incrementally so later runs skip fresh data.

Google Cloud quota/budget alerts remain a second line of defense rather than the only application-level control.

## 26. Database Changes

Do not replace `amd_places`.

Prefer additive schema:

- HOME origin/config table,
- existing Google link table retained,
- existing bounded Google cache retained/extended,
- route cache keyed by place + HOME origin/version + travel mode,
- existing diagnostics retained/extended,
- duplicate group/alias metadata only if needed for safe canonical merges.

Migrations must:

- preserve all 91 canonical rows,
- keep IDs/slugs stable unless an explicitly confirmed duplicate merge creates an alias/redirect,
- enable RLS on exposed tables,
- grant only required operations,
- never expose service role,
- index Place ID, expiry, route freshness, and diagnostics lookups.

## 27. Testing

### Unit

- normalization/candidate scoring,
- duplicate Place ID detection,
- safe duplicate merge precedence,
- manual-over-Google priority,
- Google-over-seed priority,
- null never overwrites curated value,
- cache expiry,
- route cache selection,
- radius filtering,
- marker eligibility count,
- Maps fallback URL,
- cancellation confirmation,
- systemic fail-fast.

### Integration

- canonical places + Google cache merge,
- Review candidate with coordinates enters map data layer,
- HOME config drives radius/distance origin,
- card selects marker and marker selects card,
- filters produce identical card/marker collections,
- route refresh persists modes independently,
- expired cache does not trigger automatic network calls,
- duplicate merge remaps affected references without losing curated data.

### Production verification

Before any completion claim:

- full unit suite,
- TypeScript,
- production Next.js build,
- Cloudflare Wrangler dry-run,
- Supabase verification queries,
- Cloudflare deployment success,
- production diagnostic counts,
- browser console check on critical flows,
- mobile/PWA smoke test.

## 28. Rollout Sequence

1. Add admin authorization guard for bulk/server-cost operations if not already present.
2. Resolve and persist HOME.
3. Add/verify data models and bounded caches.
4. Complete Places enrichment and duplicate protection.
5. Add server Routes + route cache.
6. Unify `visiblePlaces` for cards/map/filter/radius.
7. Add marker icons, selection sync, and marker preview.
8. Add photos/attribution enhancements.
9. Add Search This Area.
10. Complete diagnostics, duplicate merge flow, and per-place recovery actions.
11. Validate against the full canonical dataset and deploy.

No phase may delete or weaken curated data to make later phases easier.

## 29. Acceptance Criteria

Complete only when:

1. HOME resolves to a verified Google Place ID and exact coordinate without guessing.
2. HOME is the authoritative source for map origin, radius, distance, and routes.
3. Every visible canonical place with usable coordinates appears as an app marker.
4. Marker diagnostics equal filtered places with coordinates.
5. Missing-coordinate places appear in diagnostics with a manual Google resolution action.
6. Google matching does not create duplicate canonical records.
7. Existing duplicates that resolve to one Place ID have a safe explicit merge path preserving curated data and references.
8. Manual curated values survive every Google refresh.
9. Place Detail displays reliable enriched data and explicit unknown states otherwise.
10. WALK/DRIVE/TWO_WHEELER values are real route results or unavailable; none are fabricated.
11. Cards, markers, filters, and radius share one synchronized visible-place collection.
12. Search This Area is explicit/manual only.
13. Place Details/Routes are not called during normal rendering/navigation.
14. Google Maps links work through the defined fallback chain.
15. Photos are lazy, correctly attributed, and policy-compliant.
16. API failures affect only relevant operations unless systemic, in which case the run stops safely.
17. Diagnostics expose match, coordinate, marker, stale-cache, route, photo, duplicate, and API-error states.
18. Existing categories, LOCAL/CHAIN/Famous/Hidden Gem, notes, pricing, parking, links, favorites, and other current features remain intact.
19. Google attribution requirements are respected wherever Google content is displayed.
20. No TypeScript/build errors and no critical browser console errors on tested flows.
21. Cloudflare production deployment succeeds.
22. iPhone 16 Pro/PWA layout works without hidden controls or broken marker sheets.
23. Cost-bearing server endpoints require real admin authorization and enforce rate/safety limits.

## 30. Guardrails / Non-Goals

- No Google Maps HTML scraping.
- No automatic discovery on pan/zoom.
- No guessed missing values.
- No Google ownership of curated app metadata.
- No server key in browser code.
- No indefinite Google-content cache beyond current policy allowances.
- No second canonical place database.
- No wholesale map rewrite when the current engine can be extended.
- No claim of completion based only on frontend appearance; API, database, cache, routes, diagnostics, tests, build, deployment, and production verification are required.
