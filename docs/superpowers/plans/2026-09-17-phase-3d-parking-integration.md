# Phase 3D Parking Match + Phase Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local-first parking recommendations, explicit-click Google parking fallback, integrate the complete Phase 3 Decision Panel, and finish end-to-end regression verification.

**Architecture:** Keep parking ranking pure and local by default. Google discovery is a separate transient action invoked only by `ค้นหาที่จอดเพิ่ม`; candidates never auto-enter canonical data. The final integration task composes Freshness, Opening, Reports, ETA, and Parking into Place Detail/Admin without turning `AroundMyDormApp.tsx` into a new business-logic hub.

**Tech Stack:** Next.js, React, TypeScript, Vitest, existing Place/parking model, existing Google Places request controls.

**Spec:** `docs/superpowers/specs/2026-09-17-phase-3-decision-intelligence-design.md`

## Global Constraints

- Local canonical parking is always evaluated before Google fallback.
- Missing route ETA must never become invented walking minutes.
- Google parking discovery occurs only after explicit user action.
- Google parking candidates are transient and are not auto-imported.
- Nearby parking is measured from the currently viewed place, not the dorm.
- Show at most three parking options initially; allow view-all.
- Preserve TH/EN, mobile small-screen and safe-area behavior.
- Full Phase 3 verification requires unit tests, typecheck, production build, and Cloudflare dry-run bundle validation.

---

## File Structure

- Create `lib/parking-match.ts` — candidate eligibility, local proximity, scoring/ranking.
- Create `lib/google-parking-runtime.ts` — explicit transient Google parking discovery wrapper/cache if not reusable from an existing discovery module.
- Create `components/NearbyParkingPanel.tsx` — top 3, view all, directions, explicit Google fallback.
- Modify Place Detail Decision Panel to compose `PlaceFreshnessNotice`, Opening Intelligence, `PlaceEtaPanel`, `NearbyParkingPanel`, and `PlaceReportSheet`.
- Modify existing candidate-review/import admin path only to accept manually promoted transient parking candidates through the existing review mechanism; do not auto-promote.
- Add `tests/parking-match.test.ts`, `tests/google-parking-explicit.test.ts`, `tests/phase3-decision-panel.test.ts`, and integration regression assertions.

### Task 1: Local parking matcher

**Interfaces:**
- `type ParkingMatch = { place: Place; straightLineMeters: number; score: number; reasons: string[] }`.
- `getNearbyParking(target: Place, places: Place[], options?: { limit?: number }): ParkingMatch[]`.
- Eligible categories include `parking` and `monthly_parking`; target/candidate coordinates are required for proximity ranking.

- [ ] **Step 1: Write failing tests** for category eligibility, coordinate requirement, nearest-first baseline, availability preference, known verified walking ETA preference, price/24h/security tie-breakers, monthly parking retention, and no fabricated walking time.
- [ ] **Step 2: Run RED** with `npm test -- tests/parking-match.test.ts`.
- [ ] **Step 3: Implement `lib/parking-match.ts`** using Haversine only as distance/ranking input. Keep score weights deterministic and modest so proximity remains the primary signal.
- [ ] **Step 4: Run GREEN** and `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: add local parking matcher`.

### Task 2: Explicit Google parking fallback

**Interfaces:**
- `searchGoogleParkingNearPlace(target: Place): Promise<TransientParkingCandidate[]>`.
- Runtime candidates contain only fields needed to display/evaluate the discovery result and remain outside canonical `Place[]` unless an admin explicitly stages one through the existing candidate workflow.

- [ ] **Step 1: Write failing tests** proving render/detail-open/local parking lookup trigger zero Google search calls; clicking `ค้นหาที่จอดเพิ่ม` triggers one; repeated same-target search may reuse session runtime cache; returned candidates are not appended to canonical data.
- [ ] **Step 2: Run RED** with `npm test -- tests/google-parking-explicit.test.ts`.
- [ ] **Step 3: Implement transient search wrapper** using existing Google Places API budget/request controls and target coordinates. Request only fields needed for discovery display and attribution.
- [ ] **Step 4: Implement typed failure states** for unavailable key, budget lock, provider failure, and no results; local parking remains visible in all failure cases.
- [ ] **Step 5: Run GREEN** and `npm run typecheck`.
- [ ] **Step 6: Commit** `feat: add explicit parking discovery fallback`.

### Task 3: Nearby Parking Panel

**Interfaces:**
- `NearbyParkingPanel` consumes `{ target: Place; allPlaces: Place[]; locale: "th"|"en" }`.
- Shows first 3 local matches before any Google interaction.

- [ ] **Step 1: Write failing UI tests** for top-three local results, hourly/daily/monthly price copy, 24h/availability/security attributes, view detail, directions, view-all, explicit Google search, and graceful provider failure.
- [ ] **Step 2: Run RED**.
- [ ] **Step 3: Implement `components/NearbyParkingPanel.tsx`** using local matcher on render and transient results only after explicit click.
- [ ] **Step 4: Add admin-only “stage candidate” affordance only if an existing reviewed candidate flow already supports it; otherwise leave discovery transient and document manual follow-up rather than introducing a new import subsystem.
- [ ] **Step 5: Run GREEN**, `npm run typecheck`, `npm run build`.
- [ ] **Step 6: Commit** `feat: add nearby parking decision panel`.

### Task 4: Compose Phase 3 Decision Panel

**Interfaces:**
- Decision Panel groups opening state/freshness, price freshness, dorm straight-line distance, ETA controls, nearby parking, and report action.
- Card remains compact and does not mount ETA or Google parking logic.

- [ ] **Step 1: Write failing integration tests** asserting Place Detail contains the complete Decision Panel while Home/List startup has no route or parking Google requests.
- [ ] **Step 2: Run RED** with `npm test -- tests/phase3-decision-panel.test.ts`.
- [ ] **Step 3: Compose the panel** in the existing Place Detail component, extracting a dedicated `components/PlaceDecisionPanel.tsx` if the existing detail file would otherwise become unwieldy.
- [ ] **Step 4: Verify pending-report warning wording** remains neutral and freshness warnings remain field-specific.
- [ ] **Step 5: Verify card copy** shows only high-value open/close/freshness signals; no ETA/parking API client imports in card/list components.
- [ ] **Step 6: Run GREEN**, `npm run typecheck`, `npm run build`.
- [ ] **Step 7: Commit** `feat: integrate Phase 3 decision intelligence`.

### Task 5: Full Phase 3 acceptance regression

- [ ] Add/complete tests mapping all 17 spec acceptance criteria to test names or explicit manual checks.
- [ ] Run `npm test`; all unit tests must pass.
- [ ] Run `npm run typecheck`; must pass.
- [ ] Run `npm run build`; must pass.
- [ ] Run `npm run build:cloudflare`; must complete the Wrangler dry-run bundle validation without deployment.
- [ ] Exercise TH and EN Detail flows on a small viewport and verify bottom sheets/fixed controls respect safe-area insets.
- [ ] Verify app load, list render, Detail open, card visibility, ETA mode selection, and local parking rendering cause zero Route/parking Google requests.
- [ ] Verify ETA calculate and Google parking search each require explicit clicks and produce exactly the expected request count.
- [ ] Verify public report submission cannot read queue data and an admin can transition reports with audit metadata.
- [ ] Verify no Google discovery candidate is automatically written to canonical place data.
- [ ] Commit final fixes as `fix: complete Phase 3 acceptance`.

### Task 6: Integration review handoff

- [ ] Review branch diff against the Phase 3 spec and remove unrelated refactors.
- [ ] Confirm `AroundMyDormApp.tsx` did not gain new business logic that belongs in Phase 3 modules.
- [ ] Confirm no persistent storage was added for transient Google route/parking results contrary to the spec.
- [ ] Prepare PR summary with four implementation slices: 3A Freshness/Opening, 3B Reports, 3C ETA, 3D Parking/Integration; include Supabase migration details and CI evidence.
- [ ] Do not deploy production as part of this task; deployment remains a separate explicit action.
