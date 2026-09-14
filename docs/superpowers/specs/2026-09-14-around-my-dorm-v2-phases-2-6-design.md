# Around My Dorm V2 — Phases 2–6 Design

Date: 2026-09-14  
Status: Approved in-chat design; pending written-spec review before implementation planning  
Repository: `Riptwosec-collab/Around-My-Dorm-`  
Base: Phase 1 Stable Core + Data Quality already merged to `main`

## 1. Objective

Build the next production-grade version of Around My Dorm around บ้านสุภาอพาร์ทเม้นต์ by expanding high-quality place coverage, improving local discovery, upgrading the map experience, introducing a consistent premium UI system, adding deterministic personalization and offline/PWA reliability, restructuring admin maintenance workflows, and hardening performance/QA before production release.

This is an incremental evolution of the existing app, not a rewrite.

The approved delivery order is:

1. Phase 2A — Places Expansion, Coverage, Candidates, Review Queue.
2. Phase 2B — Search & Discovery V2.
3. Phase 3 — Map V2.
4. Phase 3B — Distance & Route UX.
5. Phase 4A — Design System + App Shell + Home V2.
6. Phase 4B — Explore, Place Cards, Place Detail.
7. Phase 4C — Motion + Personalization.
8. Phase 5A — PWA + Offline Reliability.
9. Phase 5B — Admin/Data Management V2.
10. Phase 5C — Performance, QA, Observability.
11. Phase 6 — Production release and post-deploy verification.

Each phase must be independently reviewable, testable, mergeable, and reversible.

## 2. Non-Negotiable Product Constraints

### 2.1 Stored-data-first browsing

Normal browsing must read Around My Dorm canonical/stored data first. Opening Home, Explore, Map, Saved, Recent, Place Detail, changing filters, scrolling, selecting markers, or switching tabs must not trigger automatic Google Places discovery.

### 2.2 Google remains explicit and cost-controlled

Google Maps/Places/Photos/Route operations are manual, scoped actions.

- Google Maps JavaScript must not auto-load during app startup or ordinary navigation.
- Saved Cloud Map remains the default map provider.
- Google Maps loads only after an explicit user action.
- Google discovery, details, photos, matching, and maintenance remain admin-only explicit actions unless a future spec deliberately changes that rule.
- External requests must preserve usage tracking, warnings, hard caps, and authorization gates.
- Details and photo enrichment are separate actions rather than automatic fan-out after search.

### 2.3 Unknown values remain unknown

The app must not invent opening hours, price, parking, rating, phone, route duration, images, amenities, or verification state. Unknown values stay nullable/unknown and the UI must communicate that honestly.

### 2.4 Existing identity and user state are preserved

Existing internal IDs, slugs, favorites, collections, recently viewed records, category metadata, curated notes, price ranges, badges, provenance, and verification metadata must not be silently reset or remapped.

### 2.5 Canonical data is protected

Higher-confidence curated/verified data cannot be silently overwritten by lower-confidence enrichment. Identity ambiguity and duplicate candidates always require review.

### 2.6 Progressive rollout

Large subsystems are delivered as separate PRs. No production deployment occurs until the release gate for the relevant phase passes.

## 3. Phase 2A — Places Expansion and Coverage Architecture

### 3.1 Coverage target

Expand from the current canonical baseline toward 150–200 reviewed/published places in the first expansion wave. Quantity is not the only success criterion; minimum data-health targets are enforced.

Target quality thresholds for the first wave:

- valid primary category: 100%
- invalid coordinates: 0
- duplicate internal IDs: 0
- coordinates present: at least 95%
- Maps URL or stable Google Place identity: at least 90% where independently supportable
- usable image: at least 70%
- useful opening-hours coverage: at least 70%
- price coverage for food/cafe records: at least 70%
- provenance/source metadata: 100%
- all unresolved P0 identity/data errors surfaced in Review Queue

These are operational quality goals, not reasons to fabricate missing values.

### 3.2 Coverage rings

Coverage is measured from บ้านสุภาอพาร์ทเม้นต์ using fixed rings:

- R1: 0–500 m
- R2: 500 m–1 km
- R3: 1–2 km
- R4: 2–3 km
- R5: 3–5 km

Coverage can also be grouped by area/soi when useful.

### 3.3 Priority categories

Coverage reporting should include at least:

- food / local food / made-to-order
- rice
- noodles
- Thai / Isan
- cafes
- mookata / BBQ
- shabu / hotpot
- late-night food
- 24-hour essentials
- convenience stores
- markets / supermarkets
- pharmacy / clinic
- laundry
- barber / salon
- fitness
- repair / services
- parcel / post / print
- fuel / EV
- parking
- monthly parking

The implementation must reuse existing category identifiers where possible rather than creating redundant parallel categories.

### 3.4 Coverage Dashboard

Admin/Data Management receives a Coverage view showing per-ring/per-category counts and data completeness, including:

- total places
- verified / partial / stale / unverified
- coordinate coverage
- Maps-link/identity coverage
- image coverage
- hours coverage
- price coverage
- duplicate candidates
- records requiring review

Example output may state that a ring has low noodle coverage or that a category has poor hours completeness. Coverage diagnostics are admin tooling, not public business ratings.

### 3.5 Coverage Gap Detector

The detector derives actionable gaps from stored canonical data and data-health diagnostics.

Gap examples:

- too few places in a category/ring
- no verified place for an important category
- missing opening hours above a threshold
- poor image coverage
- stale records above a threshold
- missing Maps identities
- unresolved duplicate candidates

Each gap can link to one of two actions:

1. Review existing records.
2. Explicitly search for candidates through an approved admin provider flow.

The detector does not make external requests by itself.

## 4. Hybrid Candidate Expansion Workflow

The approved strategy is Hybrid: curated/stored/imported sources first, then explicit Google Admin Search only where coverage or field gaps justify it.

### 4.1 Pipeline

```text
Canonical Places
      ↓
Coverage Analyzer
      ↓
Coverage Gaps
      ↓
Candidate Source
  ├─ Manual / Approved Import
  └─ Google Admin Search (explicit only)
      ↓
Candidate Staging
      ↓
Identity Match / Duplicate Detection
      ↓
Normalization
      ↓
Validation + Data Health
      ↓
Review Queue
      ↓
Approve / Reject / Merge / Keep Separate
      ↓
Publish to Canonical Data
```

### 4.2 Candidate is not a published Place

Candidate records are staging entities and are not visible in public Home, Explore, Map, Saved, or recommendations until explicitly published.

A candidate record should contain enough metadata to support review, including:

- staging ID
- source provider
- source identity
- import/search timestamp
- proposed place fields
- possible canonical match IDs
- match/confidence metadata
- validation issues
- completeness summary
- review status
- reviewer/review timestamp when available

Allowed lifecycle states:

- `new`
- `needs_review`
- `approved`
- `rejected`
- `merged`

### 4.3 Google Admin Search

Admin chooses explicit scope before a Google search:

- coverage ring or center/radius
- category
- optional keyword
- candidate limit or provider-supported bounded scope

The UI shows an estimated request scope before confirmation.

Google search results enter Candidate Staging. The system must not automatically request details or photos for all results. Details and photos require separate explicit actions.

Automatic unlimited paging/retry is prohibited.

### 4.4 Progressive enrichment

A search candidate initially uses fields available from the search response. Additional details are loaded only when an admin explicitly requests them. Photo retrieval is a separate action.

This keeps API usage bounded and auditable.

## 5. Review Queue and Risk Model

### 5.1 Unified Review Queue

The Review Queue centralizes maintenance work from coverage gaps, imports, Google candidates, and data-health diagnostics.

Required reasons include:

- new place
- missing hours
- missing photo
- missing price
- missing Maps identity/link
- stale record
- possible duplicate
- category mismatch
- LOCAL/CHAIN ambiguity
- high-risk field conflict
- invalid coordinates or identity conflict

### 5.2 Priority model

P0:
- invalid identity-critical data
- duplicate internal ID/slug
- invalid coordinates required for publishing
- direct identity conflicts

P1:
- possible duplicate business
- Google Place ID conflict
- high-risk overwrite
- category mismatch affecting identity/discovery

P2:
- missing Maps identity/link
- missing hours
- stale record

P3:
- missing image
- missing price
- other optional metadata gaps

The queue supports filtering by reason, category, ring/area, source, age, risk, and verification state.

### 5.3 Side-by-side duplicate review

Possible duplicates are reviewed side-by-side. The UI shows identity evidence such as:

- normalized name
- coordinate distance
- Google Place ID
- phone
- address
- category
- hours
- source

Allowed decisions:

- Same business — merge.
- Different business — keep separate.
- Reject candidate.
- Review later.

Automatic destructive duplicate merging is prohibited.

### 5.4 Duplicate assistance scoring

A deterministic score may assist reviewers using signals such as:

- exact Google Place ID
- exact/similar normalized name
- coordinate proximity
- phone match
- address similarity

This score never independently authorizes a merge.

### 5.5 Field-level merge policy

Default trust ordering:

```text
Curated verified data
> Reviewed local data
> Google details
> Approved imported provider
> Unknown
```

A lower-confidence source can safely fill a missing field, but cannot silently replace a stronger conflicting value.

Field conflicts remain reviewable individually. Safe fields can be applied without blocking unrelated conflict fields.

### 5.6 Publish gate

A new candidate can be published when it has:

- stable name
- valid primary category
- valid coordinates when required for the place type
- source provenance
- no unresolved P0 issue
- duplicate/identity review completed when the system detected a possible match

Photo, full hours, price, phone, rating, and optional amenities are not required for publication.

### 5.7 Batch review

Low-risk candidate batches may be approved when all items have valid identity/category/coordinates, unique provider identity where applicable, and no unresolved P0/P1 issues.

Bulk duplicate merge is prohibited.

### 5.8 History and rollback

Every canonical mutation from the review workflow creates an audit/history entry including actor, source, timestamp, place/candidate identity, and before/after diff where appropriate.

Supported reversible actions should include:

- field update
- publication of a new place
- reviewed merge where the underlying persistence layer can safely restore the previous state

Audit history itself is not removed by rollback.

## 6. Phase 2B — Search and Discovery V2

### 6.1 Architecture

```text
User Query
   ↓
Deterministic Query Parser
   ↓
Structured Intent + Remaining Free Text
   ↓
Shared Discovery Engine
   ↓
Rank + Explainable Reason
   ↓
Home / Explore / Map / Category Views
```

Search must remain local/stored-data-first and must not call Google.

### 6.2 Thai/English intent parsing

The parser should recognize common local-intent phrases, including:

- category terms: rice, noodles, cafe, mookata, shabu/hotpot, food
- `open now`
- late night
- 24 hours
- budget constraints such as `ไม่เกิน 80`
- distance constraints such as `ไม่เกิน 500 เมตร`
- walkable intent such as `เดินไม่เกิน 10 นาที`
- parking
- air conditioning
- Wi-Fi
- power outlets
- good for working
- LOCAL
- Hidden Gem

Thai and Arabic numerals should normalize to the same numeric constraints.

Unrecognized subjective phrases remain free text instead of being force-mapped to fabricated semantics.

### 6.3 Search fields

Free-text matching can search across canonical fields including:

- name / English name
- categories / subcategory
- tags
- popular menus / recommended items
- area / soi
- short description

### 6.4 Quick Filters V2

Supported contextual filters should include:

Time:
- Open now
- Open late
- 24 hours

Budget:
- ≤ ฿60
- ≤ ฿100
- ≤ ฿150
- buffet ≤ ฿299 where meaningful

Distance:
- ≤ 500 m
- ≤ 1 km
- walk ≤ 10 minutes when route/walking data is trustworthy
- near Baan Supar

Type:
- LOCAL
- CHAIN
- Hidden Gem
- famous/local favorite

Amenities:
- parking
- air-con
- Wi-Fi
- power outlets
- good for working
- takeaway
- delivery

Quick filters must reuse the shared discovery semantics rather than implementing page-specific filtering.

### 6.5 Dynamic filter suggestions

The UI may suggest context-sensitive filters based on time of day, such as late-night filters in the evening, but must not silently activate them.

### 6.6 Smart Sort

Required sorts:

- Recommended now
- Nearest
- Price low → high
- Open now
- Local favorites
- Recently verified
- Data confidence where appropriate

`Recommended now` uses a deterministic weighted model based on factors such as opening state, distance, budget compatibility, preferred category, local/hidden-gem signals, and freshness/data confidence.

Exact weights are implementation details but must be testable and documented in code. Rating must not dominate because local businesses may have sparse/no review data.

### 6.7 Explainable recommendation reasons

Public cards show concise reasons, for example:

- `เปิดอยู่ • 420 ม. • ฿50–80 • LOCAL`
- `Hidden Gem • มีที่จอด • เปิดดึก`
- `ตรงกับคาเฟ่ที่คุณชอบ • 650 ม.`

Do not expose an unexplained opaque numeric recommendation score.

### 6.8 Data confidence

Incomplete places remain discoverable. Missing image/rating alone must not heavily penalize a place. Important uncertainty can reduce ranking modestly, especially missing coordinates, stale identity-critical data, or unknown hours in an open-now query.

### 6.9 Empty-state assistance

When filters remove all results, the UI should suggest specific ways to relax the active constraints, such as increasing radius, increasing budget, or disabling Open Now. Relaxation actions must modify real filter state rather than merely showing text.

### 6.10 Shared semantics

Home, Explore, Map list/sheet, and category views use the same filtering/ranking semantics. A filter combination should not produce different place sets on different surfaces without an explicitly documented reason.

## 7. Phase 3 — Map V2

### 7.1 Provider architecture

```text
MapExperience
  ├─ SavedCloudMapProvider (default)
  └─ GoogleMapProvider (explicit opt-in)
```

Provider state defaults to Saved Cloud every fresh app session/reload unless a later implementation decision proves session restoration safe and still preserves explicit loading semantics.

### 7.2 Google load gate

Opening `/map/`, changing radius, selecting markers, searching stored places, changing filters, or scrolling cards must not initialize Google Maps or call Google Places.

Google loads only after the user explicitly requests the Google provider and passes the existing cost/permission gate.

Failure to load Google falls back to Saved Cloud without breaking browsing.

### 7.3 Map controls and markers

Map V2 includes:

- visually distinct HOME marker for บ้านสุภา
- category-aware markers
- selected marker state/animation
- clustering
- radius circle
- provider indicator/switcher
- Search This Area
- Back to Home
- Use My Location
- category/filter toolbar
- map legend as needed

HOME remains an origin anchor rather than a normal business detail record.

### 7.4 Radius model

Supported radii:

- 250 m
- 500 m
- 1 km
- 2 km
- 3 km
- 5 km

Origin modes include Baan Supar, current location, and explicit map-search center.

### 7.5 Search This Area

`Search This Area` searches stored Around My Dorm records within the selected viewport/radius only. It must not call Google.

Admin-only external discovery remains a distinct explicit action.

### 7.6 Map/List synchronization

A single selected-place state coordinates map marker, list/rail card, and bottom sheet.

- selecting a marker opens/focuses the corresponding card/sheet
- selecting a card highlights/pans to the corresponding marker
- changing filters updates both marker and list datasets from the same discovery result

### 7.7 Place rail and floating sheet

Mobile Map V2 can show a horizontal place rail and a floating place sheet with snap states around 25%, 50%, and 85% of available viewport height.

Compact state includes image/name/open status/distance/price. Expanded states add badges, category, hours, parking, actions, description/amenities/source. A full Place Detail remains a separate destination.

Sheet and controls must respect bottom navigation and safe-area insets.

### 7.8 Map Intelligence

Map Intelligence uses canonical stored data only to summarize counts, dominant categories, late-night/parking availability, and coverage gaps.

Admin mode may visualize coverage holes and link them to explicit candidate-search tooling.

### 7.9 Failure and offline states

- no API key → Saved Cloud remains available
- Google quota locked → Saved Cloud remains available
- offline → stored places remain browsable
- records without coordinates remain available in list/detail but are not rendered as map markers

## 8. Phase 3B — Distance and Route UX

### 8.1 Truthful distance semantics

The UI distinguishes:

- straight-line distance
- cached walking distance/time
- cached driving distance/time
- motorcycle route/time only when a real supported source exists

No route time is inferred from straight-line distance and presented as fact.

### 8.2 Route refresh

Route refresh remains an explicit maintenance action where external requests are required. Opening a public card/detail must not automatically refresh route data.

Cached route information includes a freshness timestamp/source when available.

## 9. Phase 4A/B — Premium UI V2

### 9.1 Visual direction

The approved design system is premium dark iOS-inspired Liquid Glass with restrained cyan/blue accents. The result should feel modern and tactile, not cyberpunk-heavy.

Design priorities:

- strong content hierarchy
- business images/content remain visually dominant
- restrained blur/glow
- consistent rounded geometry
- readable Thai typography
- safe mobile spacing
- tactile but lightweight motion

### 9.2 Shared design tokens

Create shared tokens for:

- backgrounds
- glass surface levels
- accents
- text hierarchy
- status colors
- spacing
- radii
- border opacity
- shadow/elevation
- blur strengths
- typography scale
- animation durations
- safe-area spacing

Avoid arbitrary one-off visual values across components where a token fits.

### 9.3 Glass surface levels

- Soft: chips, badges, compact controls
- Card: place cards and content sections
- Strong: sheets, navigation, modals, floating panels

High blur must not be applied indiscriminately due to mobile GPU cost.

### 9.4 App Shell and navigation

Primary navigation remains optimized for Home, Explore, Map, and Saved. Settings/admin entry remains accessible from explicit controls rather than overcrowding the bottom bar.

Bottom navigation is floating, safe-area-aware, and must never cover content.

### 9.5 Home V2

Home becomes a local discovery dashboard driven by the shared discovery engine, with sections such as:

- greeting + Baan Supar context
- hero search
- กินอะไรดีตอนนี้
- quick filters
- Open Near You
- Walkable ≤10 min
- Local Picks
- Late Night
- Hidden Gems
- Cafes Nearby
- Parking Nearby

These sections are discovery queries, not independent duplicated filtering implementations.

### 9.6 Place Card V2

Two reusable variants are expected:

- horizontal/home carousel card
- vertical/explore card

Core content includes image/placeholder, name, open state, category, distance, price, badges, explainable recommendation reason, and save action.

Missing images use a deterministic category placeholder, not random stock imagery.

### 9.7 Explore V2

Explore provides:

- sticky search
- categories
- active quick-filter chips
- filter sheet
- sort sheet
- result count/context
- vertical place cards

The filter sheet groups Time, Budget, Distance, Type, Amenities, Category, and Verification/Data-state controls where appropriate. It can preview result count before applying.

### 9.8 Place Detail V2

Detail hierarchy:

1. Hero gallery/placeholder
2. name, status, badges
3. primary actions
4. key facts
5. hours
6. price/menu
7. parking
8. amenities
9. description/about
10. location/map/directions
11. sources and verification freshness

Unknown states are explicit. `Yes`, `No`, and `Unknown` must not be conflated for amenities.

Parking is a first-class section, including nearby/monthly parking data when supported.

### 9.9 Source transparency

Public UI shows concise provenance/freshness such as `Recently verified` or `Some details may be outdated`, with optional expanded source summary. Full field-level provenance remains admin-oriented.

## 10. Phase 4B — Interaction and Motion System

Shared durations:

- fast: ~120 ms
- normal: ~180 ms
- slow: ~240 ms

Use lightweight opacity/transform transitions. Spring motion is primarily for sheets. Avoid continuous glow/bounce and expensive blur/shadow animation.

Required states include:

- card/button press feedback
- section/page transitions
- image fade/skeleton
- selected map marker response
- bottom-nav active indicator

`prefers-reduced-motion` disables nonessential motion and preserves a simple, usable transition model.

## 11. Phase 4C — Personalization V2

### 11.1 Deterministic personalization

No LLM backend is required. Personalization derives from existing user state such as:

- favorites
- collections
- recent views
- preferred categories
- recent search/filter patterns where persisted
- budget/radius preferences
- LOCAL/Hidden Gem interaction patterns

Personalization changes ranking and Home section ordering; it does not silently alter strict filter semantics.

### 11.2 Preference profile

A lightweight profile may store preferred categories, budget, radius, frequently used filters, and local preference signals. Historical signals can decay so old behavior does not dominate permanently.

### 11.3 Explainability

Personalized recommendations include human-readable reasons such as `เพราะคุณบันทึกคาเฟ่ไว้หลายร้าน` rather than exposing opaque scores.

### 11.4 Exploration

A controlled `Try Something New` slot can surface high-quality unseen places so recommendations do not endlessly repeat the same businesses.

### 11.5 Smart Collections

Dynamic collections such as `Open Late`, `Under ฿100`, `Walkable`, `Work Cafes`, and `Parking` store filter definitions rather than duplicating place data.

### 11.6 Privacy controls

Settings must support clearing/resetting relevant personalization/search/recent state and explain whether data is local or cloud-backed.

## 12. Phase 5A — PWA and Offline Reliability

### 12.1 PWA requirements

- valid manifest
- installable app icons
- standalone mode
- theme/splash-compatible metadata
- iPhone safe-area support
- offline app shell
- graceful install prompt rather than intrusive first-load prompting

### 12.2 Offline cache layers

```text
App Shell
Canonical Snapshot
User State
```

App Shell caches application assets. Canonical Snapshot caches Around My Dorm published data appropriate for offline use. User State preserves favorites, collections, recent views, and preferences.

### 12.3 Offline behavior

Offline users can still browse cached places, search/filter cached data, view saved/recent/detail data, and use stored-data map/list experiences where the local renderer supports them.

Google Maps/Places/Photos and external live maintenance actions are unavailable offline.

### 12.4 Offline writes

Low-risk user-state actions such as save/collection/settings may queue locally and sync when online. Admin data mutation is not silently queued offline in this design.

### 12.5 Cache versioning/freshness

Cached canonical snapshots include data version and cached timestamp. Schema/cache migrations must have an explicit versioning/clear strategy.

The app may communicate the snapshot date while offline.

### 12.6 Provider policy

Do not build an offline strategy around scraping or permanently caching Google Maps content. Offline support is based on Around My Dorm canonical data and permitted internal/local assets.

## 13. Phase 5B — Admin/Data Management V2

### 13.1 Incremental decomposition

Do not rewrite `DataManagement.tsx` all at once. Extract responsibilities into focused views/components while preserving the current admin gate, pending changes, imports, history, Google maintenance, and rollback behavior.

Target workspace:

```text
DataManagementShell
├─ Overview
├─ Coverage
├─ Places
├─ Review Queue
├─ Candidates
├─ Duplicates
├─ Imports
├─ Google Tools
├─ Routes
├─ History
└─ Settings
```

### 13.2 Overview

Overview summarizes published places, candidates, pending review, duplicates, stale records, missing fields, and coverage score, with links to actionable queues.

### 13.3 Places Manager

Search/filter canonical places by name, category, area, verification/freshness, data health, and source.

### 13.4 Place Editor

Field editing supports identity, category, address, coordinates, hours, price, phone, Maps, images, parking, amenities, badges, verification, and source/provenance.

Field-level provenance should show current value, source, last verified/checked timestamp, confidence/trust classification, and incoming candidate value when relevant.

### 13.5 Duplicate review

Dedicated duplicate review uses the side-by-side workflow from Phase 2A. Bulk duplicate merging remains prohibited.

### 13.6 Import preview

Imports show scanned/existing/safe-update/review/new/rejected counts before commit. Provider data is normalized and reviewed rather than directly replacing canonical records.

### 13.7 History and audit

Audit entries should minimally capture action, place/candidate identity, before/after diff, source, timestamp, and actor. History is filterable by action/date/place/actor where practical.

### 13.8 Permissions

Initial roles remain intentionally simple: public read-only browsing and authorized admin maintenance. More granular reviewer/editor roles are deferred until a concrete need justifies them.

## 14. Phase 5C — Performance, QA, and Observability

### 14.1 Performance principles

- Home must not mount Google Map runtime.
- Google/provider bundles stay out of the initial critical path.
- Admin workspace and heavy galleries are dynamically loaded when practical.
- images use appropriate dimensions/lazy loading
- offscreen sections are deferred
- marker datasets are memoized/indexed appropriately
- avoid rerendering all markers on every keystroke
- use virtualization only when measured dataset/UI cost justifies it

### 14.2 Large dataset readiness

The discovery layer should remain viable as coverage grows from ~200 toward 500–1000+ places by keeping business logic separate from DOM rendering and allowing future indexing/cache improvements.

Do not introduce premature complexity if measured performance at current scale is already good.

### 14.3 Error boundaries

Failures should be isolated at least around:

- app shell
- map
- place detail
- admin workspace

Map/provider failure must not break Home/Explore. Admin failure must not break public browsing.

### 14.4 Diagnostics

Admin diagnostics can expose database source, place count, last load, data/cache version, Google usage, route cache state, and provider failures. Public users do not need raw technical diagnostics.

## 15. Testing and Release Gates

### 15.1 Unit/integration coverage

Required coverage includes:

- coverage-ring calculation
- gap derivation
- candidate normalization
- publish gate
- duplicate-assistance scoring
- field trust/merge policy
- Thai/English query parsing
- numeric constraint parsing
- quick-filter semantics
- Smart Sort determinism
- recommendation reasons
- map radius/filter dataset
- provider state
- selected map/list synchronization
- offline/cache version handling where practical

### 15.2 Google zero-request regression

This is P0.

The test suite must verify zero Google Maps/Places requests for at least:

- open Home
- open Explore
- run local search
- change filters
- open Saved Cloud Map
- change radius
- Search This Area
- select a stored marker/card

Google requests are allowed only after an explicit Google action.

### 15.3 E2E surfaces

Public flows:

- Home
- Explore
- Search/Filters
- Map
- Saved
- Recent
- Place Detail

Admin flows:

- admin gate
- coverage dashboard
- candidate review
- import preview
- duplicate review
- explicit Google search/load actions
- history/rollback

### 15.4 State coverage

Test representative states:

- loading
- empty
- error
- offline
- no image
- unknown hours
- missing price
- DB unavailable
- no Google API key
- Google quota locked
- long Thai text
- English UI

### 15.5 Mobile/responsive matrix

At minimum:

- 390×844
- 430×932
- 768×1024
- 1440×900

Check horizontal overflow, bottom navigation, safe areas, sheets, keyboard behavior, map controls, card layout, and admin scrolling.

### 15.6 Accessibility gate

- minimum practical tap targets ~44 px
- labels/aria where needed
- visible focus
- contrast
- semantic headings/landmarks
- keyboard navigation
- reduced motion

### 15.7 CI gate

Major PRs should run, as applicable:

- lint
- TypeScript typecheck
- canonical data validation
- unit/integration tests
- production build
- targeted Playwright regressions
- Cloudflare Wrangler dry-run

No success claim is made without fresh verification evidence.

## 16. Production Rollout

Approved release flow:

```text
feature branch
→ PR
→ CI
→ merge main
→ preview/staging verification
→ production deploy
→ post-deploy smoke checks
```

Post-deploy smoke checks include Home, Explore, Search, Saved Cloud Map default behavior, Saved, Place Detail, admin gate, and confirmation that no surprise Google requests occur during ordinary browsing.

Rollback options must include prior deployment and data/history rollback where the affected subsystem supports it.

## 17. Explicit Out of Scope

This design does not authorize:

- automatic Google Places discovery during public browsing
- automatic destructive duplicate merging
- invented/fabricated business facts
- a parallel replacement Place schema
- silent ID/slug migration
- an LLM backend for basic deterministic discovery/personalization
- permanent Google-content scraping/caching for offline mode
- complex multi-role RBAC before a real requirement exists
- production deployment before the relevant release gate passes

## 18. Definition of Done for V2

V2 is considered complete when the delivered system has:

- approximately 150–200 reviewed/published places in the first expansion target, with agreed quality thresholds tracked
- Coverage Dashboard and Gap Detector in real admin use
- Candidate Staging and Review Queue in real admin use
- explicit Google Admin Search with bounded request scope
- duplicate review without auto-merge
- field-level trust/provenance protection
- Thai/English intent-aware local search
- contextual Quick Filters
- deterministic Smart Sort with explainable reasons
- shared discovery semantics across Home/Explore/Map
- Map V2 with Saved Cloud default, radius controls, clustering, map/list sync, Search This Area, and floating place sheet
- truthful distance/route presentation
- premium consistent UI across Home/Explore/Map/Place Detail/Saved
- reduced-motion and safe-area support
- deterministic personalization and Smart Collections
- installable PWA and offline stored-data browsing
- restructured Admin/Data Management workspace
- history/rollback/audit support for maintenance workflows
- mobile performance and regression gates passing
- Google zero-request guard passing before explicit Google actions
- production smoke tests passing after release

## 19. Implementation Sequencing Rule

Implementation planning must preserve the following dependency order:

1. Phase 2A establishes coverage/candidate/review primitives.
2. Phase 2B builds discovery on canonical data and Phase 1 shared discovery foundations.
3. Phase 3 consumes the shared discovery output rather than introducing separate map filtering semantics.
4. Phase 3B adds truthful route UX without creating automatic external calls.
5. Phase 4 redesigns surfaces after data/discovery/map foundations are stable.
6. Phase 4C personalization adjusts ranking/sections without changing strict filter meaning.
7. Phase 5A offline support snapshots the stable canonical model rather than caching provider content indiscriminately.
8. Phase 5B incrementally decomposes Data Management rather than rewriting it.
9. Phase 5C measures and hardens the real implementation.
10. Phase 6 deploys only after the agreed gates pass.

This dependency order is part of the approved architecture and should not be collapsed into a single implementation batch.