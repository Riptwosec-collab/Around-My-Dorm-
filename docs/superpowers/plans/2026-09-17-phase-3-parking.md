# Phase 3 Parking Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank nearby parking from canonical data first and expose an explicit manual Google fallback without fabricating walking time or auto-importing Google results.

**Architecture:** Add a pure local parking matcher plus a transient manual Google parking search service. Place Detail renders local top matches immediately; Google discovery runs only after the user presses `ค้นหาที่จอดเพิ่ม`/`Find more parking`.

**Tech Stack:** TypeScript, React, Vitest, existing Google Places controls and place-candidate review flow.

**Spec:** `docs/superpowers/specs/2026-09-17-phase-3-decision-intelligence-design.md`

## Global Constraints

- Local canonical parking data is always ranked first.
- Eligible categories: `parking`, `monthly_parking`.
- Missing coordinates means candidate cannot be presented as distance-ranked.
- Straight-line distance may be shown, but never converted into walking minutes.
- Google fallback requires explicit click.
- Google fallback candidates remain transient and are never auto-imported.

---

### Task 1: Pure local parking matcher

**Files:**
- Create: `lib/discovery/parking-match.ts`
- Test: `tests/parking-match.test.ts`

**Interfaces:**
- Produces: `type ParkingMatch = { place: Place; distanceKm: number; walkingMinutes: number | null; score: number; reasons: string[] }`.
- Produces: `rankNearbyParking(target: Place, places: Place[], options?: { limit?: number }): ParkingMatch[]`.

- [ ] **Step 1: Write failing ranking tests**

Cover: excludes non-parking categories, excludes candidates without coordinates from ranked results, orders near/available/value/24h signals predictably, preserves verified walking minutes when present, and leaves walking minutes null when absent.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/parking-match.test.ts`
Expected: FAIL because module is missing.

- [ ] **Step 3: Implement deterministic ranking**

Use Haversine only for `distanceKm`. Score using known fields: proximity, `parkingDetails.availabilityStatus`, known route-derived walking minutes, price, `access24Hours`, covered/CCTV/security. Never invent missing values.

- [ ] **Step 4: Run GREEN and commit**

Run: `npm test -- tests/parking-match.test.ts`
Expected: PASS.

```bash
git add lib/discovery/parking-match.ts tests/parking-match.test.ts
git commit -m "feat: add local parking matcher"
```

### Task 2: Local parking panel

**Files:**
- Create: `components/NearbyParkingPanel.tsx`
- Modify: `components/PlaceDetail.tsx`
- Test: `tests/nearby-parking-panel.test.tsx`

**Interfaces:**
- `NearbyParkingPanel({ target, places, language }: { target: Place; places: Place[]; language: "th" | "en" })`.
- Consumes `rankNearbyParking()`.

- [ ] **Step 1: Write failing UI tests**

Assert up to three local matches render with known distance, price/access/availability facts; missing walking ETA is not replaced by an estimate; directions/details actions exist.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/nearby-parking-panel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement panel**

Keep public copy explicit: `สถานะที่ว่างยังไม่ยืนยัน`/`Availability not verified` for unknown availability. Add `ดูที่จอดทั้งหมด` and a separate manual `ค้นหาที่จอดเพิ่ม` action.

- [ ] **Step 4: Wire canonical place collection into Place Detail**

Prefer a small prop from the shell/database hook rather than importing `PLACES` directly into the panel. If the existing `PlaceDetail` call only receives one place, extend its props with `allPlaces: Place[]` and pass `databasePlaces` from `AroundMyDormApp.tsx`; do not move matching logic into the app shell.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/nearby-parking-panel.test.tsx tests/parking-match.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add components/NearbyParkingPanel.tsx components/PlaceDetail.tsx components/AroundMyDormApp.tsx tests/nearby-parking-panel.test.tsx
git commit -m "feat: show local nearby parking"
```

### Task 3: Explicit Google parking fallback

**Files:**
- Create: `lib/google-parking-runtime.ts`
- Modify: `components/NearbyParkingPanel.tsx`
- Test: `tests/google-parking-runtime.test.ts`
- Test: `tests/parking-google-manual-action.test.tsx`

**Interfaces:**
- Produces: `searchTransientParking(target: Place, options?: { fetchImpl?: typeof fetch }): Promise<PlaceCandidate[]>`.
- Results are runtime-only discovery candidates.

- [ ] **Step 1: Write failing no-auto-request tests**

Assert rendering Place Detail/panel makes zero Google parking requests; clicking only local controls makes zero; clicking `ค้นหาที่จอดเพิ่ม` makes one explicit search.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/google-parking-runtime.test.ts tests/parking-google-manual-action.test.tsx`
Expected: FAIL because fallback does not exist.

- [ ] **Step 3: Implement transient search**

Reuse existing Google request controls/candidate normalization where possible. Query around the target place coordinates for parking. Keep results in component/runtime state only; do not call canonical publish/import functions automatically.

- [ ] **Step 4: Render transient section**

Clearly distinguish `ผลค้นหาเพิ่มเติม`/`Additional search results` from Around My Dorm canonical parking. Admin import/review may be exposed only through the existing review flow.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- tests/google-parking-runtime.test.ts tests/parking-google-manual-action.test.tsx && npm run typecheck`
Expected: PASS.

```bash
git add lib/google-parking-runtime.ts components/NearbyParkingPanel.tsx tests/google-parking-runtime.test.ts tests/parking-google-manual-action.test.tsx
git commit -m "feat: add manual parking discovery fallback"
```
