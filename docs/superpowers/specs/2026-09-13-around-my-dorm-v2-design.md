# Around My Dorm V2 — Stable Core, Map V2, Premium UI V2 Design

Date: 2026-09-13
Status: Approved in-chat design direction; pending written-spec review before implementation planning
Repository: `Riptwosec-collab/Around-My-Dorm-`

## 1. Objective

Evolve Around My Dorm into a production-grade local discovery app around `บ้านสุภาอพาร์ทเม้นต์` without regressing existing data, saved state, curated metadata, Google API cost controls, or Cloudflare deployment behavior.

The approved delivery order is:

1. Stable Core and data-quality hardening.
2. Places expansion and normalization.
3. Map V2.
4. Premium UI V2.
5. Performance, QA, and regression hardening.
6. Production deployment and post-deploy verification.

This is an incremental redesign, not a rewrite.

## 2. Existing System Baseline

The current application already has substantial production behavior and must be extended rather than replaced.

Existing baseline includes:

- Next.js 15 / React 19 application structure.
- Shared `Place` schema covering identity, categories, location, hours, pricing, menus, images, parking, source/provenance, Google metadata, convenience flags, and verification state.
- Embedded place data plus optional Supabase-backed persistence.
- Home, Explore, Map, Saved/Favorites, Collections, Recent, Place Detail, Parking, Settings, and Data Management flows.
- Stored-data-first search, filters, sorting, radius filtering, and recommendations.
- Google Maps rendering with explicit user-controlled loading.
- Stored-place markers, Home marker, radius circle, clustering, and selected-place focus.
- Manual Google Place enrichment and manual/session-scoped Google photo loading.
- App-side Google API usage/budget diagnostics.
- Vitest, Playwright, data validation, TypeScript checks, ESLint, Next.js build, Wrangler dry-run/deploy scripts.
- Cloudflare Workers deployment.

The current architecture also contains two oversized coordination components, notably `components/AroundMyDormApp.tsx` and `components/DataManagement.tsx`. V2 will reduce their responsibility without changing public behavior all at once.

## 3. Non-Negotiable Product Constraints

### 3.1 Preserve existing user-visible functionality

The following must not disappear or be silently reset:

- Saved/Favorites.
- Collections.
- Recently Viewed.
- Search.
- Filters and sorting.
- Place Detail.
- Parking flows.
- Current category metadata.
- Existing internal IDs and slugs unless a deliberate migration preserves references.
- LOCAL / CHAIN / Famous / Hidden Gem style classifications.
- Curated notes, price ranges, parking notes, source URLs, and verification metadata.

### 3.2 Stored data remains primary

Normal browsing reads Around My Dorm data first. Opening tabs, scrolling, viewing cards, viewing a place, changing filters, or switching routes must not perform bulk Google Places discovery.

### 3.3 Google API calls remain explicit and cost-controlled

Google Maps and other Google operations remain opt-in actions.

- Google Maps JavaScript must not auto-load during application startup or ordinary navigation.
- The Map surface starts in a non-loaded state and exposes an explicit `Load Google Map` action.
- Once loaded in a session, tab changes should reuse the existing map instance when feasible rather than incur avoidable remount/load behavior.
- Places Search, Place Details, photo enrichment, matching, retries, and future route operations remain direct user/admin actions with clear request scope.
- Any cost-bearing action must preserve existing usage tracking, warnings, caps, and admin authorization rules.

### 3.4 Unknown data is not invented

Missing opening hours, prices, parking facts, phone numbers, coordinates, route distances, ratings, or images remain unknown until independently supported. UI should display localized unknown/unchecked states rather than fabricated values.

## 4. Architecture Decision

Use the approved **Stable Core → Map V2 → Premium UI V2** approach.

```text
Canonical / Stored Place Data
           ↓
Normalization + Validation + Provenance
           ↓
Shared Discovery Engine
(search / filter / sort / radius / status)
           ↓
┌──────────┬───────────┬──────────┬─────────────┐
│   Home   │  Explore  │  Map V2  │ Saved/Recent│
└──────────┴───────────┴──────────┴─────────────┘
           ↓
Google integrations only after explicit user/admin action
```

This design avoids coupling a visual redesign to provider/data changes.

## 5. Stable Core Refactor

### 5.1 Goal

Reduce coordination complexity before visual or map expansion.

`AroundMyDormApp` should remain the top-level product shell initially, but state and behavior should be extracted into focused modules rather than continuing to accumulate in one file.

Target responsibility boundaries:

- app shell/navigation state,
- discovery/search state,
- place selection state,
- saved/recent/collection state,
- map session state,
- Google provider/runtime state,
- reusable layout primitives,
- tab-specific views.

### 5.2 Proposed component/module direction

Exact filenames may adapt to existing conventions during implementation, but responsibilities should trend toward:

```text
components/app-shell/
  AroundMyDormShell
  BottomNavigation
  AppTopBar

components/discovery/
  DiscoverySearch
  QuickFilters
  PlaceResults
  PlaceCard
  DiscoveryEmptyState

components/map/
  MapExperience
  MapLoadGate
  MapToolbar
  MapPlaceSheet
  MapLegend

components/place/
  PlaceHero
  PlaceMeta
  PlaceActions
  PlaceGallery

lib/discovery/
  searchPlaces
  filterPlaces
  sortPlaces
  deriveOpenStatus
  deriveDistanceDisplay

lib/place-data/
  normalizePlace
  validatePlace
  dataQuality
```

Avoid gratuitous file splitting. Extraction is only justified when a unit has a clear responsibility and test surface.

### 5.3 State ownership

State should live at the lowest shared level that needs it.

Examples:

- Search query belongs to the discovery layer, not every card.
- Selected map place belongs to map/session state.
- Saved/collection persistence remains centralized and stable.
- Google map-loaded/session state remains separate from general navigation state.

The refactor must preserve current routes and deep links.

## 6. Place Data and Data Quality

### 6.1 Keep the existing Place schema

Do not replace `types/place.ts` with a new parallel model. Extend only where a proven product requirement is not representable.

The current model already supports:

- category and multi-category membership,
- Local/Chain/Independent classification,
- coordinates,
- multiple distance modes,
- opening hours and structured hours,
- pricing and average price,
- menu items,
- images and image provenance,
- parking details,
- Google Place linkage and details metadata,
- accessibility/payment/parking options,
- verification/freshness metadata,
- field-level provenance.

### 6.2 Normalization layer

All stored records should pass through common normalization before presentation.

Normalization responsibilities:

- ensure category arrays include the primary category when appropriate,
- normalize empty strings to null where the schema expects unknown,
- normalize Maps URLs and image arrays,
- derive a consistent display price from structured or legacy price fields,
- derive a consistent distance display from available distance fields,
- derive LOCAL / CHAIN / Hidden Gem / Famous badges from canonical metadata,
- never erase stronger curated values with missing enrichment values.

### 6.3 Validation and diagnostics

Extend existing validation so diagnostics can surface:

- duplicate internal IDs,
- duplicate slugs,
- duplicate Google Place IDs,
- malformed or impossible coordinates,
- category mismatches,
- missing Maps links when a stable Google Place ID or coordinate can safely support one,
- invalid/duplicate image URLs,
- impossible price ranges,
- stale verification timestamps,
- records with coordinates but no area/soi context,
- Local/Chain ambiguity,
- suspicious duplicate businesses by normalized name plus proximity.

Destructive duplicate merging remains an explicit admin action and must preserve favorites/collections/references.

### 6.4 Data health indicator

Admin/Data Management should provide a concise health summary such as:

- total canonical places,
- verified / partial / stale / unverified,
- with coordinates,
- with Maps link,
- with usable image,
- with current hours,
- with price data,
- duplicate candidates,
- records needing review.

This is diagnostic state, not a public rating of businesses.

## 7. Places Expansion

### 7.1 Coverage goal

Expand useful nearby coverage around Baan Supar while maintaining data quality.

Priority categories:

- food / local food,
- noodles,
- Thai / Isan,
- cafes,
- mookata / BBQ / hotpot / shabu,
- late-night food,
- convenience / 24-hour essentials,
- markets and supermarkets,
- pharmacy / clinic,
- laundry,
- barber/salon,
- fitness,
- repair/services,
- fuel / EV,
- parcel/post/print,
- parking and monthly parking.

### 7.2 Record completeness target

A place can exist with partial data, but high-quality cards should prioritize records with:

- stable name,
- primary category,
- coordinates,
- Maps URL or Google Place ID,
- area/soi,
- useful opening-hours state,
- usable price information where relevant,
- one usable image where permitted/available,
- LOCAL/CHAIN classification where known,
- verification/source metadata.

Unknown values remain visible as unknown; incomplete records are not hidden solely because they lack an image.

### 7.3 Expansion workflow

New records enter through controlled import/manual review, not automatic public browsing side effects.

Workflow:

```text
Candidate source
   ↓
Deduplicate / match
   ↓
Normalize
   ↓
Validate
   ↓
Review uncertain identity fields
   ↓
Publish into canonical Around My Dorm data
```

## 8. Discovery Experience

### 8.1 Shared discovery engine

Home, Explore, Map list/sheet, and category views should use the same core search/filter/sort semantics.

Supported dimensions include:

- query,
- radius,
- category,
- open now,
- late night,
- under-budget,
- walking-time threshold,
- LOCAL / CHAIN,
- Hidden Gem,
- parking,
- rating/review sorting where data is available.

One surface must not interpret filters differently from another unless the difference is intentional and documented.

### 8.2 `กินอะไรดีตอนนี้`

Home retains/promotes a fast decision flow using stored data only by default.

Ranking should favor a combination of:

- currently open / likely open,
- distance,
- curated recommendation/local score,
- budget compatibility,
- selected category preferences,
- usable data confidence.

It must not silently call Google to improve a recommendation.

## 9. Map V2

### 9.1 Load gate

The initial Map view is a premium stored-data map preview/state, but Google Maps JavaScript remains unloaded until the user explicitly chooses `Load Google Map`.

Before loading, the page may still show:

- count of stored places,
- active radius,
- active filters,
- list/preview of nearby places,
- explanation that the interactive Google map is not loaded yet.

### 9.2 Map behavior after explicit load

Map V2 should provide:

- Baan Supar/Home marker visually distinct from businesses,
- stored-place markers,
- category-aware marker appearance,
- marker clustering,
- radius circle,
- selected marker/card synchronization,
- fit/center controls,
- filter-aware marker visibility,
- map legend,
- premium selected-place bottom sheet,
- direct Maps/directions handoff where available.

### 9.3 Selected-place sheet

Selecting a marker opens a compact, touch-friendly sheet with:

- image,
- business name,
- category,
- LOCAL/CHAIN/Hidden Gem/Famous badges,
- open/closed status when derivable,
- price display,
- distance/walking estimate from stored data,
- save action,
- view-details action,
- Google Maps action.

The sheet must not cover core map controls or the safe-area navigation region.

### 9.4 Search This Area

`Search This Area` searches stored Around My Dorm records in the viewport/radius first.

Any optional external Google search must be a second, clearly labeled explicit action with request scope and confirmation, consistent with existing cost-control behavior.

### 9.5 Provider/session rules

- No Google map initialization during app startup.
- No Places request from marker selection.
- No Places request from filter changes.
- No Places request from card scrolling.
- No bulk photo request from map load.
- Reuse loaded provider/session resources where safe.

## 10. Premium UI V2

### 10.1 Visual direction

The approved style remains premium dark iOS-inspired Liquid Glass rather than a cyberpunk dashboard.

Characteristics:

- deep black / charcoal / dark navy foundation,
- restrained translucent surfaces,
- layered blur and highlights,
- subtle luminous accents,
- strong typography hierarchy,
- rounded geometry consistent across cards/sheets/navigation,
- tactile press states,
- refined depth rather than excessive glow.

### 10.2 iPhone 16 Pro-first

Primary mobile behavior must respect:

- safe areas,
- Dynamic Island/top inset,
- bottom home indicator,
- minimum practical touch targets,
- `100dvh` behavior,
- scroll regions that never trap content behind fixed navigation,
- sheets that can reach all content.

### 10.3 Responsive behavior

Tablet/desktop layouts must be deliberately composed rather than simple scaled-up mobile screens.

Examples:

- Explore can use a denser multi-column result grid.
- Map can become split-pane with map + results/detail.
- Settings/Data Management can use wider grouped panels.
- Place Detail can use gallery/content columns.

### 10.4 Motion

Use motion to communicate state, not decorate every element.

Approved motion patterns:

- short tab/content transitions,
- sheet spring/slide behavior,
- card press feedback,
- selected-marker emphasis,
- skeleton-to-content transitions,
- reduced-motion fallback honoring system preferences.

Avoid long blocking page-enter animations and excessive blur animation that degrades mobile performance.

### 10.5 Required states

Every primary surface must define:

- loading,
- skeleton where useful,
- empty,
- error,
- partial-data,
- offline/provider-unavailable where relevant.

## 11. Performance

Performance work is part of V2, not a cleanup deferred indefinitely.

Priorities:

- avoid rerendering all cards for unrelated UI state,
- memoize/derive expensive discovery results appropriately,
- lazy-load heavy map/provider code,
- avoid reinitializing Google Maps across ordinary tab changes,
- defer non-critical admin modules from consumer flows,
- optimize large image galleries and fallbacks,
- keep animation GPU-friendly and bounded,
- keep client bundle growth visible during implementation.

No premature custom state framework is introduced unless profiling shows the current approach cannot meet requirements.

## 12. Data Management V2

`DataManagement.tsx` should be decomposed gradually around existing workflows.

Suggested responsibility boundaries:

- overview/health,
- candidate matching,
- enrichment runs,
- diff/review,
- Google usage/budget,
- diagnostics,
- history/rollback.

Admin actions remain authenticated and explicit.

No redesign should weaken server-side authorization or API spend protections established by the existing hybrid Google design.

## 13. Error Handling

### Consumer surfaces

- Stored data remains usable if Google Maps fails.
- Missing images use non-broken branded/category fallbacks.
- Partial records render available fields and clearly omit/mark unknown values.
- Search/filter failures caused by malformed records are isolated rather than crashing the app.

### Map/provider failures

- Failed Google load returns to a retryable non-loaded/error state.
- No automatic retry loop that can create unexpected billed requests.
- Google Place/Photo/Route errors preserve prior canonical stored data.

### Admin/data failures

- Partial import/enrichment runs report per-record outcomes.
- Failed external enrichment cannot silently overwrite curated data.
- Destructive operations require explicit confirmation and a recoverable history/rollback path where the current product supports it.

## 14. Testing Strategy

Implementation uses regression-first testing.

### 14.1 Unit tests

Cover pure logic for:

- place normalization,
- query matching,
- filters,
- sorting,
- open-status derivation,
- display-price derivation,
- duplicate diagnostics,
- data-health counts.

### 14.2 Component/integration tests

Cover:

- quick filter behavior,
- place card badges/status,
- Save/Unsave,
- collection actions,
- map load gate,
- provider error/retry state,
- marker selection → place sheet,
- UI states with partial data.

### 14.3 E2E tests

Critical Playwright flows:

1. Home loads without Google Maps/Places calls.
2. Explore search/filter works from stored data.
3. Saved/Favorites persists through navigation/reload according to existing persistence design.
4. Recent places update when a place is opened.
5. Map page can open without loading Google Maps.
6. Google map loads only after explicit click.
7. Switching tabs after a loaded map does not trigger unnecessary provider reinitialization where testable.
8. Selecting a stored marker opens the correct place sheet.
9. Place Detail still exposes Maps/save/parking information.
10. Mobile safe-area/navigation does not cover reachable content.

### 14.4 Static/data validation

Every implementation phase should keep these green:

```bash
npm run lint
npm run typecheck
npm run validate:data
npm test
npm run build
npx wrangler deploy --dry-run
```

Run targeted Playwright tests during feature development and the critical E2E suite before production deployment.

## 15. Delivery Phases

### Phase 1 — Stable Core and Data Quality

- protect current behavior with regression tests,
- extract discovery and derived-display logic,
- add normalization/validation/data-health utilities,
- begin reducing `AroundMyDormApp` responsibility,
- no broad visual redesign yet.

Exit criterion: existing consumer flows work with cleaner internal boundaries and validation is stronger.

### Phase 2 — Places Expansion

- add/review place records,
- improve categories/badges/completeness,
- improve image and Maps-link coverage,
- deduplicate candidates,
- keep provenance and unknown-state rules.

Exit criterion: expanded dataset validates cleanly and important categories have useful coverage.

### Phase 3 — Map V2

- implement map load gate polish,
- improve markers/clusters/legend,
- selected-place bottom sheet,
- shared filtering/radius behavior,
- stored-data-first Search This Area,
- preserve cost controls.

Exit criterion: Map V2 is fully useful with stored data and performs no hidden external discovery.

### Phase 4 — Premium UI V2

- redesign Home/Explore/cards/sheets/navigation,
- update Saved/Recent/Place Detail/Parking/Settings visual system,
- tablet/desktop responsive treatment,
- motion/reduced-motion,
- loading/empty/error states.

Exit criterion: one coherent premium visual system across consumer surfaces without feature regression.

### Phase 5 — Performance and QA

- render profiling,
- bundle/lazy-loading checks,
- safe-area and scroll audits,
- regression fixes,
- complete automated validation.

Exit criterion: test/build/deploy-dry-run suite is green and critical mobile/desktop flows pass.

### Phase 6 — Production

- deploy to Cloudflare Workers,
- verify production routes/assets,
- verify no unintended Google API load on ordinary startup/navigation,
- verify map explicit-load behavior,
- verify Saved/Recent/Place details on production,
- resolve production-only regressions before considering V2 complete.

## 16. Migration Strategy

Avoid one-time destructive migrations unless they are required.

Rules:

- keep current internal place IDs stable,
- keep slugs stable unless redirect/alias support is implemented,
- normalize at read/import boundaries first,
- migrate stored structures only when the new representation clearly removes ambiguity or duplication,
- preserve legacy fields while dependent UI is being migrated,
- remove legacy fields only after all consumers and tests prove they are unused.

## 17. Acceptance Criteria

V2 is complete when all of the following are true:

1. Existing Saved, Collections, Recent, Search, Filters, Place Detail, Parking, and Settings behavior remains functional.
2. Canonical place data validates without unresolved critical identity/schema errors.
3. Nearby category coverage is meaningfully broader than the pre-V2 dataset while avoiding obvious duplicates.
4. Place cards consistently expose available name/category/status/price/distance/badge/image data without inventing missing values.
5. Google Maps does not load until the explicit user action.
6. Ordinary Home/Explore/Saved/Recent/Place navigation performs no hidden Google Places discovery or bulk photo actions.
7. Map V2 supports stored-place markers, Home marker, clustering, filtering/radius behavior, selected-place sheet, and Google Maps handoff.
8. Mobile UI respects iPhone safe areas and fixed navigation never makes content unreachable.
9. Tablet/desktop layouts are deliberately responsive.
10. Loading/empty/error/partial-data states exist on primary surfaces.
11. Unit/integration/E2E regression coverage exists for critical flows and Google load gating.
12. `lint`, `typecheck`, `validate:data`, unit tests, production build, and Wrangler dry-run pass before production deploy.
13. Production Cloudflare deployment is verified for routes, assets, consumer flows, and Google API guardrails.

## 18. Explicit Non-Goals for This V2

To keep scope controlled, V2 does not require:

- replacing Supabase with another database,
- replacing Next.js,
- introducing a second canonical business database,
- automatic continuous Google Places crawling,
- automatic Google map load on app startup,
- permanent mirroring of Google photo binaries,
- a native iOS/Android rewrite,
- social feeds/reviews authored by public users,
- AI-generated business facts presented as verified data.

These can be evaluated separately after V2 stabilizes.

## 19. Relationship to Existing Google Integration Spec

This V2 design builds on `docs/superpowers/specs/2026-09-12-around-my-dorm-hybrid-google-integration-design.md`.

If the two documents appear to conflict, the stricter Google cost-control, authorization, storage/policy, and provenance rule wins unless a future explicitly approved design supersedes it.

V2 primarily defines product sequencing, component boundaries, consumer UX, data-quality hardening, Map V2, premium UI, testing, and deployment discipline. It does not weaken the existing hybrid Google architecture.
