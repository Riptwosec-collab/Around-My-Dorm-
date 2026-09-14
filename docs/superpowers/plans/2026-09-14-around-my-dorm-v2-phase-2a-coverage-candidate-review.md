# Around My Dorm V2 Phase 2A — Coverage, Candidate Pipeline, and Review Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Every task follows RED → GREEN → regression → commit.

**Goal:** Add an admin-only Phase 2A maintenance pipeline that measures coverage around Baan Supar, stages new place candidates separately from published places, derives a unified review queue, and connects explicit Google/Admin discovery to staging without changing public browsing or Google request behavior.

**Architecture:** Keep Phase 1 normalization and data-health as the canonical diagnostics layer. Add pure coverage/review modules under `lib/`, cloud candidate persistence under `lib/storage`, and focused admin components instead of expanding `DataManagement.tsx` with more business logic. Reuse current import matching behavior, provenance protection, Google request manager, centralized Admin gate, reviewed-place writes, history, and rollback paths.

**Tech Stack:** Next.js 15.5+, React 19.1+, TypeScript 5.8+, Vitest 3.2+, Testing Library, Playwright 1.55+, Supabase JS 2.116+, Cloudflare Workers/Wrangler 4.68+. No new npm dependency is required.

**Approved Spec:** `docs/superpowers/specs/2026-09-14-around-my-dorm-v2-phases-2-6-design.md`

## Global Constraints

- Home, Explore, Map, Saved, Recent, Place Detail, search, filters, scrolling, and marker selection remain stored-data-first and must not trigger Google Places discovery.
- Saved Cloud Map remains the default provider. Phase 2A does not implement Map V2.
- Google discovery remains an explicit Admin action behind the existing estimate, confirmation, usage, and cap controls.
- Search results enter Candidate Staging first and never become public `Place` records automatically.
- Google details/photos are separate explicit actions; no fan-out enrichment after search.
- Unknown hours, prices, images, phone, parking, rating, route time, or amenities stay unknown.
- Existing canonical IDs/slugs, Favorites, Collections, Recent, curated metadata, source/provenance, and stronger verified values must remain intact.
- Matching assists review only. No automatic destructive duplicate merge.
- Canonical mutations continue through `prepareProvenancePatch()`, `applyLocalPlacePatch()`, and `addReviewedLocalPlace()` so weaker provider data cannot silently replace stronger values.
- Candidate persistence is cloud-only. Do not use `localStorage` for app records.
- Public app modules must never query or import candidate storage.
- Candidate storage must be admin-only at **both UI and Supabase RLS levels**.
- The actual 150–200-place curation wave is a separate operational/data plan after this infrastructure is merged.
- No production deploy in Phase 2A. Final deployment check is `wrangler deploy --dry-run` only.

## New Files

- `lib/coverage/coverage.ts`
- `lib/maintenance/candidate-matching.ts`
- `lib/maintenance/place-candidates.ts`
- `lib/maintenance/review-queue.ts`
- `lib/storage/place-candidates.ts`
- `components/CoverageDashboard.tsx`
- `components/ReviewQueuePanel.tsx`
- `supabase/place-candidates.sql`
- `tests/coverage-analyzer.test.ts`
- `tests/candidate-matching.test.ts`
- `tests/place-candidates.test.ts`
- `tests/review-queue.test.ts`
- `tests/coverage-dashboard-v2.test.tsx`
- `tests/review-queue-panel.test.tsx`
- `tests/place-candidate-storage-policy.test.ts`
- `e2e/data-management-coverage.spec.ts`

## Modified Files

- `lib/maintenance/import-plan.ts`
- `components/DataManagement.tsx`
- `components/GoogleDiscoverySheet.tsx`
- `supabase/schema.sql`
- `tests/cloud-only-storage.test.ts`
- `tests/data-management-admin-gate.test.ts`
- `e2e/p0-google-api-lock.spec.ts`

---

## Task 1 — Pure Coverage Analyzer

**Files:** create `lib/coverage/coverage.ts`, create `tests/coverage-analyzer.test.ts`.

### Public interfaces

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

Use exactly these rings:

```ts
export const COVERAGE_RINGS: CoverageRing[] = [
  { id: "r1", minMeters: 0, maxMeters: 500, label: "0–500 m" },
  { id: "r2", minMeters: 500, maxMeters: 1000, label: "500 m–1 km" },
  { id: "r3", minMeters: 1000, maxMeters: 2000, label: "1–2 km" },
  { id: "r4", minMeters: 2000, maxMeters: 3000, label: "2–3 km" },
  { id: "r5", minMeters: 3000, maxMeters: 5000, label: "3–5 km" },
];
```

Initial low-count thresholds are deliberately conservative and configurable:

```ts
export const COVERAGE_CATEGORY_MINIMUMS: Partial<Record<CoverageRingId, Record<string, number>>> = {
  r1: { food: 3, noodle: 1, cafe: 1, mookata: 1, hotpot: 1, parking: 1 },
  r2: { food: 5, noodle: 2, cafe: 2, mookata: 1, hotpot: 1, parking: 1 },
  r3: { food: 8, noodle: 3, cafe: 3, mookata: 1, hotpot: 1, parking: 2 },
};
```

R4/R5 report counts/completeness but do not emit category-minimum gaps until real data supports tuned thresholds.

### TDD steps

- [ ] Write tests proving a place belongs to one ring only, coordinate-less places stay outside ring counts, completeness percentages are local-only, and low-count gaps are diagnostic only.
- [ ] Run `npm test -- tests/coverage-analyzer.test.ts`; confirm RED because the module does not exist.
- [ ] Implement with `DORM_CENTER`, `haversineKm()`, `scorePlaceDataQuality()`, and `buildDataHealthSummary()`. Never derive route time.
- [ ] Run:

```bash
npm test -- tests/coverage-analyzer.test.ts tests/data-health.test.ts tests/data-quality.test.ts
npm run typecheck
```

- [ ] Commit:

```bash
git add lib/coverage/coverage.ts tests/coverage-analyzer.test.ts
git commit -m "feat: add coverage analyzer and gap detection"
```

---

## Task 2 — Shared Candidate Identity Matching

**Files:** create `lib/maintenance/candidate-matching.ts`, create `tests/candidate-matching.test.ts`, modify `lib/maintenance/import-plan.ts`.

### Interfaces

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

Preserve the current `import-plan.ts` scoring exactly: source/Google identity +100; exact normalized name +45; containment +22; distance ≤50m +40, ≤150m +24, ≤500m +8, farther than 500m -35; exact address +20; phone +25; website +20; confident-match threshold 65; top-two delta <10 with top <100 is ambiguous.

### TDD steps

- [ ] Write RED tests for exact Google identity, nearby same-name, far-away penalty, and ambiguous top-two results. Ambiguity must never yield merge/publication.
- [ ] Run `npm test -- tests/candidate-matching.test.ts`; confirm RED.
- [ ] Extract scoring from `import-plan.ts`; make `buildImportPlan()` call `resolveCandidateMatch()` while preserving current consumer output.
- [ ] Run `npm test -- tests/candidate-matching.test.ts && npm run typecheck`.
- [ ] Commit `refactor: centralize candidate identity matching`.

---

## Task 3 — Staged Candidate Domain + Publish Gate

**Files:** create `lib/maintenance/place-candidates.ts`, create `tests/place-candidates.test.ts`.

### Interfaces

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

export function buildCandidateKey(
  sourceProvider: string,
  sourceId: string | null,
  name: string,
  latitude?: number | null,
  longitude?: number | null,
): string;

export function createPlaceCandidate(input: {
  places: Place[];
  sourceProvider: string;
  sourceId?: string | null;
  proposedPlace: Partial<Place> & { name: string };
  now?: string;
}): PlaceCandidate;

export function candidateFromGoogle(
  result: GoogleDiscoveryCandidate,
  places: Place[],
  category?: CategoryId | null,
): PlaceCandidate;

export function candidateFromImport(result: ImportCandidate, places: Place[]): PlaceCandidate;
export function canPublishCandidate(candidate: PlaceCandidate): { allowed: boolean; blockers: string[] };
export function materializeReviewedPlace(candidate: PlaceCandidate): Place;
```

Rules: Candidate is never a public `Place`; Google adapter maps only fields from search response; missing/invalid required identity data blocks publication; possible match makes status `needs_review`; completeness is informational and never bypasses blockers.

### TDD steps

- [ ] Write tests for Google/import adapters, duplicate status, invalid coordinates, source provenance, publish blockers, and unknown field preservation.
- [ ] Confirm RED with `npm test -- tests/place-candidates.test.ts`.
- [ ] Implement domain functions; use existing `scorePlaceDataQuality()` only for completeness display.
- [ ] Run `npm test -- tests/place-candidates.test.ts tests/candidate-matching.test.ts && npm run typecheck`.
- [ ] Commit `feat: add staged place candidate domain`.

---

## Task 4 — Admin-Only Candidate Persistence in Supabase

**Files:** create `supabase/place-candidates.sql`, modify `supabase/schema.sql`, create `lib/storage/place-candidates.ts`, create `tests/place-candidate-storage-policy.test.ts`, modify `tests/cloud-only-storage.test.ts`.

### Database model

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
```

### Database-level Admin authorization — mandatory

Do **not** use a policy that checks only `auth.uid() = user_id`.

Refactor the **exact existing Admin authorization predicate currently embedded in `public.amd_google_usage_summary()`** into a shared `public.amd_is_admin()` security-definer boolean helper, without changing any of its current authorization conditions. Replace the duplicated predicate inside `amd_google_usage_summary()` with a call to the helper, then use the same helper in candidate RLS:

```sql
do $$ begin
  create policy "amd admin place candidates" on public.amd_place_candidates
  for all to authenticated
  using (auth.uid() = user_id and public.amd_is_admin())
  with check (auth.uid() = user_id and public.amd_is_admin());
exception when duplicate_object then null; end $$;
```

This keeps current Admin-login compatibility while ensuring a normal authenticated user cannot read/write candidate staging directly through Supabase.

### Storage interfaces

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

Map rows explicitly; reject malformed payload/status values instead of trusting arbitrary JSON.

### TDD steps

- [ ] Write source/policy tests first. Assert candidate storage is cloud-only, references `amd_place_candidates`, public modules do not import it, SQL enables RLS/revokes anon, policy includes `public.amd_is_admin()`, and a user-only policy is not present.
- [ ] Confirm RED:

```bash
npm test -- tests/place-candidate-storage-policy.test.ts tests/cloud-only-storage.test.ts
```

- [ ] Implement SQL/helper refactor + storage adapter.
- [ ] Run:

```bash
npm test -- tests/place-candidate-storage-policy.test.ts tests/cloud-only-storage.test.ts
npm run typecheck
```

- [ ] Commit `feat: persist admin-only staged place candidates`.

---

## Task 5 — Unified P0–P3 Review Queue

**Files:** create `lib/maintenance/review-queue.ts`, create `tests/review-queue.test.ts`.

### Interfaces

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

Priority: P0 invalid/identity-critical; P1 possible duplicate/category/local-chain/high-risk change; P2 missing Maps/hours/stale; P3 missing photo/price. One entity appears once with all reasons and its highest priority. Reuse `buildDataHealthSummary()` and `scorePlaceDataQuality()`.

### TDD steps

- [ ] Write RED tests for deterministic priority order, new candidate, possible duplicate, stale/missing data, high-risk change, and filtering.
- [ ] Confirm RED: `npm test -- tests/review-queue.test.ts`.
- [ ] Implement stable ordering by priority, then oldest/review urgency, then title.
- [ ] Run `npm test -- tests/review-queue.test.ts tests/data-health.test.ts tests/data-quality.test.ts && npm run typecheck`.
- [ ] Commit `feat: derive unified place review queue`.

---

## Task 6 — Coverage Dashboard + Review Queue Admin UI

**Files:** create `components/CoverageDashboard.tsx`, `components/ReviewQueuePanel.tsx`, tests; modify `components/DataManagement.tsx`.

### Interfaces

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

Requirements: R1–R5 metrics; gap actions only `Review existing` and explicit `Search candidates`; queue filters priority/reason/category/ring/source; duplicate evidence side-by-side; Publish disabled when gate blocks; Reject/Keep Separate/Review Later available; no auto merge. Add test IDs `coverage-dashboard`, `review-queue`, `candidate-publish-blocked`.

Do **not** perform the later Phase 5B Admin rewrite. Add a small local segmented view `overview | coverage | review` inside the existing `adminAccess.admin` branch.

### TDD steps

- [ ] Write failing Testing Library tests.
- [ ] Confirm RED:

```bash
npm test -- tests/coverage-dashboard-v2.test.tsx tests/review-queue-panel.test.tsx
```

- [ ] Implement components and integrate only behind Admin gate.
- [ ] Run:

```bash
npm test -- tests/coverage-dashboard-v2.test.tsx tests/review-queue-panel.test.tsx tests/data-management-admin-gate.test.ts
npm run typecheck
```

- [ ] Commit `feat: add coverage and review queue admin views`.

---

## Task 7 — Stage Import + Google Discovery Results

**Files:** modify `DataManagement.tsx`, `GoogleDiscoverySheet.tsx`, `import-plan.ts`, related tests.

Required flow:

```text
Approved import or explicit Google search
  -> candidateFromImport()/candidateFromGoogle()
  -> upsertPlaceCandidate()/upsertPlaceCandidates()
  -> reload staged candidates
  -> Review Queue
  -> explicit decision
```

Change Google callback semantics to:

```ts
onStageCandidate: (candidate: GoogleDiscoveryCandidate) => Promise<void> | void;
```

Do not change request estimate, confirmation-before-network, daily cap, max-result bound, no-auto-paging, or no-auto-details/photos.

For imports: existing-place diffs continue to `pending`; `plan.newPlaces` become staged candidates and do not call `addReviewedLocalPlace()` during import scanning.

Admin load effect:

```ts
Promise.all([
  loadPendingPlaceChanges(),
  loadLocalPlaceHistory(),
  loadPlaceCandidates(["new", "needs_review"]),
]);
```

On Admin logout, clear candidate React state.

### TDD steps

- [ ] Add RED source/behavior assertions that candidate storage is loaded only in Admin flow and Google/import results stage rather than publish.
- [ ] Run `npm test -- tests/place-candidates.test.ts tests/data-management-admin-gate.test.ts`; confirm RED.
- [ ] Implement staging handoff; keep `addReviewedLocalPlace()` only in explicit publication handler.
- [ ] Run:

```bash
npm test -- tests/place-candidates.test.ts tests/data-management-admin-gate.test.ts tests/google-api-control.test.ts tests/google-api-lock.test.ts
npm run typecheck
```

- [ ] Commit `feat: stage discovery candidates before publication`.

---

## Task 8 — Explicit Review Decisions + Safe Publication

**Files:** modify `DataManagement.tsx`, `ReviewQueuePanel.tsx`, candidate domain/storage, tests; reuse `lib/database/places.ts`.

### Decision semantics

**Publish**: reload candidate → rerun `canPublishCandidate()` → `materializeReviewedPlace()` → `addReviewedLocalPlace()` → mark candidate approved with actor/time → reload places/candidates/history.

**Keep Separate**: record reviewed duplicate decision and clear only that unresolved duplicate blocker; never mutate the existing canonical place. Candidate may publish only if all other blockers pass.

**Reject**: mark rejected, no canonical write.

**Review Later**: remain `needs_review`, no canonical write.

Existing-place field conflicts stay on `applyLocalPlacePatch()` so provenance protections remain intact. Bulk duplicate merge is prohibited. Optional safe batch approval may include only candidates where `canPublishCandidate()` is already true and `possibleMatchIds.length === 0`.

### TDD steps

- [ ] Write failing tests: duplicate blocks publish before decision; reject never materializes; unknown fields remain unknown; materialization preserves source; publication uses existing history path.
- [ ] Confirm RED:

```bash
npm test -- tests/place-candidates.test.ts tests/review-queue-panel.test.tsx
```

- [ ] Implement reviewed decisions.
- [ ] Run:

```bash
npm test -- tests/place-candidates.test.ts tests/review-queue-panel.test.tsx tests/field-provenance.test.ts
npm run typecheck
```

- [ ] Commit `feat: review and publish staged place candidates`.

---

## Task 9 — Phase 2A Regression Gate

**Files:** modify `e2e/p0-google-api-lock.spec.ts`, create `e2e/data-management-coverage.spec.ts`.

### Required E2E behavior

1. Home → 0 Google Places requests.
2. Explore/search/filter → 0 Google Places requests.
3. Saved Cloud Map/radius changes → 0 Google Places requests.
4. Logged-out Data Management → Admin locked; Coverage/Review/Google candidate controls absent; 0 requests.
5. Coverage calculation/Review filtering → 0 requests.
6. Opening Google search sheet, typing, changing scope → 0 requests until explicit confirmed search.
7. Canonical data validation remains clean.

### Verification commands

Targeted unit/integration:

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

Full gate:

```bash
npm run lint
npm run typecheck
npm run validate:data
npm test
npm run build
```

Playwright:

```bash
npx playwright install --with-deps chromium
npx playwright test \
  e2e/p0-google-api-lock.spec.ts \
  e2e/manual-google-maps.spec.ts \
  e2e/map-functional.spec.ts \
  e2e/data-management-coverage.spec.ts
```

Cloudflare compile/package gate only:

```bash
npx wrangler deploy --dry-run
```

Do not proceed past a failing gate and do not run production deploy.

Commit regression changes:

```bash
git add e2e/p0-google-api-lock.spec.ts e2e/data-management-coverage.spec.ts
git commit -m "test: lock phase 2a coverage and candidate regressions"
```

---

## Plan Self-Review

### Spec coverage

The plan covers fixed R1–R5 coverage, completeness/gaps, Hybrid candidate sources, Candidate != Place, explicit Google/Admin staging, cloud candidate persistence, database-level Admin authorization, deterministic duplicate assistance/no auto-merge, P0–P3 Review Queue, publish gate, safe canonical writes through existing provenance/history code, Admin-only UI, and Google zero-request protection.

The first 150–200 actual-place curation wave is intentionally a separate operational/data plan after this infrastructure is merged, because sourcing and verification are independently reviewable and should not be coupled to the architecture PR.

### Placeholder scan

No TBD/TODO or deferred test placeholders remain. Every task has explicit files, interfaces/behavior, test gates, and commit boundaries.

### Type consistency

The plan consistently uses:
- `CoverageRingId`, `CoverageGap`, `CoverageReport` from `lib/coverage/coverage.ts`.
- `PlaceCandidate`, `PlaceCandidateStatus` from `lib/maintenance/place-candidates.ts`.
- `ReviewQueueItem`, `ReviewQueueFilters` from `lib/maintenance/review-queue.ts`.
- `loadPlaceCandidates()`, `upsertPlaceCandidate()`, `upsertPlaceCandidates()`, `updatePlaceCandidateDecision()` from `lib/storage/place-candidates.ts`.
- existing `addReviewedLocalPlace()` / `applyLocalPlacePatch()` for canonical writes.

No public browsing module consumes staged candidates.
