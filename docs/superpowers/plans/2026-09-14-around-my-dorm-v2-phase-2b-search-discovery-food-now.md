# Around My Dorm V2 Phase 2B — Search, Discovery & Food Now Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic Thai/English natural-language discovery, explainable `Recommended now` ranking, search-assist/history, and a smarter multi-result “กินอะไรดีตอนนี้” flow without introducing any Google/LLM request during normal browsing.

**Architecture:** Parse the user query with pure local functions into a structured `DiscoveryIntent`, combine that intent with the existing explicit `FilterState`, category, radius, and sort controls, then feed one shared discovery engine used by Explore and later Map/Home surfaces. Extract Food Now ranking out of `AroundMyDormApp.tsx` into a pure module that reuses the same ranking/reason primitives, so UI surfaces do not maintain separate recommendation logic.

**Tech Stack:** Next.js/React, TypeScript, Vitest, Playwright, existing `Place`/`FilterState`/`RecommendationContext` types, local/Supabase-backed app state only.

**Spec:** `docs/superpowers/specs/2026-09-14-around-my-dorm-v2-phases-2-6-design.md`

## Global Constraints

- Normal Home/Explore/Map/Saved/Recent browsing, search, filtering, scrolling, selecting cards, and selecting markers must cause **0 Google Maps/Places requests** before an explicit Google action.
- Natural-language parsing and ranking are deterministic/local; no LLM is required.
- Unknown values remain Unknown. Do not infer opening hours, price, walking time, parking, amenities, rating, route data, or image data.
- Explicit filters remain strict. If a filter requires data that is Unknown, that place does not pass the filter.
- Query-derived constraints and UI filters use the same discovery engine; do not create a second search/filter implementation.
- Recommendation reasons must be explainable from stored facts, e.g. `เปิดอยู่ • 420 ม. • ฿50–80 • LOCAL`; never expose an opaque numeric score to users.
- Existing Saved, Recent, Collections, TH/EN, canonical IDs/slugs, candidate/review workflow, and strict manual Google controls must continue to work.
- Keep current `SortMode` IDs compatible unless a new mode is required; `recommended` becomes the UI label `แนะนำตอนนี้ / Recommended now`.
- All time-sensitive tests inject `now` through `RecommendationContext` or an explicit function argument.
- Use RED → GREEN TDD for every task, with a commit after each independently testable task.

---

## File Structure

```text
lib/discovery/
  query-intent.ts                 # Thai/English parser; query -> structured local intent
  intent-filters.ts               # deterministic merge/conflict semantics
  derive-visible-places.ts        # single shared filter/search/radius/sort engine
  recommendation-reasons.ts       # compact user-facing fact line
  food-now.ts                     # pure Food Now constraints + ranking

lib/storage/
  search-history.ts               # local search history, max 20 entries

components/
  DiscoverySearchAssist.tsx       # parsed chips, recent searches, conflict/relax actions
  FoodNowSheet.tsx                # options + top 3–5 results instead of auto-opening one place
  AroundMyDormApp.tsx             # orchestration only; no inline parsing/scoring

lib/place-ranking.ts              # Recommended now score and existing sort modes
lib/app-shell-config.ts           # sort labels only

tests/
  discovery-query-intent.test.ts
  discovery-intent-filters.test.ts
  discovery-engine.test.ts
  recommendation-now.test.ts
  recommendation-reasons.test.ts
  search-history.test.ts
  food-now.test.ts
  discovery-ui-integration.test.ts

e2e/
  search-discovery-v2.spec.ts
```

---

### Task 1: Deterministic Thai/English query parser

**Files:**
- Create: `lib/discovery/query-intent.ts`
- Create: `tests/discovery-query-intent.test.ts`

**Interfaces:**
- Consumes: raw search query string.
- Produces:

```ts
export type DiscoveryIntent = {
  categoryIds: CategoryId[];
  filterPatch: Partial<FilterState>;
  suggestedSortMode: SortMode | null;
  freeText: string;
  recognizedLabels: string[];
};

export function parseDiscoveryQuery(query: string): DiscoveryIntent;
```

- [ ] **Step 1: Write the failing parser tests**

```ts
import { describe, expect, it } from "vitest";
import { parseDiscoveryQuery } from "@/lib/discovery/query-intent";

describe("parseDiscoveryQuery", () => {
  it("parses Thai category + budget + open-now intent", () => {
    expect(parseDiscoveryQuery("ข้าวไม่เกิน 80 เปิดอยู่")).toMatchObject({
      categoryIds: expect.arrayContaining(["food", "local_food", "thai_food"]),
      filterPatch: { maxPrice: 80, onlyOpen: true },
      freeText: "",
    });
  });

  it("parses cafe + walkable and keeps no fabricated route value", () => {
    expect(parseDiscoveryQuery("กาแฟเดินถึง")).toMatchObject({
      categoryIds: ["cafe"],
      filterPatch: { maxWalkingMinutes: 10 },
    });
  });

  it("parses mookata late-night intent", () => {
    expect(parseDiscoveryQuery("หมูกระทะเปิดดึก")).toMatchObject({
      categoryIds: ["mookata"],
      filterPatch: { openLate: true },
    });
  });

  it("parses parking and local intent", () => {
    expect(parseDiscoveryQuery("ร้าน local มีที่จอด")).toMatchObject({
      filterPatch: { localOnly: true, parking: true },
    });
  });

  it("normalizes Thai numerals", () => {
    expect(parseDiscoveryQuery("ไม่เกิน ๑๐๐ บาท").filterPatch.maxPrice).toBe(100);
  });

  it("keeps unrecognized words as free text", () => {
    expect(parseDiscoveryQuery("กาแฟ ร้านป้าสมใจ")).toMatchObject({
      categoryIds: ["cafe"],
      freeText: "ร้านป้าสมใจ",
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- --run tests/discovery-query-intent.test.ts
```

Expected: FAIL because `@/lib/discovery/query-intent` does not exist.

- [ ] **Step 3: Implement the parser as pure local code**

Start with this explicit vocabulary; keep it data-driven rather than nested conditionals:

```ts
const CATEGORY_RULES: Array<{ pattern: RegExp; categories: CategoryId[]; label: string }> = [
  { pattern: /(กาแฟ|คาเฟ่|coffee)/iu, categories: ["cafe"], label: "คาเฟ่" },
  { pattern: /(ก๋วยเตี๋ยว|เส้น|noodle)/iu, categories: ["noodle"], label: "ก๋วยเตี๋ยว" },
  { pattern: /(หมูกระทะ)/iu, categories: ["mookata"], label: "หมูกระทะ" },
  { pattern: /(ชาบู|hotpot)/iu, categories: ["hotpot"], label: "ชาบู" },
  { pattern: /(ข้าว|อาหาร|กินข้าว)/iu, categories: ["food", "local_food", "thai_food", "isan_food"], label: "อาหาร" },
];
```

Normalize `๐๑๒๓๔๕๖๗๘๙` to ASCII digits before parsing. Recognize these constraints without provider calls:

```text
เปิดอยู่ / ตอนนี้          -> onlyOpen=true
เปิดดึก                    -> openLate=true
24 ชม / 24 ชั่วโมง         -> only24Hours=true
มีที่จอด                   -> parking=true
นั่งทำงาน / work-friendly -> goodForWorking=true
wifi / ไวไฟ                -> wifi=true
ปลั๊ก                       -> powerOutlet=true
แอร์                        -> airConditioned=true
local / ร้านท้องถิ่น       -> localOnly=true
เดินถึง                     -> maxWalkingMinutes=10
ไม่เกิน N / ≤ N / under N -> maxPrice=N
ใกล้สุด                     -> suggestedSortMode=distanceAsc
ราคาถูก                     -> suggestedSortMode=price
```

Remove only recognized spans from `freeText`, collapse whitespace, and return deduplicated categories/labels. Do not interpret ambiguous words beyond this dictionary.

- [ ] **Step 4: Run parser tests and verify GREEN**

```bash
npm test -- --run tests/discovery-query-intent.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/discovery/query-intent.ts tests/discovery-query-intent.test.ts
git commit -m "feat: parse local discovery queries"
```

---

### Task 2: Merge query intent with strict UI filters and detect conflicts

**Files:**
- Create: `lib/discovery/intent-filters.ts`
- Create: `tests/discovery-intent-filters.test.ts`

**Interfaces:**

```ts
export type DiscoveryConflict =
  | { type: "category"; messageKey: "category_conflict" }
  | { type: "budget"; messageKey: "budget_conflict" }
  | { type: "walking"; messageKey: "walking_conflict" };

export function mergeIntentFilters(
  explicit: FilterState,
  intent: DiscoveryIntent,
): FilterState;

export function effectiveIntentCategories(
  explicitCategory: "all" | CategoryId,
  intent: DiscoveryIntent,
): CategoryId[] | null;

export function detectDiscoveryConflicts(
  explicitCategory: "all" | CategoryId,
  explicitFilters: FilterState,
  intent: DiscoveryIntent,
): DiscoveryConflict[];
```

- [ ] **Step 1: Write failing merge/conflict tests**

```ts
it("uses the stricter budget ceiling", () => {
  const explicit = { ...EMPTY_FILTERS, maxPrice: 100 };
  const intent = parseDiscoveryQuery("ไม่เกิน 80");
  expect(mergeIntentFilters(explicit, intent).maxPrice).toBe(80);
});

it("ORs strict boolean constraints without turning Unknown into false facts", () => {
  const merged = mergeIntentFilters(
    { ...EMPTY_FILTERS, parking: true },
    parseDiscoveryQuery("เปิดอยู่"),
  );
  expect(merged.parking).toBe(true);
  expect(merged.onlyOpen).toBe(true);
});

it("reports an explicit category conflict instead of silently changing the user's category", () => {
  expect(detectDiscoveryConflicts("cafe", EMPTY_FILTERS, parseDiscoveryQuery("ก๋วยเตี๋ยว")))
    .toEqual([{ type: "category", messageKey: "category_conflict" }]);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- --run tests/discovery-intent-filters.test.ts
```

- [ ] **Step 3: Implement merge semantics**

Rules:

```text
boolean query constraint + explicit constraint -> logical OR
maxPrice                               -> minimum non-null value
maxWalkingMinutes                      -> minimum non-null value
priceLevels / area                     -> preserve explicit UI values
explicit category == all               -> query categoryIds apply
explicit category != all + compatible  -> explicit category applies
explicit category != all + incompatible-> conflict; do not silently rewrite it
```

- [ ] **Step 4: Run tests and verify GREEN**

```bash
npm test -- --run tests/discovery-intent-filters.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/discovery/intent-filters.ts tests/discovery-intent-filters.test.ts
git commit -m "feat: merge discovery intent with explicit filters"
```

---

### Task 3: Feed structured intent into the shared discovery engine

**Files:**
- Modify: `lib/discovery/derive-visible-places.ts`
- Modify: `tests/discovery-engine.test.ts`

**Interfaces:**

Extend `DiscoveryInput` with:

```ts
queryIntent: DiscoveryIntent;
```

Keep existing `query` for compatibility while `queryIntent.freeText` becomes the text passed to `matchesSearch`.

- [ ] **Step 1: Add RED tests to the existing shared engine suite**

```ts
it("applies natural query intent locally", () => {
  const result = deriveDiscoveryState({
    ...input([
      candidate("cheap open cafe", {
        category: "cafe",
        categories: ["cafe"],
        pricing: { ...seed.pricing, max: 80 },
      }),
      candidate("expensive cafe", {
        category: "cafe",
        categories: ["cafe"],
        pricing: { ...seed.pricing, max: 180 },
      }),
    ]),
    query: "กาแฟไม่เกิน 100",
    queryIntent: parseDiscoveryQuery("กาแฟไม่เกิน 100"),
  });
  expect(result.visiblePlaces.map((place) => place.id)).toEqual(["cheap open cafe"]);
});
```

Also add a test proving coordinate-less records are still handled exactly as before and no query intent invents distance/walking values.

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run tests/discovery-engine.test.ts
```

- [ ] **Step 3: Update `deriveDiscoveryState`**

Use the existing pipeline in this order:

```text
withDistance(stored place, selected origin)
-> explicit/query category constraints
-> matchesSearch(place, queryIntent.freeText)
-> passesFilters(place, mergeIntentFilters(...))
-> existing current-location coordinate rule
-> existing radius/Search This Area rule
-> existing sortPlaces()
```

Do not import Google modules or call any async function.

- [ ] **Step 4: Run parser + merge + engine tests**

```bash
npm test -- --run tests/discovery-query-intent.test.ts tests/discovery-intent-filters.test.ts tests/discovery-engine.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/discovery/derive-visible-places.ts tests/discovery-engine.test.ts
git commit -m "feat: apply structured intent in discovery engine"
```

---

### Task 4: Recommended-now scoring and compact explainable reasons

**Files:**
- Modify: `lib/place-ranking.ts`
- Create: `lib/discovery/recommendation-reasons.ts`
- Create: `tests/recommendation-now.test.ts`
- Create: `tests/recommendation-reasons.test.ts`
- Modify: `lib/app-shell-config.ts`

**Interfaces:**

```ts
export function recommendationScore(
  place: Place,
  context?: RecommendationContext,
): number;

export function buildRecommendationReasonLine(
  place: Place,
  context?: RecommendationContext,
  language?: "th" | "en",
): string;
```

- [ ] **Step 1: Write RED score tests using injected Bangkok time**

Test these priorities:

```text
open now                  +30
stored distance           0..25
explicit known budget fit 0..15 when a budget is supplied by caller
preferred category        +10
LOCAL/independent         +8
Hidden Gem                +5
verified/fresh            0..10
closed                    strong penalty
stale/unverified          small penalty
real rating               tie-break influence only, not primary rank driver
```

The base `recommendationScore` does not know an active budget. Keep budget-specific points in Food Now (Task 6), while the shared Recommended-now score handles the other dimensions.

Example test:

```ts
const now = new Date("2026-09-14T06:00:00.000Z"); // 13:00 Bangkok
expect(recommendationScore(openNearLocal, { now }))
  .toBeGreaterThan(recommendationScore(closedFarHighlyRated, { now }));
```

- [ ] **Step 2: Write RED reason-line tests**

```ts
expect(buildRecommendationReasonLine(place, { now }, "th"))
  .toBe("เปิดอยู่ • 420 ม. • ฿50–80 • LOCAL");
```

If hours/price/distance are Unknown, omit those facts rather than invent them. Never print `undefined`, `NaN`, or `0 ม.` for missing coordinates.

- [ ] **Step 3: Implement score/reason functions**

Use only canonical/stored fields plus derived straight-line `distanceKm`. For price text, prefer `pricing.displayText`; otherwise use known `pricing.min/max/fixed` or `averagePricePerPerson`. Do not translate `priceLevel` into fabricated baht amounts.

Change `SORT_OPTIONS` label only:

```ts
{ id: "recommended", label: "แนะนำตอนนี้" }
```

Keep the mode ID `recommended` to preserve state compatibility.

- [ ] **Step 4: Run focused tests**

```bash
npm test -- --run tests/recommendation-now.test.ts tests/recommendation-reasons.test.ts tests/place-ranking.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/place-ranking.ts lib/discovery/recommendation-reasons.ts lib/app-shell-config.ts tests/recommendation-now.test.ts tests/recommendation-reasons.test.ts
git commit -m "feat: rank and explain recommended-now places"
```

---

### Task 5: Search assist, parsed chips, recent queries, and conflict relaxation

**Files:**
- Create: `lib/storage/search-history.ts`
- Create: `components/DiscoverySearchAssist.tsx`
- Create: `tests/search-history.test.ts`
- Create: `tests/discovery-ui-integration.test.ts`
- Modify: `components/AroundMyDormApp.tsx`

**Interfaces:**

```ts
export type SearchHistoryItem = {
  query: string;
  usedAt: string;
};

export function loadSearchHistory(): SearchHistoryItem[];
export function recordSearchHistory(query: string, usedAt?: string): SearchHistoryItem[];
export function clearSearchHistory(): void;
```

`DiscoverySearchAssist` props:

```ts
{
  query: string;
  intent: DiscoveryIntent;
  conflicts: DiscoveryConflict[];
  history: SearchHistoryItem[];
  onUseHistory: (query: string) => void;
  onClearHistory: () => void;
  onRelaxConflict: (conflict: DiscoveryConflict) => void;
}
```

- [ ] **Step 1: Write RED storage tests**

Verify max 20 items, newest first, case/whitespace dedupe, empty queries ignored, and no network dependency.

- [ ] **Step 2: Write RED source-level integration tests**

Assert `AroundMyDormApp.tsx` imports/uses `parseDiscoveryQuery`, `DiscoverySearchAssist`, and passes `queryIntent` to `deriveDiscoveryState`. Assert it no longer sends the raw recognized phrase into text matching.

- [ ] **Step 3: Implement local history and assist component**

Show:
- parsed intent chips such as `คาเฟ่`, `≤ ฿100`, `เปิดอยู่`, `เดิน ≤10 นาที`;
- conflict banner with concrete action, e.g. `คำค้นหาขัดกับหมวด คาเฟ่` → button `ล้างหมวด`;
- recent searches only when the search field is focused and the current query is empty.

The assist component is presentational only and must not import Google modules.

- [ ] **Step 4: Integrate in `AroundMyDormApp.tsx`**

Add:

```ts
const queryIntent = useMemo(() => parseDiscoveryQuery(debouncedQuery), [debouncedQuery]);
const discoveryConflicts = useMemo(
  () => detectDiscoveryConflicts(category, filters, queryIntent),
  [category, filters, queryIntent],
);
```

Pass `queryIntent` into `deriveDiscoveryState`. Record history when a non-empty debounced query changes after the 250ms debounce; dedupe prevents spam.

When a recognized sort phrase exists and the user is still on `recommended`, expose a chip suggesting that sort; do not silently override an explicit sort the user already selected.

- [ ] **Step 5: Run tests**

```bash
npm test -- --run tests/search-history.test.ts tests/discovery-ui-integration.test.ts tests/discovery-engine.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/storage/search-history.ts components/DiscoverySearchAssist.tsx components/AroundMyDormApp.tsx tests/search-history.test.ts tests/discovery-ui-integration.test.ts
git commit -m "feat: add discovery search assist and history"
```

---

### Task 6: Extract deterministic Food Now recommender

**Files:**
- Create: `lib/discovery/food-now.ts`
- Create: `tests/food-now.test.ts`
- Modify: `components/AroundMyDormApp.tsx`

**Interfaces:**

```ts
export type FoodNowOptions = {
  budget: number | null;
  radius: number;
  localOnly: boolean;
  openNow: boolean;
  lateOnly: boolean;
};

export type FoodNowResult = {
  place: Place;
  score: number;
  reasonLine: string;
};

export function recommendFoodNow(
  places: Place[],
  options: FoodNowOptions,
  context: RecommendationContext,
  language: "th" | "en",
  limit?: number,
): FoodNowResult[];
```

Move `FoodNowOptions` from `components/FoodNowSheet.tsx` to this pure module; the component imports the type.

- [ ] **Step 1: Write RED behavior tests**

Cover:
- only `FOOD_CATEGORIES`;
- strict known-budget filter: Unknown price is excluded when a budget is set;
- strict open-now filter: Unknown hours do not pass `openNow=true`;
- radius uses known `distanceKm`; coordinate-less records may be considered only when radius is not a strict requirement — for this flow radius is always selected, so exclude unknown distance;
- preference adds ranking weight but cannot override a closed/open strict filter;
- after 21:00 Bangkok, `openLate`/24h receives a deterministic bonus;
- output is top 3 by default and each result has a non-empty fact-based `reasonLine`.

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run tests/food-now.test.ts
```

- [ ] **Step 3: Implement the pure recommender**

Filter first, score second. Recommended score composition:

```ts
score = recommendationScore(place, context)
  + budgetFitBonus   // +15 only when known and within requested budget
  + timeFitBonus;    // +8 late-night fit after 21:00 / before 05:00
```

Do not use `Math.random()` and do not call any provider.

- [ ] **Step 4: Remove the inline scoring block from `AroundMyDormApp.tsx`**

The app shell should call the pure function and store/display results; no duplicate scoring formula remains in the component.

- [ ] **Step 5: Run tests**

```bash
npm test -- --run tests/food-now.test.ts tests/place-ranking.test.ts tests/recommendation-reasons.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/discovery/food-now.ts components/AroundMyDormApp.tsx tests/food-now.test.ts
git commit -m "feat: extract deterministic food-now recommender"
```

---

### Task 7: Upgrade Food Now UI to show 3–5 explainable choices

**Files:**
- Modify: `components/FoodNowSheet.tsx`
- Modify: `components/AroundMyDormApp.tsx`
- Modify: `tests/discovery-ui-integration.test.ts`

**Interfaces:**

Change sheet props to:

```ts
{
  language: Language;
  defaultRadius: number;
  results: FoodNowResult[];
  onClose: () => void;
  onSubmit: (value: FoodNowOptions) => void;
  onOpenPlace: (place: Place) => void;
}
```

- [ ] **Step 1: Add RED integration assertions**

Assert the sheet renders result name + `reasonLine`, exposes a button per result, and `AroundMyDormApp` no longer auto-opens `ranked[0]` immediately after submitting options.

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run tests/discovery-ui-integration.test.ts
```

- [ ] **Step 3: Implement result state/UI**

Flow:

```text
open Food Now sheet
-> choose budget/radius/local/open/late
-> press "เลือกให้หน่อย"
-> compute 3–5 local results
-> same sheet transitions to result list
-> each row shows name + compact reason line + known price/distance/status only
-> user taps a result to open Place Detail
-> "ลองใหม่" returns to options without changing global filters
```

If no result exists, show deterministic relax actions such as:

```text
ขยายเป็น 2 กม.
ไม่จำกัดงบ
รวมร้านที่ไม่ทราบเวลาเปิด
```

Only apply the relaxation the user explicitly taps.

- [ ] **Step 4: Run focused tests**

```bash
npm test -- --run tests/food-now.test.ts tests/discovery-ui-integration.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add components/FoodNowSheet.tsx components/AroundMyDormApp.tsx tests/discovery-ui-integration.test.ts
git commit -m "feat: show explainable food-now choices"
```

---

### Task 8: P0 zero-Google regression and full Phase 2B verification

**Files:**
- Create: `e2e/search-discovery-v2.spec.ts`
- Modify only if needed for stable selectors: `components/AroundMyDormApp.tsx`, `components/DiscoverySearchAssist.tsx`, `components/FoodNowSheet.tsx`

**Interfaces:** None; this task is the release gate.

- [ ] **Step 1: Add E2E coverage for natural search and Google network invariant**

Use Playwright request observation for Google hosts and exercise:

```text
open Explore
search "ข้าวไม่เกิน 80 เปิดอยู่"
search "กาแฟเดินถึง"
change sort to Recommended now
open Food Now
submit options
open one Food Now result
clear query / use a recent search
```

Before any explicit Google action, assert captured Google Maps/Places requests count is `0`.

Suggested skeleton:

```ts
test("natural discovery and Food Now stay local-only", async ({ page }) => {
  const googleRequests: string[] = [];
  page.on("request", (request) => {
    if (/maps\.googleapis\.com|places\.googleapis\.com|maps\.google\.com/.test(request.url())) {
      googleRequests.push(request.url());
    }
  });

  await page.goto("/");
  await page.getByPlaceholder(/ค้นหา|search/i).fill("ข้าวไม่เกิน 80 เปิดอยู่");
  await expect(page.getByText(/80/)).toBeVisible();
  expect(googleRequests).toEqual([]);
});
```

- [ ] **Step 2: Run full unit suite**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Run static/data gates**

```bash
npm run lint
npm run typecheck
npm run validate:data
```

Expected: exit 0 for all commands.

- [ ] **Step 4: Run targeted Playwright**

```bash
npx playwright test e2e/search-discovery-v2.spec.ts e2e/p0-google-api-lock.spec.ts e2e/routing.spec.ts
```

Expected: all pass; natural search/filter/Food Now produces zero Google requests.

- [ ] **Step 5: Run production/Cloudflare gates**

```bash
npm run build
npx wrangler deploy --dry-run
```

Expected: both exit 0.

- [ ] **Step 6: Review final diff for duplicated logic**

Confirm:

```text
no query parser in AroundMyDormApp
no inline Food Now scoring in AroundMyDormApp
one passesFilters implementation
one shared deriveDiscoveryState path
no new Google import in discovery/parser/ranking/history modules
no fabricated Unknown values
```

- [ ] **Step 7: Commit gate/test changes**

```bash
git add e2e/search-discovery-v2.spec.ts components/AroundMyDormApp.tsx components/DiscoverySearchAssist.tsx components/FoodNowSheet.tsx
git commit -m "test: gate Phase 2B local discovery behavior"
```

---

## Phase 2B Definition of Done

```text
Thai/English deterministic parser handles approved phrases
recognized query constraints become structured filters
unrecognized words remain text search
explicit filters stay strict
filter/category conflicts are visible and relaxable
Recommended now uses stored/open/distance/preference/local/freshness facts
cards/search-assist expose explainable reasons, not numeric scores
Food Now returns 3–5 deterministic choices instead of auto-opening one
Food Now reasons use known data only
search history is local, bounded to 20, resettable
normal Search/Filter/Food Now actions cause 0 Google requests
TH/EN and existing Saved/Recent/Collections continue working
lint/typecheck/data validation/unit/build/targeted E2E/Wrangler dry-run all pass
```

## Follow-on Plans (not implemented by this plan)

After Phase 2B merges cleanly, create separate plans in this order so each subsystem is independently reviewable/rollbackable:

```text
Phase 3   Map V2 + map/list sync + Saved Cloud default
Phase 3B  Distance/Route UX + route cache presentation
Phase 4B  Place Detail V2 + Place Card reason polish
Phase 2C  Curated canonical expansion from current count to 150–200 via Candidate → Review → Publish
Phase 5A  PWA/Offline canonical snapshot + offline user state
Phase 4C  Personalization + Smart Collections
```
