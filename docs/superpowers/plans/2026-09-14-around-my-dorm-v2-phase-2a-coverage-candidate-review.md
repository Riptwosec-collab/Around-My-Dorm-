# Around My Dorm V2 Phase 2A — Coverage, Candidate Pipeline, and Review Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-ready, admin-only Phase 2A maintenance pipeline that measures coverage around Baan Supar, stages new place candidates separately from published places, derives a unified review queue, and connects explicit Google/Admin discovery to that staging flow without changing public browsing or Google request behavior.

**Architecture:** Keep Phase 1 normalization/data-health as the source of truth for canonical records. Add pure coverage/review modules under `lib/`, cloud candidate persistence under `lib/storage`, and focused admin UI components instead of growing `DataManagement.tsx` further. Reuse the current import plan, provenance protection, Google request manager, Admin gate, and reviewed-place persistence; candidate records remain invisible to public Home/Explore/Map until explicitly published.

**Tech Stack:** Next.js 15.5+, React 19.1+, TypeScript 5.8+, Vitest 3.2+, Testing Library, Playwright 1.55+, Supabase JS 2.116+, Cloudflare Workers/Wrangler 4.68+. No new npm dependency is required.

**Spec:** `docs/superpowers/specs/2026-09-14-around-my-dorm-v2-phases-2-6-design.md`

## Global Constraints

- Normal Home, Explore, Map, Saved, Recent, Place Detail, search, filters, scrolling, and marker selection remain stored-data-first and must not trigger Google Places discovery.
- Saved Cloud Map remains the default map provider; this plan does not change Map V2 behavior.
- Google search remains an explicit Admin action protected by the existing request estimate, confirmation, usage tracking, and request caps.
- Search results must enter Candidate Staging first; they must not become public `Place` records automatically.
- Do not auto-request Google details or photos after search. Details/photos remain separate explicit actions.
- Unknown hours, price, photo, phone, parking, rating, route time, or amenity data remains unknown; never fabricate values to satisfy completeness targets.
- Existing canonical IDs, slugs, favorites, collections, recent views, curated metadata, provenance, and high-confidence values must be preserved.
- Candidate matching assists review only. Never auto-merge a possible duplicate.
- Lower-confidence provider data must not silently overwrite stronger curated/verified fields; continue using `prepareProvenancePatch()` / `applyLocalPlacePatch()` for canonical mutations.
- Candidate persistence is cloud-only. Do not add `localStorage` persistence; transient Google response state may remain memory/session-scoped until explicitly staged.
- Public components must never query the candidate table.
- The first 150–200-place curation wave is a separate operational/data plan after this infrastructure is merged; this implementation plan builds the safe pipeline that wave will use.
- No production deployment in this plan. Use `wrangler deploy --dry-run` only for final verification.
- Each task follows TDD: write a failing test, confirm RED, implement the smallest coherent change, confirm GREEN, run relevant regressions, then commit.

---

## File Structure Locked by This Plan

### New files

- `lib/coverage/coverage.ts` — pure coverage rings, metrics, and gap derivation.
- `lib/maintenance/candidate-matching.ts` — reusable deterministic candidate-to-place identity scoring.
- `lib/maintenance/place-candidates.ts` — candidate domain model, validation, publish gate, and Google/import adapters.
- `lib/maintenance/review-queue.ts` — unified P0–P3 review item derivation/filtering.
- `lib/storage/place-candidates.ts` — Supabase persistence for staged candidates.
- `components/CoverageDashboard.tsx` — admin-only coverage matrix/gap UI.
- `components/ReviewQueuePanel.tsx` — admin-only review list and candidate decisions.
- `supabase/place-candidates.sql` — idempotent candidate staging table/index/RLS setup.
- `tests/coverage-analyzer.test.ts`
- `tests/candidate-matching.test.ts`
- `tests/place-candidates.test.ts`
- `tests/review-queue.test.ts`
- `tests/coverage-dashboard-v2.test.tsx`
- `tests/review-queue-panel.test.tsx`
- `tests/place-candidate-storage-policy.test.ts`

### Modified files

- `lib/maintenance/import-plan.ts` — delegate identity scoring to shared matcher and expose new candidates for staging.
- `components/DataManagement.tsx` — load staged candidates, add Coverage/Review surfaces, stage imports/Google results, publish/reject/keep-separate decisions.
- `components/GoogleDiscoverySheet.tsx` — preserve explicit request behavior but change the review handoff to staging-friendly callback metadata.
- `lib/storage/place-updates.ts` — unchanged public behavior; only reuse where existing-place field diffs remain appropriate.
- `lib/database/places.ts` — reuse `addReviewedLocalPlace()` / `applyLocalPlacePatch()`; do not mix candidates into `loadPlacesFromDatabase()`.
- `supabase/schema.sql` — include the same candidate table definition for clean project bootstrap.
- `tests/cloud-only-storage.test.ts` — add candidate storage module to cloud-only policy coverage.
- `tests/data-management-admin-gate.test.ts` — assert candidate/review tools remain behind the centralized Admin gate.
- `e2e/p0-google-api-lock.spec.ts` — keep zero Google Places calls before explicit Admin action.

---

### Task 1: Build the pure Coverage Analyzer

**Files:**
- Create: `lib/coverage/coverage.ts`
- Create: `tests/coverage-analyzer.test.ts`

**Interfaces:**
- Consumes: `Place[]`, `DORM_CENTER`, `haversineKm()`, `scorePlaceDataQuality()`, `buildDataHealthSummary()`.
- Produces:

```ts
export type CoverageRingId = "r1" | "r2" | "r3" | "r4" | "r5";
export type CoverageGapCode =
  | "low_category_count"
  | "no_verified_category"
  | "missing_hours"
  | "missing_photo"
  | "missing_price"
  | "missing_maps"
  | "stale_records"
  | "duplicate_candidates";

export type CoverageRing = {
  id: CoverageRingId;
  minMeters: number;
  maxMeters: number;
  label: string;
};

export type CoverageGap = {
  id: string;
  code: CoverageGapCode;
  ringId: CoverageRingId;
  category: string | null;
  count: number;
  total: number;
  severity: "low" | "medium" | "high";
  message: string;
};

export type CoverageRingSummary = {
  ring: CoverageRing;
  placeIds: string[];
  total: number;
  byCategory: Record<string, number>;
  verified: number;
  coordinateCoverage: number;
  mapsCoverage: number;
  imageCoverage: number;
  hoursCoverage: number;
  priceCoverage: number;
  stale: number;
  duplicateCandidates: number;
  gaps: CoverageGap[];
};

export type CoverageReport = {
  totalPlaces: number;
  rings: CoverageRingSummary[];
  gaps: CoverageGap[];
};

export function buildCoverageReport(
  places: Place[],
  origin?: { lat: number; lng: number },
  now?: number,
): CoverageReport;
```

Use fixed rings exactly:

```ts
export const COVERAGE_RINGS: CoverageRing[] = [
  { id: "r1", minMeters: 0, maxMeters: 500, label: "0–500 m" },
  { id: "r2", minMeters: 500, maxMeters: 1000, label: "500 m–1 km" },
  { id: "r3", minMeters: 1000, maxMeters: 2000, label: "1–2 km" },
  { id: "r4", minMeters: 2000, maxMeters: 3000, label: "2–3 km" },
  { id: "r5", minMeters: 3000, maxMeters: 5000, label: "3–5 km" },
];
```

Coverage gap rules in this task are deterministic and configurable, not provider-backed:

```ts
export const COVERAGE_CATEGORY_MINIMUMS: Partial<Record<CoverageRingId, Record<string, number>>> = {
  r1: { food: 3, noodle: 1, cafe: 1, mookata: 1, hotpot: 1, parking: 1 },
  r2: { food: 5, noodle: 2, cafe: 2, mookata: 1, hotpot: 1, parking: 1 },
  r3: { food: 8, noodle: 3, cafe: 3, mookata: 1, hotpot: 1, parking: 2 },
};
```

R4/R5 still report counts/completeness but do not emit low-count gaps until real data justifies tuned targets.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import { buildCoverageReport } from "@/lib/coverage/coverage";
import { DORM_CENTER } from "@/lib/place-utils";

const seed = PLACES[0]!;
const place = (id: string, latitude: number, longitude: number, overrides = {}) => ({
  ...seed,
  id,
  slug: id,
  name: id,
  category: "cafe" as const,
  categories: ["cafe" as const],
  latitude,
  longitude,
  verified: true,
  lastChecked: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

describe("coverage analyzer", () => {
  it("assigns a place to exactly one distance ring", () => {
    const report = buildCoverageReport([
      place("near", DORM_CENTER.lat + 0.001, DORM_CENTER.lng),
      place("far", DORM_CENTER.lat + 0.012, DORM_CENTER.lng),
    ]);
    expect(report.rings.find((ring) => ring.ring.id === "r1")?.placeIds).toContain("near");
    expect(report.rings.flatMap((ring) => ring.placeIds).filter((id) => id === "near")).toHaveLength(1);
  });

  it("computes completeness percentages without network access", () => {
    const report = buildCoverageReport([
      place("a", DORM_CENTER.lat + 0.001, DORM_CENTER.lng, { image: null, images: [], googleMapsUrl: null }),
      place("b", DORM_CENTER.lat + 0.0015, DORM_CENTER.lng),
    ]);
    const r1 = report.rings.find((ring) => ring.ring.id === "r1")!;
    expect(r1.total).toBe(2);
    expect(r1.coordinateCoverage).toBe(100);
    expect(r1.mapsCoverage).toBeLessThanOrEqual(100);
  });

  it("emits an actionable low-category gap instead of fabricating places", () => {
    const report = buildCoverageReport([place("only-cafe", DORM_CENTER.lat + 0.001, DORM_CENTER.lng)]);
    expect(report.gaps.some((gap) => gap.code === "low_category_count" && gap.ringId === "r1")).toBe(true);
  });
});
```

- [ ] **Step 2: Confirm RED**

Run:

```bash
npm test -- tests/coverage-analyzer.test.ts
```

Expected: FAIL because `@/lib/coverage/coverage` does not exist.

- [ ] **Step 3: Implement the minimal analyzer**

Implementation rules:
- Use `haversineKm()` only; no route estimates.
- Ignore coordinate-less places for ring assignment but keep them in the global total.
- Use `scorePlaceDataQuality()` for `photo`, `openingHours`, and `price` missing state instead of duplicating those checks.
- Use `buildDataHealthSummary()` to derive stale/duplicate counts for each ring subset.
- Percentage helper returns `0` for an empty ring.
- Gap derivation never calls Google and only emits diagnostics.

- [ ] **Step 4: Confirm GREEN and regressions**

```bash
npm test -- tests/coverage-analyzer.test.ts tests/data-health.test.ts tests/data-quality.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/coverage/coverage.ts tests/coverage-analyzer.test.ts
git commit -m "feat: add coverage analyzer and gap detection"
```

---

### Task 2: Extract reusable candidate identity matching

**Files:**
- Create: `lib/maintenance/candidate-matching.ts`
- Create: `tests/candidate-matching.test.ts`
- Modify: `lib/maintenance/import-plan.ts`

**Interfaces:**

```ts
export type CandidateIdentity = {
  name: string;
  sourceId?: string | null;
  googlePlaceId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
};

export type CandidateMatch = {
  placeId: string;
  score: number;
  reasons: string[];
};

export function scoreCandidateAgainstPlace(place: Place, candidate: CandidateIdentity): CandidateMatch;
export function rankCandidateMatches(places: Place[], candidate: CandidateIdentity): CandidateMatch[];
export function resolveCandidateMatch(places: Place[], candidate: CandidateIdentity): {
  matchedPlaceId: string | null;
  possibleMatchIds: string[];
  ambiguous: boolean;
  topScore: number;
};
```

Preserve current import matching weights exactly to avoid behavior drift:
- provider/source ID or Google Place ID match: +100
- exact normalized name: +45
- name contains other normalized name: +22
- distance ≤50 m: +40
- distance ≤150 m: +24
- distance ≤500 m: +8
- farther than 500 m when both coordinates exist: -35
- exact normalized address: +20
- normalized phone match: +25
- normalized website match: +20
- confident existing match threshold: 65
- if top two scores differ by <10 and top score <100, mark ambiguous instead of auto-matching.

- [ ] **Step 1: Write failing matcher tests**

Include tests for exact Google identity, nearby exact-name scoring, far-away penalty, and ambiguous top-two results. Also test that an ambiguous result returns possible IDs but never a merged/published decision.

- [ ] **Step 2: Confirm RED**

```bash
npm test -- tests/candidate-matching.test.ts
```

- [ ] **Step 3: Move matching logic out of `import-plan.ts`**

`buildImportPlan()` must call `resolveCandidateMatch()` and preserve its existing output shape for existing consumers.

- [ ] **Step 4: Confirm GREEN and import regression**

```bash
npm test -- tests/candidate-matching.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add lib/maintenance/candidate-matching.ts lib/maintenance/import-plan.ts tests/candidate-matching.test.ts
git commit -m "refactor: centralize candidate identity matching"
```

---

### Task 3: Add the staged candidate domain and publish gate

**Files:**
- Create: `lib/maintenance/place-candidates.ts`
- Create: `tests/place-candidates.test.ts`

**Interfaces:**

```ts
export type PlaceCandidateStatus = "new" | "needs_review" | "approved" | "rejected" | "merged";

export type CandidateValidationIssue = {
  code: "missing_name" | "missing_category" | "invalid_coordinates" | "possible_duplicate" | "source_conflict";
  severity: "p0" | "p1" | "p2" | "p3";
  message: string;
};

export type PlaceCandidate = {
  id: string;
  candidateKey: string;
  sourceProvider: string;
  sourceId: string | null;
  proposedPlace: Partial<Place> & { name: string };
  possibleMatchIds: string[];
  matchScore: number;
  validationIssues: CandidateValidationIssue[];
  completenessScore: number;
  status: PlaceCandidateStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export function buildCandidateKey(sourceProvider: string, sourceId: string | null, name: string, latitude?: number | null, longitude?: number | null): string;
export function createPlaceCandidate(input: {
  places: Place[];
  sourceProvider: string;
  sourceId?: string | null;
  proposedPlace: Partial<Place> & { name: string };
  now?: string;
}): PlaceCandidate;
export function canPublishCandidate(candidate: PlaceCandidate): { allowed: boolean; blockers: string[] };
```

Adapters:

```ts
export function candidateFromGoogle(result: GoogleDiscoveryCandidate, places: Place[], category?: CategoryId | null): PlaceCandidate;
export function candidateFromImport(result: ImportCandidate, places: Place[]): PlaceCandidate;
```

Rules:
- Candidate is not a `Place` and must never be inserted into public arrays.
- `candidateFromGoogle()` maps search-response fields only; do not invent hours, price, phone, photos, or amenities.
- Google search rating/review count may remain in the staged payload if provider policy permits review display, but no automatic canonical persistence happens here.
- Missing name/category or invalid present coordinates create blockers.
- Any possible identity match sets status `needs_review`; no auto-merge.
- `canPublishCandidate()` requires name, valid category, valid coordinates for this Phase 2A flow, provenance/source, no P0 blockers, and no unresolved possible duplicate.

- [ ] **Step 1: Write failing candidate tests**

Test Google adaptation, import adaptation, possible-duplicate status, invalid-coordinate blocker, and publish gate.

- [ ] **Step 2: Confirm RED**

```bash
npm test -- tests/place-candidates.test.ts
```

- [ ] **Step 3: Implement the domain module**

Use `scorePlaceDataQuality()` on a temporary normalized candidate-shaped `Place` only for completeness scoring; completeness never grants publish permission by itself.

- [ ] **Step 4: Confirm GREEN**

```bash
npm test -- tests/place-candidates.test.ts tests/candidate-matching.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add lib/maintenance/place-candidates.ts tests/place-candidates.test.ts
git commit -m "feat: add staged place candidate domain"
```

---

### Task 4: Persist candidates in Supabase without exposing them to public browsing

**Files:**
- Create: `supabase/place-candidates.sql`
- Modify: `supabase/schema.sql`
- Create: `lib/storage/place-candidates.ts`
- Create: `tests/place-candidate-storage-policy.test.ts`
- Modify: `tests/cloud-only-storage.test.ts`

**Database shape:**

```sql
create table if not exists public.amd_place_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  candidate_key text not null,
  source_provider text not null,
  source_id text,
  status text not null check (status in ('new','needs_review','approved','rejected','merged')),
  payload jsonb not null,
  possible_match_ids jsonb not null default '[]'::jsonb,
  match_score numeric not null default 0,
  validation_issues jsonb not null default '[]'::jsonb,
  completeness_score integer not null default 0,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, candidate_key)
);

create index if not exists amd_place_candidates_user_status_idx
  on public.amd_place_candidates(user_id, status, updated_at desc);

alter table public.amd_place_candidates enable row level security;
revoke all on table public.amd_place_candidates from anon;
grant select, insert, update, delete on table public.amd_place_candidates to authenticated;

do $$ begin
  create policy "amd own place candidates" on public.amd_place_candidates
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
```

This table is additionally guarded in-app by the existing centralized `AdminGoogleAccess` gate; public app code never imports the storage module.

**Storage interfaces:**

```ts
export async function loadPlaceCandidates(status?: PlaceCandidateStatus[]): Promise<PlaceCandidate[]>;
export async function upsertPlaceCandidate(candidate: PlaceCandidate): Promise<PlaceCandidate>;
export async function upsertPlaceCandidates(candidates: PlaceCandidate[]): Promise<PlaceCandidate[]>;
export async function updatePlaceCandidateDecision(
  candidateId: string,
  input: { status: PlaceCandidateStatus; reviewedBy?: string | null; reviewedAt?: string | null },
): Promise<void>;
export async function deletePlaceCandidate(candidateId: string): Promise<void>;
```

- [ ] **Step 1: Write policy/storage source tests first**

The test should assert:
- `lib/storage/place-candidates.ts` does not contain `localStorage`.
- It references `amd_place_candidates`.
- `AroundMyDormApp.tsx`, discovery modules, and public map modules do not import `place-candidates`.
- `supabase/place-candidates.sql` enables RLS and revokes anon access.

- [ ] **Step 2: Confirm RED**

```bash
npm test -- tests/place-candidate-storage-policy.test.ts tests/cloud-only-storage.test.ts
```

- [ ] **Step 3: Implement SQL and storage adapter**

Map DB rows explicitly to `PlaceCandidate`; never trust arbitrary row payload without checking `payload.name`, status membership, and arrays.

- [ ] **Step 4: Confirm GREEN**

```bash
npm test -- tests/place-candidate-storage-policy.test.ts tests/cloud-only-storage.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add supabase/place-candidates.sql supabase/schema.sql lib/storage/place-candidates.ts tests/place-candidate-storage-policy.test.ts tests/cloud-only-storage.test.ts
git commit -m "feat: persist staged place candidates in cloud"
```

---

### Task 5: Build the unified Review Queue derivation

**Files:**
- Create: `lib/maintenance/review-queue.ts`
- Create: `tests/review-queue.test.ts`

**Interfaces:**

```ts
export type ReviewPriority = "p0" | "p1" | "p2" | "p3";
export type ReviewReason =
  | "new_place"
  | "invalid_coordinates"
  | "identity_conflict"
  | "possible_duplicate"
  | "category_mismatch"
  | "local_chain_ambiguity"
  | "missing_maps"
  | "missing_hours"
  | "stale_record"
  | "missing_photo"
  | "missing_price"
  | "high_risk_change";

export type ReviewQueueItem = {
  id: string;
  kind: "place" | "candidate" | "change";
  entityId: string;
  title: string;
  priority: ReviewPriority;
  reasons: ReviewReason[];
  category: string | null;
  source: string | null;
  ringId: CoverageRingId | null;
  createdAt: string | null;
};

export type ReviewQueueFilters = {
  priorities?: ReviewPriority[];
  reasons?: ReviewReason[];
  category?: string | null;
  ringId?: CoverageRingId | null;
  source?: string | null;
};

export function buildReviewQueue(input: {
  places: Place[];
  candidates: PlaceCandidate[];
  pendingChanges?: PlaceUpdateDiff[];
  now?: number;
}): ReviewQueueItem[];

export function filterReviewQueue(items: ReviewQueueItem[], filters: ReviewQueueFilters): ReviewQueueItem[];
```

Priority mapping is fixed:
- P0: invalid coordinates/identity-critical conflict/duplicate internal identity diagnostics.
- P1: possible duplicate, category mismatch affecting identity, LOCAL/CHAIN ambiguity, high-risk field conflict.
- P2: missing Maps, missing hours, stale record.
- P3: missing photo, missing price, optional metadata.

Use `buildDataHealthSummary()` and `scorePlaceDataQuality()` rather than creating a second data-health engine.

- [ ] **Step 1: Write failing queue tests**

Test deterministic priority order (`p0` before `p1` before `p2` before `p3`), candidate `new_place`, possible duplicate, stale/missing data reasons, and filtering.

- [ ] **Step 2: Confirm RED**

```bash
npm test -- tests/review-queue.test.ts
```

- [ ] **Step 3: Implement queue derivation**

A single entity may carry multiple reasons but should appear once at its highest priority. Stable sort by priority, then oldest/least-recently-checked where applicable, then title.

- [ ] **Step 4: Confirm GREEN**

```bash
npm test -- tests/review-queue.test.ts tests/data-health.test.ts tests/data-quality.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add lib/maintenance/review-queue.ts tests/review-queue.test.ts
git commit -m "feat: derive unified place review queue"
```

---

### Task 6: Add Coverage Dashboard and Review Queue admin UI

**Files:**
- Create: `components/CoverageDashboard.tsx`
- Create: `components/ReviewQueuePanel.tsx`
- Create: `tests/coverage-dashboard-v2.test.tsx`
- Create: `tests/review-queue-panel.test.tsx`
- Modify: `components/DataManagement.tsx`

**Component interfaces:**

```ts
export function CoverageDashboard(props: {
  places: Place[];
  language: "th" | "en";
  onReviewGap: (gap: CoverageGap) => void;
  onSearchGap: (gap: CoverageGap) => void;
}): React.ReactElement;

export function ReviewQueuePanel(props: {
  items: ReviewQueueItem[];
  candidates: PlaceCandidate[];
  places: Place[];
  language: "th" | "en";
  onPublishCandidate: (candidateId: string) => void;
  onRejectCandidate: (candidateId: string) => void;
  onKeepSeparate: (candidateId: string) => void;
  onReviewLater: (candidateId: string) => void;
}): React.ReactElement;
```

UI requirements:
- Coverage shows R1–R5 counts and completeness percentages.
- Each gap has only local `Review existing` and explicit `Search candidates` actions.
- Review Queue filters by priority/reason/category/ring/source.
- Candidate possible-duplicate item shows side-by-side identity evidence: name, distance if both coordinates exist, Google/source ID, address, phone, category.
- Decisions available: Publish (only when gate allows), Reject, Keep Separate, Review Later. `Merge` remains a reviewed canonical-field workflow; do not implement destructive automatic merge in this task.
- Use `data-testid="coverage-dashboard"`, `data-testid="review-queue"`, and `data-testid="candidate-publish-blocked"` for regression coverage.

- [ ] **Step 1: Write failing render tests**

Coverage test asserts R1/R2 labels, data completeness text, and that rendering the component triggers no external request API. Review Queue test asserts priority label and publish blocker for a duplicate candidate.

- [ ] **Step 2: Confirm RED**

```bash
npm test -- tests/coverage-dashboard-v2.test.tsx tests/review-queue-panel.test.tsx
```

- [ ] **Step 3: Implement components without moving the full Admin workspace yet**

Do not perform the Phase 5B `DataManagement` rewrite here. Mount the new components inside the existing `adminAccess.admin` branch, above existing maintenance tools, using a small local segmented view: `overview | coverage | review`.

- [ ] **Step 4: Confirm GREEN and Admin gate regression**

```bash
npm test -- tests/coverage-dashboard-v2.test.tsx tests/review-queue-panel.test.tsx tests/data-management-admin-gate.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add components/CoverageDashboard.tsx components/ReviewQueuePanel.tsx components/DataManagement.tsx tests/coverage-dashboard-v2.test.tsx tests/review-queue-panel.test.tsx
git commit -m "feat: add coverage and review queue admin views"
```

---

### Task 7: Stage Import and Google discovery results instead of publishing them directly

**Files:**
- Modify: `components/DataManagement.tsx`
- Modify: `components/GoogleDiscoverySheet.tsx`
- Modify: `lib/maintenance/import-plan.ts`
- Modify/Create tests: `tests/place-candidates.test.ts`, `tests/data-management-admin-gate.test.ts`

**Required flow:**

```text
Approved import or explicit Google search
  -> createPlaceCandidate()/candidateFromGoogle()/candidateFromImport()
  -> upsertPlaceCandidate(s)
  -> reload staged candidates
  -> Review Queue
  -> explicit publish/reject/keep-separate decision
```

Google sheet callback becomes semantically staging-oriented while keeping the external request behavior unchanged:

```ts
onStageCandidate: (candidate: GoogleDiscoveryCandidate) => Promise<void> | void;
```

Do not change:
- request estimation,
- confirm-before-network behavior,
- daily request limit,
- result count bound,
- no automatic paging,
- no automatic details/photo fetch.

Import behavior:
- Existing-place diffs continue into `pending` changes as before.
- `plan.newPlaces` are converted to staged candidates and persisted; do not call `addReviewedLocalPlace()` from the import scan step.

DataManagement loading effect after Admin authentication should load in parallel:

```ts
Promise.all([
  loadPendingPlaceChanges(),
  loadLocalPlaceHistory(),
  loadPlaceCandidates(["new", "needs_review"]),
]);
```

When Admin logs out, clear staged candidate state from React memory.

- [ ] **Step 1: Add failing source/behavior assertions**

Assert that `DataManagement.tsx` imports candidate storage, loads candidates only inside the Admin branch, and Google result handling calls staging instead of direct place publication.

- [ ] **Step 2: Confirm RED**

```bash
npm test -- tests/place-candidates.test.ts tests/data-management-admin-gate.test.ts
```

- [ ] **Step 3: Implement staging handoff**

Keep `addReviewedLocalPlace()` only in the explicit publish decision handler.

- [ ] **Step 4: Confirm GREEN**

```bash
npm test -- tests/place-candidates.test.ts tests/data-management-admin-gate.test.ts tests/google-api-control.test.ts tests/google-api-lock.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add components/DataManagement.tsx components/GoogleDiscoverySheet.tsx lib/maintenance/import-plan.ts tests/place-candidates.test.ts tests/data-management-admin-gate.test.ts
git commit -m "feat: stage discovery candidates before publication"
```

---

### Task 8: Implement explicit candidate review decisions and safe publication

**Files:**
- Modify: `components/DataManagement.tsx`
- Modify: `components/ReviewQueuePanel.tsx`
- Modify: `lib/maintenance/place-candidates.ts`
- Modify: `lib/storage/place-candidates.ts`
- Reuse: `lib/database/places.ts`
- Extend: `tests/place-candidates.test.ts`, `tests/review-queue-panel.test.tsx`

**Decision behavior:**

`Publish`:
1. Reload/find candidate by ID.
2. Run `canPublishCandidate()` again at action time.
3. Build a reviewed `Place` using the existing `makeReviewedPlace` logic moved from `DataManagement.tsx` into `lib/maintenance/place-candidates.ts` as:

```ts
export function materializeReviewedPlace(candidate: PlaceCandidate): Place;
```

4. Call `addReviewedLocalPlace(place, candidate.sourceProvider)`.
5. Mark candidate `approved` with review timestamp/actor.
6. Reload places/candidates/history.

`Keep Separate`:
- Clears only the unresolved duplicate blocker for the staged candidate by recording a reviewed decision in candidate payload/validation state.
- Does not mutate the existing canonical place.
- Candidate can then pass the publish gate if all other blockers are clear.

`Reject`:
- Marks candidate `rejected`; never writes canonical place data.

`Review Later`:
- Leaves status `needs_review` and makes no canonical change.

Existing-place field conflict workflow continues to use `applyLocalPlacePatch()` so stronger provenance remains protected.

- [ ] **Step 1: Write failing publish/decision tests**

Test:
- possible duplicate cannot publish before Keep Separate/review decision,
- rejected candidate never materializes to a public place,
- materialization preserves known source fields and keeps unknowns null/empty according to existing `Place` conventions,
- publication uses existing history path through `addReviewedLocalPlace()`.

- [ ] **Step 2: Confirm RED**

```bash
npm test -- tests/place-candidates.test.ts tests/review-queue-panel.test.tsx
```

- [ ] **Step 3: Implement reviewed decisions**

Do not add bulk duplicate merge. Safe batch approve can be added only for candidates where `canPublishCandidate()` is already true and `possibleMatchIds.length === 0`; if batch UI is added, process sequentially and stop/report an item that changes state unexpectedly.

- [ ] **Step 4: Confirm GREEN and provenance regression**

```bash
npm test -- tests/place-candidates.test.ts tests/review-queue-panel.test.tsx tests/field-provenance.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add components/DataManagement.tsx components/ReviewQueuePanel.tsx lib/maintenance/place-candidates.ts lib/storage/place-candidates.ts tests/place-candidates.test.ts tests/review-queue-panel.test.tsx
git commit -m "feat: review and publish staged place candidates"
```

---

### Task 9: Phase 2A regression gate and Google zero-request protection

**Files:**
- Modify: `e2e/p0-google-api-lock.spec.ts`
- Add if useful: `e2e/data-management-coverage.spec.ts`
- No production workflow changes.

**Required regression scenarios:**

1. Open Home -> zero Google Places requests.
2. Open Explore/search/filter -> zero Google Places requests.
3. Open Saved Cloud Map/change radius -> zero Google Places requests.
4. Open Data Management while logged out -> Admin locked; Coverage/Review/Google candidate tools are not rendered; zero Google Places requests.
5. Coverage calculations and Review Queue filtering -> zero Google Places requests.
6. Explicit Google search remains behind the existing confirmation control; merely opening the search sheet/typing/changing scope -> zero requests.
7. Existing canonical data validation remains clean.

- [ ] **Step 1: Extend E2E assertions before changing implementation if an uncovered regression is found**

Keep the existing request counter pattern:

```ts
let googlePlacesRequests = 0;
page.on("request", (request) => {
  const url = request.url();
  if (
    url.includes("places.googleapis.com") ||
    url.includes("/maps/api/place") ||
    url.includes("maps.googleapis.com/maps/api/place")
  ) googlePlacesRequests += 1;
});
```

- [ ] **Step 2: Run targeted Vitest suite**

```bash
npm test -- \
  tests/coverage-analyzer.test.ts \
  tests/candidate-matching.test.ts \
  tests/place-candidates.test.ts \
  tests/review-queue.test.ts \
  tests/coverage-dashboard-v2.test.tsx \
  tests/review-queue-panel.test.tsx \
  tests/place-candidate-storage-policy.test.ts \
  tests/data-health.test.ts \
  tests/data-quality-dashboard.test.ts \
  tests/data-management-admin-gate.test.ts \
  tests/field-provenance.test.ts \
  tests/google-api-control.test.ts \
  tests/google-api-lock.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full static/data/unit gate**

```bash
npm run lint
npm run typecheck
npm run validate:data
npm test
npm run build
```

Expected: all PASS. Do not continue on a failure.

- [ ] **Step 4: Run targeted Playwright regressions**

```bash
npx playwright install --with-deps chromium
npx playwright test \
  e2e/p0-google-api-lock.spec.ts \
  e2e/manual-google-maps.spec.ts \
  e2e/map-functional.spec.ts \
  e2e/data-management-coverage.spec.ts
```

Expected: all PASS and Google Places count remains zero until the explicit confirmed action.

- [ ] **Step 5: Run Cloudflare dry-run only**

```bash
npx wrangler deploy --dry-run
```

Expected: PASS. Do not run production deploy.

- [ ] **Step 6: Commit regression gate changes**

```bash
git add e2e/p0-google-api-lock.spec.ts e2e/data-management-coverage.spec.ts
git commit -m "test: lock phase 2a coverage and candidate regressions"
```

---

## Plan Self-Review Result

### Spec coverage

This plan covers the Phase 2A infrastructure requirements from the approved V2 spec:
- fixed R1–R5 coverage rings,
- coverage completeness and gap diagnostics,
- hybrid source flow,
- Candidate != published Place,
- explicit Google/Admin search handoff,
- candidate staging persistence,
- deterministic duplicate assistance with no auto-merge,
- P0–P3 unified Review Queue,
- publish gate,
- safe reviewed publication using existing provenance/history paths,
- Admin-only UI integration,
- Google zero-request regression protection.

The 150–200 actual-place expansion wave is intentionally separated into its own operational/data plan after this infrastructure is merged, because candidate sourcing/verification is independently reviewable work and should not be coupled to the application architecture PR.

### Placeholder scan

No `TBD`, `TODO`, unspecified implementation stubs, or “write tests later” steps are permitted. Every task names its interfaces, behavior, tests, commands, and commit boundary.

### Type consistency

The plan consistently uses:
- `CoverageRingId`, `CoverageGap`, `CoverageReport` from `lib/coverage/coverage.ts`.
- `PlaceCandidate`, `PlaceCandidateStatus` from `lib/maintenance/place-candidates.ts`.
- `ReviewQueueItem`, `ReviewQueueFilters` from `lib/maintenance/review-queue.ts`.
- `loadPlaceCandidates()`, `upsertPlaceCandidate(s)()`, `updatePlaceCandidateDecision()` from `lib/storage/place-candidates.ts`.
- existing `addReviewedLocalPlace()` / `applyLocalPlacePatch()` for canonical writes.

No public browsing module consumes staged candidates.
