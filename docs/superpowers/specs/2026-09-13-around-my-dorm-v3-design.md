# Around My Dorm V3 — Architecture Design

Date: 2026-09-13
Status: Proposed / awaiting user review
Repository: `Riptwosec-collab/Around-My-Dorm-`

## 1. Goal

Upgrade Around My Dorm from a 100-place local directory into a reliable local discovery system with strong data integrity, photo coverage, explainable recommendations, live open/closed semantics, richer map UX, admin diagnostics, category coverage targets, and real-time app-side Google API telemetry.

The upgrade must preserve the current project rule that external Google operations remain explicit and user/admin initiated. Normal browsing, filtering, saved places, recent places, opening details, and switching tabs must not automatically generate Google Places requests.

## 2. Delivery Strategy

Use four sequential pull requests instead of one large rewrite. Each PR must be independently testable, mergeable, and reversible.

1. PR 1 — Data Integrity & Photos
2. PR 2 — Intelligence Engine
3. PR 3 — Admin & API Command Center
4. PR 4 — Map + Premium UI V2

This sequence reduces regression risk because later features depend on trusted identities, image state, and data-quality signals established in PR 1.

## 3. Current Constraints

- Runtime place data is database-first from Supabase.
- Production currently targets 100 places.
- Google identity links are stored separately from canonical place records.
- Google photo URIs are runtime/session data and must not be persisted as permanent Google photo URLs.
- Existing app architecture already contains data quality, recommendation scoring, Google enrichment, request tracking, marker clustering, filters, saved/recent flows, and admin components.
- `AroundMyDormApp.tsx` is large and should be decomposed only where the V3 work directly benefits from clearer subsystem boundaries.

## 4. PR 1 — Data Integrity & Photos

### 4.1 Duplicate Guard

Introduce a deterministic duplicate-analysis layer with three outcomes:

- `unique`
- `suspected_duplicate`
- `duplicate`

Signals, in priority order:

1. identical Google Place ID — hard duplicate
2. identical normalized phone or canonical external identity when available — hard duplicate
3. normalized name similarity + geographic distance threshold — suspected duplicate
4. normalized name similarity + matching address/area — suspected duplicate

Name normalization should remove punctuation, repeated whitespace, branch prefixes/suffixes where safe, common Thai/English spacing variants, and case differences. It must not collapse genuinely different branches into one business.

Admin actions:

- compare suspected pair
- keep A / keep B
- mark both unique
- merge metadata into survivor
- remove duplicate
- request replacement candidate

Deletion must rely on existing foreign-key cascade behavior for linked Google/cache/image/source rows where applicable.

### 4.2 Replacement Workflow

When a duplicate is removed and production count drops below the configured target, the admin dashboard shows a coverage deficit. Replacement discovery remains manual-only.

The system may suggest categories that are below target, but must not automatically send Google discovery requests or automatically insert a replacement business.

### 4.3 Photo Coverage Dashboard

Add a photo-health model with counts:

- total places
- persistent owned/authorized image available
- runtime Google image available this session
- missing image
- failed last manual fetch
- no Google photo returned
- missing Google Place ID

Actions:

- Load Missing Photos Only
- Retry Failed Only
- Clear Runtime Photos
- Open failed-place diagnostics

Bulk photo loading remains foreground/manual and request-capped. Existing request accounting must increment per attempted photo request.

### 4.4 Owned Photo Cache

Create a first-class distinction between:

- `owned_persistent` — user-uploaded, internally owned, or otherwise authorized permanent image
- `authorized_external_persistent` — URL explicitly allowed to be stored permanently
- `google_runtime` — session-only Google photo URL
- `fallback` — generated/placeholder visual

Google runtime photo URIs must never be copied into the owned persistent store.

Image selection priority:

1. verified owned persistent cover
2. verified authorized persistent image
3. current-session Google runtime image
4. fallback

### 4.5 Coverage Targets

Add configurable category targets, initially stored in app config rather than a new database table unless runtime editing is required later.

Example target groups:

- food/local food/noodles
- cafe
- mookata/hotpot
- fitness
- laundry
- pharmacy
- parking
- convenience/supermarket
- services

Dashboard shows `current / target / deficit` and suggests which category should be added next.

## 5. PR 2 — Intelligence Engine

### 5.1 Food Now V2

Replace simple ranking output with an explainable score object.

Suggested weighted factors:

- open now / closed penalty
- closing-soon penalty
- walking distance
- user budget fit
- rating quality
- review-count confidence
- local/independent boost
- hidden-gem boost
- data completeness
- verified/stale status
- image availability
- late-night suitability
- explicit user category preference

Return:

- total score
- ordered reasons
- warnings
- top 3 recommendations

The UI should show concise reasons, for example:

`เปิดอยู่ • เดิน 6 นาที • 70–120 บาท • 4.6★`

Unknown data must never be treated as positive evidence.

### 5.2 Open/Closed Engine

Create one canonical place-status function producing:

- `open`
- `closing_soon`
- `closed`
- `opens_at`
- `open_24h`
- `unknown`

Output should include:

- human label
- next transition time when known
- minutes until close/open when calculable
- confidence/source metadata

Use Asia/Bangkok consistently. Overnight schedules must be supported.

### 5.3 Recommendation Explainability

Every recommended place should expose a stable reason model so Home, Food Now, Map preview, and Place Detail use the same explanation semantics.

Recommendation calculations must be local from stored/runtime state and must not trigger external Google requests.

## 6. PR 3 — Admin & API Command Center

### 6.1 Unified Admin Health Dashboard

Combine operational signals into one admin surface:

- place count vs configured target
- duplicate/suspected duplicate count
- Google identity coverage
- verified vs review Google matches
- photo coverage
- missing hours/price/phone/coordinates
- stale records
- category deficits
- failed enrichment/photo requests
- request usage and remaining app budget

### 6.2 Action Queue

Generate prioritized admin tasks such as:

1. hard duplicate detected
2. missing Google identity
3. failed photo fetch
4. stale business hours
5. missing coordinates
6. category deficit
7. low-confidence review candidate

Each item should open the exact place or admin tool required to resolve it.

### 6.3 API Command Center

Retain the existing app-tracked estimate and add:

- today
- current month
- remaining vs configured monthly target
- per-request-type breakdown
- failed requests
- retries
- recent request timestamp
- small daily trend visualization derived from Supabase logs

This remains an app-tracked estimate, not an official Google Cloud billing counter.

### 6.4 Emergency Lock

Introduce a persisted or centrally readable admin safety switch that blocks new external Google operations in the client when enabled.

Requirements:

- normal stored-data browsing still works
- Google Maps/Places manual buttons show locked state
- unlocking is admin-only
- current usage state remains visible
- lock state must not be stored only in ephemeral React state

No automatic lock based solely on app estimates in V3; warnings may recommend locking, but an admin explicitly changes the state.

## 7. PR 4 — Map + Premium UI V2

### 7.1 Map Intelligence

Enhance stored-place map markers and preview cards with local derived badges:

- OPEN
- CLOSING SOON
- LOCAL
- CHEAP
- LATE
- HIDDEN GEM

Marker clustering remains enabled for dense regions.

The map must still not initialize Google Maps until explicit load approval under the existing cost-control architecture.

### 7.2 Home V2

Primary hierarchy:

1. Food Now hero
2. Live Nearby horizontal strip
3. category shortcuts
4. smart local picks
5. hidden gems / late-night / budget groups
6. optional map preview that does not initialize Google automatically

### 7.3 Motion and Performance

Use lightweight CSS/React transitions rather than expensive full-screen animation systems.

Requirements:

- no layout shift during image loading
- skeletons for database/runtime hydration
- smooth card expansion and sheet transitions
- respect reduced-motion preference
- avoid unnecessary rerender loops
- no Google API request as a side effect of animation, route transition, hover, scroll, or mount

### 7.4 Component Decomposition

Refactor only areas touched by V3. Suggested boundaries:

- `HomeDiscoverySections`
- `FoodNowResults`
- `PlaceStatusBadge`
- `PhotoCoveragePanel`
- `DuplicateReviewPanel`
- `AdminHealthCommandCenter`
- `ApiUsageTrend`
- `MapPlacePreview`

Avoid a broad rewrite of unrelated existing flows.

## 8. Data Model

Prefer additive structures and backward compatibility.

Potential additions to `Place` or derived view models:

- image ownership/source classification
- duplicate-analysis result (derived, not necessarily persisted)
- place-status view model (derived)
- recommendation explanation view model (derived)
- coverage-health view model (derived)

Prefer dedicated Supabase tables only when state must be shared/persistent across sessions, such as:

- owned persistent image metadata if current image tables are insufficient
- emergency Google API lock state
- optional admin duplicate-resolution history

Do not denormalize Google runtime photo URLs into canonical place records.

## 9. Data Flow

Normal app flow:

`Supabase place records → shared Google identity/cache layer → local derived status/quality/recommendation → UI`

Manual external operation flow:

`explicit admin/user action → confirmation → Google API call → request log → runtime result / approved cache → UI refresh`

Persistent image flow:

`authorized image input → validation → persistent image metadata → image selector → UI`

Runtime Google image flow:

`manual Google photo action → Google runtime photo store → current-session UI only`

## 10. Error Handling

- A Google failure must never blank the stored place list.
- Per-place errors should be isolated; bulk jobs continue unless cancelled or a systemic error threshold is hit.
- Duplicate resolution must be transactional where multiple related records are changed.
- Missing/unknown business data must display as unknown rather than guessed.
- Admin destructive actions require explicit confirmation.
- Recommendation engine must degrade gracefully when rating, price, hours, or coordinates are missing.

## 11. Testing Strategy

Each PR requires fresh verification before merge.

Minimum gates:

- unit tests for new pure logic
- regression tests for existing manual-only Google request policy
- typecheck
- production build
- Cloudflare Workers dry-run

PR-specific tests:

### PR 1
- exact Google Place ID duplicate detection
- name/distance suspected duplicate detection
- false-positive branch separation
- missing-only photo selection
- failed-only retry selection
- Google runtime photo never persisted as owned image
- category deficit calculation

### PR 2
- overnight opening hours
- closing-soon threshold
- next-opening calculation
- recommendation score determinism
- unknown data not rewarded
- explainable reason ordering

### PR 3
- admin gate for destructive actions
- emergency lock persistence/read path
- locked external actions do not execute
- usage aggregation/trend correctness
- normal stored browsing works while locked

### PR 4
- map remains manual-load only
- map badge derivation
- reduced-motion behavior where practical
- Home sections render without external requests
- regression coverage for Saved/Recent/Place Detail navigation

## 12. Security and Cost Controls

- Never hard-code Google API keys.
- Existing referrer/API restrictions remain required.
- External requests remain explicit/manual.
- Request counts are operational app estimates and must be labeled accordingly.
- Admin-only mutations must rely on existing authenticated admin authorization patterns rather than UI hiding alone.
- Emergency lock must be enforced at the operation boundary, not only visually.

## 13. Rollout and Merge Order

1. Merge PR 1 and verify production data/photo controls.
2. Build PR 2 on updated `main`; verify recommendation/status behavior.
3. Build PR 3 on updated `main`; verify admin safety and telemetry.
4. Build PR 4 on updated `main`; verify UX, map, and performance.
5. Final production smoke test after PR 4.

Do not stack all implementation PRs from an old base. Each PR should begin from the latest merged `main` unless an explicit dependency requires otherwise.

## 14. Success Criteria

V3 is complete when:

- production target count is maintained without hard duplicate Google identities
- suspected duplicates are visible and resolvable by admin
- photo coverage is measurable, missing-only and failed-only requests work
- permanent images are clearly separated from Google runtime photos
- Food Now returns explainable Top 3 results
- open/closed/closing-soon state is consistent across app surfaces
- Admin has one operational health/action center
- API request telemetry is visible and emergency lock works
- category deficits are visible
- map and Home use richer local intelligence without background Google requests
- all four PRs pass tests, typecheck, production build, and Workers dry-run before merge

## 15. Explicit Non-Goals for V3

- automatic background Google Places crawling
- automatic insertion of businesses discovered from Google
- official Google billing reconciliation
- persistent storage of Google runtime photo URLs as owned images
- full redesign/rewrite of every unrelated component
- automatic destructive duplicate merges without admin review
