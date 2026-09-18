# Phase 3 Freshness Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add field-level freshness calculation and actionable freshness metrics without persisting derived status.

**Architecture:** Create one pure freshness module used by cards, details, and the existing Data Quality dashboard. Reuse `fieldProvenance` and field-specific verified timestamps; UI consumes a stable `FieldFreshness` result instead of reimplementing age rules.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.8, Vitest 3, existing Supabase-backed place model.

**Spec:** `docs/superpowers/specs/2026-09-17-phase-3-decision-intelligence-design.md`

## Global Constraints

- Do not persist computed freshness status.
- Opening hours: fresh 0–14d, aging 15–30d, stale >30d.
- Price and parking: fresh 0–30d, aging 31–60d, stale >60d.
- Contact: fresh 0–90d, stale >90d.
- Location/address and images: fresh 0–180d, stale >180d.
- Missing timestamp resolves to `unknown`.
- `fieldProvenance` wins over field-specific timestamps when the field matches.
- TH/EN output must stay supported.

---

### Task 1: Pure freshness engine

**Files:**
- Create: `lib/place-freshness.ts`
- Test: `tests/place-freshness.test.ts`

**Interfaces:**
- Produces: `type FreshnessField = "openingHours" | "price" | "parking" | "contact" | "location" | "image"`
- Produces: `type FieldFreshness = { status: "fresh" | "aging" | "stale" | "unknown"; ageDays: number | null; verifiedAt: string | null }`
- Produces: `getFieldFreshness(place: Place, field: FreshnessField, now?: Date): FieldFreshness`
- Produces: `formatFreshnessLabel(result: FieldFreshness, language: "th" | "en"): string`

- [ ] **Step 1: Write failing boundary tests**

```ts
import { describe, expect, it } from "vitest";
import { getFieldFreshness } from "@/lib/place-freshness";

it("marks opening hours day 14 fresh, day 15 aging, day 31 stale", () => {
  const base = { fieldProvenance: {}, openingHoursVerifiedAt: "2026-09-03T00:00:00.000Z" } as any;
  expect(getFieldFreshness(base, "openingHours", new Date("2026-09-17T00:00:00.000Z")).status).toBe("fresh");
  expect(getFieldFreshness({ ...base, openingHoursVerifiedAt: "2026-09-02T00:00:00.000Z" }, "openingHours", new Date("2026-09-17T00:00:00.000Z")).status).toBe("aging");
  expect(getFieldFreshness({ ...base, openingHoursVerifiedAt: "2026-08-17T00:00:00.000Z" }, "openingHours", new Date("2026-09-17T00:00:00.000Z")).status).toBe("stale");
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/place-freshness.test.ts`
Expected: FAIL because `@/lib/place-freshness` does not exist.

- [ ] **Step 3: Implement threshold table and timestamp resolver**

```ts
const THRESHOLDS = {
  openingHours: { fresh: 14, aging: 30 },
  price: { fresh: 30, aging: 60 },
  parking: { fresh: 30, aging: 60 },
  contact: { fresh: 90 },
  location: { fresh: 180 },
  image: { fresh: 180 },
} as const;
```

Resolver order must be matching `fieldProvenance` -> field timestamp -> unknown. Do not use unrelated `lastUpdated` as a generic fallback.

- [ ] **Step 4: Add precedence, invalid-date, and label tests**

Cover provenance winning over `openingHoursVerifiedAt`, invalid dates becoming `unknown`, Thai and English labels, and future timestamps clamped to age 0.

- [ ] **Step 5: Run GREEN**

Run: `npm test -- tests/place-freshness.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/place-freshness.ts tests/place-freshness.test.ts
git commit -m "feat: add field freshness engine"
```

### Task 2: Wire freshness into public place UI

**Files:**
- Modify: `components/PlaceCard.tsx`
- Modify: `components/PlaceDetail.tsx`
- Test: `tests/place-freshness-ui.test.ts`

**Interfaces:**
- Consumes: `getFieldFreshness()` and `formatFreshnessLabel()` from Task 1.

- [ ] **Step 1: Write failing UI source/behavior tests**

Assert that `PlaceCard` uses opening freshness only for a compact warning and that `PlaceDetail` renders separate opening/price/parking freshness values.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/place-freshness-ui.test.ts`
Expected: FAIL because components still use the old coarse freshness calls.

- [ ] **Step 3: Replace coarse detail freshness with field-level results**

Use:

```ts
const openingFreshness = getFieldFreshness(place, "openingHours");
const priceFreshness = getFieldFreshness(place, "price");
const parkingFreshness = getFieldFreshness(place, "parking");
```

Keep fresh data visually quiet; surface `aging`, `stale`, and `unknown` where useful. Do not mark the whole place stale because one field is old.

- [ ] **Step 4: Run GREEN and regression tests**

Run: `npm test -- tests/place-freshness-ui.test.ts tests/place-utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/PlaceCard.tsx components/PlaceDetail.tsx tests/place-freshness-ui.test.ts
git commit -m "feat: show field freshness in place UI"
```

### Task 3: Freshness metrics in Data Quality dashboard

**Files:**
- Modify: `lib/data-quality.ts`
- Modify: `components/DataQualityDashboard.tsx`
- Test: `tests/data-quality-freshness.test.ts`

**Interfaces:**
- Produces: `buildFreshnessSummary(places: Place[], now?: Date)` with counts/percentages for opening, price, parking, and location plus stale/unknown place IDs.

- [ ] **Step 1: Write failing summary tests**

Use a small set of places with independent timestamps and assert exact percentages plus stale IDs.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/data-quality-freshness.test.ts`
Expected: FAIL because `buildFreshnessSummary` is missing.

- [ ] **Step 3: Implement summary and dashboard cards**

Add actionable metrics: opening fresh %, price fresh %, parking fresh %, location fresh %, stale opening count, unknown price verification count.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- tests/data-quality-freshness.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/data-quality.ts components/DataQualityDashboard.tsx tests/data-quality-freshness.test.ts
git commit -m "feat: add freshness metrics to data quality"
```
