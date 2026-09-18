# Phase 3A Freshness + Opening Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add field-level freshness computation and richer opening/closing-soon presentation without background API requests.

**Architecture:** Introduce a focused freshness utility under `lib/` and reuse the existing `getPlaceOpenStatus()` engine. Keep presentation changes in small components/helpers so `AroundMyDormApp.tsx` does not absorb business logic.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.8, Vitest, existing Place model.

**Spec:** `docs/superpowers/specs/2026-09-17-phase-3-decision-intelligence-design.md`

## Global Constraints

- No Google API request may be triggered by app load, list render, detail open, or viewport entry.
- Freshness is computed at runtime; do not persist computed freshness status.
- Freshness is independent per field family.
- Do not invent verification timestamps.
- Opening state and freshness are separate signals.
- Preserve TH/EN behavior and small-screen safe-area behavior.

---

## File Structure

- Create `lib/place-freshness.ts` — thresholds, timestamp precedence, freshness result type, age calculation.
- Create `components/PlaceFreshnessNotice.tsx` — compact localized freshness warning/label.
- Modify `lib/place-ranking.ts` or current open-status utility file only where necessary to expose time-to-open/close values without changing existing semantics.
- Modify `components/PlaceCard.tsx` if present; otherwise the extracted card component used by `AroundMyDormApp.tsx` — display high-value opening/freshness signals.
- Modify the current Place Detail component — show field freshness rows and opening transition copy.
- Modify `components/DataQualityDashboard.tsx` — field freshness metrics and affected-place counts.
- Add `tests/place-freshness.test.ts` and `tests/opening-intelligence-phase3.test.ts`.

### Task 1: Freshness engine

**Interfaces:**
- Produces `type FreshnessField = "openingHours" | "price" | "parking" | "contact" | "location" | "image"`.
- Produces `type FreshnessStatus = "fresh" | "aging" | "stale" | "unknown"`.
- Produces `getFieldFreshness(place: Place, field: FreshnessField, now?: Date): { status: FreshnessStatus; ageDays: number | null; verifiedAt: string | null }`.

- [ ] **Step 1: Write failing threshold and precedence tests** in `tests/place-freshness.test.ts` covering 14/30/60/90/180-day boundaries, missing timestamps, provenance precedence, and two fields aging independently.
- [ ] **Step 2: Run RED** with `npm test -- tests/place-freshness.test.ts`; expect missing module/function failures.
- [ ] **Step 3: Implement minimal engine** in `lib/place-freshness.ts` with a threshold map and explicit timestamp selectors. Use floor-day age in Bangkok-neutral UTC elapsed time; negative/future timestamps resolve to age 0 rather than stale.
- [ ] **Step 4: Run GREEN** with `npm test -- tests/place-freshness.test.ts` and `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: add field freshness engine`.

### Task 2: Opening transition presentation

**Interfaces:**
- Consumes existing `getPlaceOpenStatus(place, now)`.
- Produces helper `formatOpenTransition(status, now?, locale?): string | null` in the same open-status module or a focused `lib/opening-intelligence.ts`.

- [ ] **Step 1: Write failing tests** for `CLOSING_SOON`, `OPENING_SOON`, overnight close, multiple periods, and stale-hours warning remaining independent from calculated status.
- [ ] **Step 2: Run RED** with `npm test -- tests/opening-intelligence-phase3.test.ts`.
- [ ] **Step 3: Implement formatting helper** so copy can render forms equivalent to `อีก 18 นาที`, `เปิดอีกครั้ง 17:00`, and normal `ปิด 21:00`, while preserving existing status calculation.
- [ ] **Step 4: Run GREEN** for the new test plus existing opening-hours tests found in `tests/`.
- [ ] **Step 5: Commit** `feat: add opening transition intelligence`.

### Task 3: Freshness UI on cards and details

**Interfaces:**
- Consumes `getFieldFreshness()` and opening transition helper.
- Produces `PlaceFreshnessNotice` props `{ place: Place; field: FreshnessField; locale: "th" | "en"; compact?: boolean }`.

- [ ] **Step 1: Write failing component/source tests** asserting card UI does not add a large badge for fresh state and does show concise aging/stale/unknown copy; detail UI shows opening and price freshness separately.
- [ ] **Step 2: Run RED** for those tests.
- [ ] **Step 3: Implement `PlaceFreshnessNotice.tsx`** with localized labels and no API effects.
- [ ] **Step 4: Integrate into the existing place card and detail path**; keep business logic out of `AroundMyDormApp.tsx` except props/wiring if unavoidable.
- [ ] **Step 5: Run GREEN** with targeted tests, `npm run typecheck`, and `npm run build`.
- [ ] **Step 6: Commit** `feat: surface freshness and opening signals`.

### Task 4: Data Quality freshness metrics

**Interfaces:**
- Consumes `getFieldFreshness()`.
- Produces dashboard metrics for fresh percentages and stale/unknown counts.

- [ ] **Step 1: Write failing tests** for metric aggregation: opening-hours fresh %, price fresh %, parking fresh %, location fresh %, stale-opening count, unknown-price-date count.
- [ ] **Step 2: Run RED**.
- [ ] **Step 3: Add focused aggregation helper** under `lib/data-quality.ts` or a new `lib/freshness-metrics.ts`, then wire `DataQualityDashboard.tsx` to it.
- [ ] **Step 4: Run GREEN** with targeted tests and `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: add freshness quality metrics`.

### Task 5: Phase 3A verification

- [ ] Run `npm test` and confirm all unit tests pass.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run `npm run build:cloudflare`; confirm dry-run bundle validation succeeds and no deploy occurs.
- [ ] Review network-triggering code to confirm Phase 3A introduced zero automatic Google requests.
- [ ] Commit any verification-only fixes as `fix: stabilize Phase 3A freshness opening`.
