# Around My Dorm V2 Phase 2B — Place Card Recommendation Reasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the same compact, fact-based `Recommended now` reason line directly under discovery place metadata so users can understand why each shop is being surfaced.

**Architecture:** `PlaceCard` remains presentational. The app shell computes reason text with `buildRecommendationReasonLine()` from the Phase 2B discovery plan and passes it as an optional prop; `PlaceCard` only renders non-empty text and never computes recommendation scores itself.

**Tech Stack:** React, TypeScript, existing `PlaceCard`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-around-my-dorm-v2-phases-2-6-design.md`

## Global Constraints

- Reasons use stored/derived facts only; never invent hours, price, walking time, parking, rating, or route data.
- No Google/LLM/network request may be introduced by reason computation or rendering.
- Existing `contextMeta` behavior for Recent/Saved contexts must remain unchanged.
- Empty/Unknown facts are omitted rather than displayed as fake values.

---

### Task 1: Add optional reason-line rendering to PlaceCard

**Files:**
- Modify: `components/PlaceCard.tsx`
- Create: `tests/place-card-recommendation-reason.test.ts`

**Interfaces:**

Extend the existing props with:

```ts
recommendationReason?: string;
```

- [ ] **Step 1: Write the failing source-level/component contract test**

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(process.cwd(), "components/PlaceCard.tsx"), "utf8");

describe("PlaceCard recommendation reason", () => {
  it("supports an optional recommendationReason without replacing contextMeta", () => {
    expect(source).toContain("recommendationReason?: string");
    expect(source).toContain("{recommendationReason &&");
    expect(source).toContain("contextMeta");
  });
});
```

- [ ] **Step 2: Run test and verify RED**

```bash
npm test -- --run tests/place-card-recommendation-reason.test.ts
```

Expected: FAIL because `recommendationReason` is not a PlaceCard prop yet.

- [ ] **Step 3: Implement minimal rendering**

Add the prop to the destructuring/type and render it below the known status/price/distance metadata:

```tsx
{recommendationReason && (
  <p
    data-testid="place-recommendation-reason"
    className="mt-2 truncate text-[10px] font-medium text-[#79bfff]"
  >
    {recommendationReason}
  </p>
)}
```

Do not replace `contextMeta`; that remains for contextual labels such as recent-view timestamps.

- [ ] **Step 4: Run test and verify GREEN**

```bash
npm test -- --run tests/place-card-recommendation-reason.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add components/PlaceCard.tsx tests/place-card-recommendation-reason.test.ts
git commit -m "feat: show recommendation reasons on place cards"
```

---

### Task 2: Feed shared reason lines into Explore cards

**Files:**
- Modify: `components/AroundMyDormApp.tsx`
- Modify: `tests/discovery-ui-integration.test.ts`

**Interfaces:**
- Consumes `buildRecommendationReasonLine(place, recommendationContext, settings.language)` from `lib/discovery/recommendation-reasons.ts` defined in the main Phase 2B plan.
- Produces `recommendationReason` props for Explore discovery `PlaceCard` instances.

- [ ] **Step 1: Add RED integration assertions**

```ts
expect(appSource).toContain("buildRecommendationReasonLine");
expect(appSource).toContain("recommendationReason=");
```

Also assert there is no numeric recommendation score rendered to the card.

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run tests/discovery-ui-integration.test.ts
```

- [ ] **Step 3: Wire the reason prop at the Explore result-card call site**

Use:

```tsx
recommendationReason={buildRecommendationReasonLine(
  place,
  recommendationContext,
  settings.language,
)}
```

For contexts where the card is shown as a historical/saved item and a recommendation explanation is not useful, omit the prop. This keeps Recent/Saved semantics clean.

- [ ] **Step 4: Run focused tests**

```bash
npm test -- --run tests/discovery-ui-integration.test.ts tests/place-card-recommendation-reason.test.ts tests/recommendation-reasons.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add components/AroundMyDormApp.tsx tests/discovery-ui-integration.test.ts
git commit -m "feat: explain explore recommendations on cards"
```

---

## Companion-plan gate

This companion plan is required before Phase 2B is considered complete. Run it after Task 4 of `2026-09-14-around-my-dorm-v2-phase-2b-search-discovery-food-now.md` creates `buildRecommendationReasonLine()` and before the final Phase 2B E2E gate.
