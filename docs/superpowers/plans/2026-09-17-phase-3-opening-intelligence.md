# Phase 3 Opening Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade opening-status copy so cards/details show useful time-to-open/time-to-close information while preserving overnight and multi-period correctness.

**Architecture:** Extend the existing pure `getPlaceOpenStatus()` result with minute deltas instead of creating a second opening-hours engine. UI consumes the same source of truth and combines it with field freshness from the Phase 3 freshness plan.

**Tech Stack:** TypeScript, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-phase-3-decision-intelligence-design.md`

## Global Constraints

- Reuse `getPlaceOpenStatus()`; do not add a parallel scheduler.
- `CLOSING_SOON` and `OPENING_SOON` threshold remains 30 minutes.
- Overnight periods and multiple periods must continue working.
- Live Google `liveOpenNow` remains authoritative when present, but no new Google request may be triggered by status rendering.
- TH/EN copy must be supported.

---

### Task 1: Add exact transition minutes to open-status result

**Files:**
- Modify: `lib/place-utils.ts`
- Test: `tests/place-opening-intelligence.test.ts`

**Interfaces:**
- Modify `SmartOpenStatus` to include `minutesUntilClose: number | null` and `minutesUntilOpen: number | null`.

- [ ] **Step 1: Write failing transition tests**

```ts
it("reports 18 minutes until close", () => {
  const result = getPlaceOpenStatus(placeOpenUntil2100, new Date("2026-09-17T13:42:00.000Z"));
  expect(result.status).toBe("CLOSING_SOON");
  expect(result.minutesUntilClose).toBe(18);
});
```

Also cover an overnight period such as `18:00-02:00`, a second same-day opening period, and an opening in 12 minutes.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/place-opening-intelligence.test.ts`
Expected: FAIL because minute fields are absent.

- [ ] **Step 3: Extend `SmartOpenStatus` and every return branch**

Every result must populate both new fields explicitly. Unknown/24h/live boolean-only status uses `null` when an exact transition is not derivable.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- tests/place-opening-intelligence.test.ts tests/place-utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/place-utils.ts tests/place-opening-intelligence.test.ts
git commit -m "feat: expose opening transition minutes"
```

### Task 2: Add localized opening intelligence formatter

**Files:**
- Create: `lib/opening-intelligence.ts`
- Test: `tests/opening-intelligence-copy.test.ts`

**Interfaces:**
- Produces: `formatOpeningIntelligence(status: SmartOpenStatus, language: "th" | "en"): { primary: string; secondary: string | null }`.

- [ ] **Step 1: Write failing copy tests**

Assert Thai `ใกล้ปิด • อีก 18 นาที`, English `Closing soon • 18 min`, regular open `เปิดอยู่ • ปิด 21:00`, and opening-soon equivalents.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/opening-intelligence-copy.test.ts`
Expected: FAIL because formatter does not exist.

- [ ] **Step 3: Implement pure formatter**

Formatter must not call `Date.now()` or fetch anything. It only transforms `SmartOpenStatus`.

- [ ] **Step 4: Run GREEN and commit**

Run: `npm test -- tests/opening-intelligence-copy.test.ts`
Expected: PASS.

```bash
git add lib/opening-intelligence.ts tests/opening-intelligence-copy.test.ts
git commit -m "feat: add opening intelligence copy"
```

### Task 3: Render opening intelligence on card and detail

**Files:**
- Modify: `components/PlaceCard.tsx`
- Modify: `components/PlaceDetail.tsx`
- Test: `tests/opening-intelligence-ui.test.ts`

**Interfaces:**
- Consumes: `formatOpeningIntelligence()`.
- Consumes freshness warning from `lib/place-freshness.ts` when available.

- [ ] **Step 1: Write failing UI tests**

Assert card/detail import the formatter, do not trigger Google calls, and render stale-hours warning independently from open state.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/opening-intelligence-ui.test.ts`
Expected: FAIL.

- [ ] **Step 3: Wire UI**

Replace ad-hoc `{status.label}{status.secondaryText...}` rendering with the formatter. Keep card compact; put the fuller status and stale warning in Place Detail.

- [ ] **Step 4: Run verification**

Run: `npm test -- tests/opening-intelligence-ui.test.ts tests/place-opening-intelligence.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/PlaceCard.tsx components/PlaceDetail.tsx tests/opening-intelligence-ui.test.ts
git commit -m "feat: surface opening intelligence"
```
