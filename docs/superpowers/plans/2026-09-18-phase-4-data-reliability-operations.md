# Phase 4 — Data Reliability & Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reliability operations layer that derives maintenance work from canonical freshness, public reports, and coverage gaps; lets authorized admins verify shared canonical place fields safely; records append-only audit history; and exposes compact public freshness context without automatic external-provider requests.

**Architecture:** Use a hybrid model. Reliability tasks and priority are derived at read time from `amd_places.record`, Phase 3 reports, and stored-data-only coverage analysis; only operational state and verification audit events persist. Canonical writes go through strict admin-only Supabase RPCs that update one supported field domain, its verification metadata, audit history, and optional linked report status atomically.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.8, Vitest 3.2 + Testing Library, Supabase/PostgreSQL RPC + RLS, Playwright 1.55, Cloudflare Workers/Wrangler, Node >=22.

**Spec:** `docs/superpowers/specs/2026-09-18-phase-4-data-reliability-operations-design.md`

## Global Constraints

- Production canonical place data is `public.amd_places.record`; do not target legacy `public.places` without explicit live-catalog proof.
- Supported Phase 4 V1 verification domains are exactly `openingHours`, `price`, `phone`, `parking`, and `location`; `reportReview` is queue-only.
- Field-level Quick Verify must not change whole-place `verified`, `dataStatus`, or `lastVerified`.
- External Google/Routes/Parking/Photo/Geocoding requests must never run automatically from dashboard open, task derivation, Quick Verify open, or public Place Detail open.
- Public reports never mutate canonical data directly and cannot be resolved/rejected in the Phase 4 flow without successful canonical verification.
- `manual_verified` and `official` provenance must follow the existing provenance model; a URL alone never implies `official`.
- Public UI must not expose admin priority score, operational task state, audit metadata, reporter fingerprints, reviewer metadata, or report notes.
- Derived freshness states remain computed; never persist moving `fresh/aging/stale/unknown` truth.
- Verification audit history is append-only. Rollback creates a new event and never deletes prior events.
- TH/EN copy and mobile safe-area behavior are required for all new UI.
- Use TDD for every production behavior change: verify RED before implementation and GREEN after minimal implementation.
- Final verification commands are `npm test`, `npm run typecheck`, `npm run build`, `npm run build:cloudflare`, `npm run validate:data`, and `npm run test:e2e`.

---

## File Structure

New focused modules:

- `lib/reliability/types.ts` — shared reliability task, reason, severity, and operational-state types.
- `lib/reliability/report-domain.ts` — maps Phase 3 report types to Phase 4 verification domains.
- `lib/reliability/priority.ts` — deterministic score calculation and severity banding.
- `lib/reliability/tasks.ts` — derives place-field and coverage tasks, revisions, merge/dedupe, and sort order.
- `lib/cloud/reliability.ts` — load/save operational state through Supabase.
- `lib/cloud/place-verification.ts` — typed client wrappers for verify, rollback, and audit-history RPCs.
- `components/ReliabilitySummary.tsx` — counts and health overview only.
- `components/ReliabilityWorkQueue.tsx` — filtering/search/sorting and task actions.
- `components/PlaceQuickVerifySheet.tsx` — typed field-specific verification UI.
- `components/VerificationHistoryPanel.tsx` — admin audit timeline + eligible rollback action.
- `components/PlaceFreshnessSummary.tsx` — compact public freshness display only.
- `supabase/phase-4-data-reliability.sql` — task-state table, audit table, RLS/grants, verify/rollback/history/state RPCs.

Existing composition points to modify:

- `components/DataQualityDashboard.tsx` — compose ReliabilitySummary + ReliabilityWorkQueue without absorbing engine logic.
- `components/PlaceReportAdminQueue.tsx` — route unresolved report work into Quick Verify rather than blind resolution in the reliability flow.
- `components/CoverageDashboard.tsx` — send `Review existing` to a filtered reliability queue and keep `Search candidates` explicit.
- `components/PlaceDecisionPanel.tsx` — mount public freshness summary below report warning and above ETA/parking.
- `lib/cloud/place-reports.ts` — expose unresolved report rows in a shape reusable by the reliability task builder, without exposing sensitive fields publicly.

Tests remain in `tests/` and use `.test.ts` / `.test.tsx`, which Vitest now discovers.

---

### Task 1: Reliability Domain Types, Report Mapping, Priority, Revision, and Task Derivation

**Files:**
- Create: `lib/reliability/types.ts`
- Create: `lib/reliability/report-domain.ts`
- Create: `lib/reliability/priority.ts`
- Create: `lib/reliability/tasks.ts`
- Test: `tests/reliability-priority.test.ts`
- Test: `tests/reliability-tasks.test.ts`

**Interfaces:**
- Consumes: `Place`, `getFieldFreshness()`, Phase 3 `PlaceReportRow`, `CoverageGap`.
- Produces:
  - `type ReliabilityField = "openingHours" | "price" | "phone" | "parking" | "location"`
  - `type ReliabilityTask = PlaceReliabilityTask | CoverageReliabilityTask`
  - `mapReportTypeToReliabilityDomain(reportType): ReliabilityField | "reportReview"`
  - `scoreReliabilityTask(input): { priority: number; severity: ReliabilitySeverity; breakdown: ReliabilityScorePart[] }`
  - `buildReliabilityTasks({ places, reports, coverageGaps, operationalState, now }): ReliabilityTask[]`
  - `buildPlaceTaskRevision(...)` and `buildCoverageTaskRevision(...)`

- [ ] **Step 1: Write failing report-domain and priority tests**

```ts
import { describe, expect, it } from "vitest";
import { mapReportTypeToReliabilityDomain } from "@/lib/reliability/report-domain";
import { scoreReliabilityTask } from "@/lib/reliability/priority";

describe("Phase 4 reliability priority", () => {
  it("maps report types to the approved verification domains", () => {
    expect(mapReportTypeToReliabilityDomain("opening_hours")).toBe("openingHours");
    expect(mapReportTypeToReliabilityDomain("closed")).toBe("openingHours");
    expect(mapReportTypeToReliabilityDomain("price")).toBe("price");
    expect(mapReportTypeToReliabilityDomain("parking")).toBe("parking");
    expect(mapReportTypeToReliabilityDomain("phone")).toBe("phone");
    expect(mapReportTypeToReliabilityDomain("location")).toBe("location");
    expect(mapReportTypeToReliabilityDomain("moved")).toBe("location");
    expect(mapReportTypeToReliabilityDomain("other")).toBe("reportReview");
  });

  it("caps the deterministic score at 100 and explains each contribution", () => {
    const result = scoreReliabilityTask({
      reportStatus: "pending",
      freshnessStatus: "stale",
      recommended: true,
      localFavorite: false,
      field: "openingHours",
      highSeverityCoverageGap: true,
      independentIssueCategoryCount: 4,
      coverageOnly: false,
    });
    expect(result.priority).toBe(100);
    expect(result.severity).toBe("critical");
    expect(result.breakdown.map((part) => part.code)).toEqual(expect.arrayContaining([
      "report_pending", "freshness_stale", "important_place", "critical_field", "coverage_high", "multi_issue",
    ]));
  });
});
```

- [ ] **Step 2: Run the priority tests and verify RED**

Run: `npx vitest run tests/reliability-priority.test.ts`

Expected: FAIL because `@/lib/reliability/report-domain` and `@/lib/reliability/priority` do not exist.

- [ ] **Step 3: Implement minimal report mapping and deterministic scorer**

```ts
// lib/reliability/report-domain.ts
import type { PlaceReportType } from "@/lib/cloud/place-reports";
import type { ReliabilityField } from "@/lib/reliability/types";

const DOMAIN: Record<PlaceReportType, ReliabilityField | "reportReview"> = {
  closed: "openingHours",
  opening_hours: "openingHours",
  price: "price",
  moved: "location",
  parking: "parking",
  phone: "phone",
  location: "location",
  other: "reportReview",
};

export function mapReportTypeToReliabilityDomain(type: PlaceReportType) {
  return DOMAIN[type];
}
```

```ts
// lib/reliability/priority.ts
import type { ReliabilityField, ReliabilitySeverity, ReliabilityScorePart } from "@/lib/reliability/types";

type ScoreInput = {
  reportStatus: "pending" | "reviewed" | null;
  freshnessStatus: "fresh" | "aging" | "stale" | "unknown" | null;
  recommended: boolean;
  localFavorite: boolean;
  field: ReliabilityField | "reportReview" | "coverage";
  highSeverityCoverageGap: boolean;
  independentIssueCategoryCount: number;
  coverageOnly: boolean;
};

export function scoreReliabilityTask(input: ScoreInput) {
  const breakdown: ReliabilityScorePart[] = [];
  const add = (code: string, points: number) => breakdown.push({ code, points });
  if (input.coverageOnly) add("coverage_base", 20);
  if (input.reportStatus === "pending") add("report_pending", 35);
  if (input.reportStatus === "reviewed") add("report_reviewed", 25);
  if (input.freshnessStatus === "stale") add("freshness_stale", 25);
  if (input.freshnessStatus === "unknown") add("freshness_unknown", 20);
  if (input.freshnessStatus === "aging") add("freshness_aging", 10);
  if (input.recommended || input.localFavorite) add("important_place", 10);
  if (input.field === "openingHours" || input.field === "location") add("critical_field", 10);
  if (input.field === "price" || input.field === "parking") add("commercial_field", 7);
  if (input.field === "phone") add("phone_field", 4);
  if (input.highSeverityCoverageGap) add("coverage_high", 10);
  const breadth = Math.min(15, Math.max(0, input.independentIssueCategoryCount - 1) * 5);
  if (breadth) add("multi_issue", breadth);
  const priority = Math.min(100, breakdown.reduce((sum, part) => sum + part.points, 0));
  const severity: ReliabilitySeverity = priority >= 75 ? "critical" : priority >= 50 ? "high" : priority >= 25 ? "normal" : "low";
  return { priority, severity, breakdown };
}
```

- [ ] **Step 4: Run priority tests and verify GREEN**

Run: `npx vitest run tests/reliability-priority.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing task derivation/revision tests**

Use `PLACES[0]` as a canonical fixture and fixed `now = new Date("2026-09-18T09:00:00Z")`. Assert:

```ts
expect(tasks.filter((task) => task.kind === "place_field").map((task) => task.id)).toContain(`${place.id}:openingHours`);
expect(tasks.find((task) => task.id === `${place.id}:openingHours`)?.reportIds).toEqual([report.id]);
expect(firstRevision).not.toBe(secondRevision); // report status or field verification timestamp changed
expect(tasks.every((task) => task.priority <= 100)).toBe(true);
expect(tasks.find((task) => task.kind === "coverage_gap")?.placeId).toBeNull();
```

Also assert old operational state is ignored when `task_revision` differs and a matching `snoozed` state suppresses the task only until `snoozed_until`.

- [ ] **Step 6: Run task tests and verify RED**

Run: `npx vitest run tests/reliability-tasks.test.ts`

Expected: FAIL because `buildReliabilityTasks()` does not exist.

- [ ] **Step 7: Implement minimal task builder**

Implementation requirements:

```ts
export function buildReliabilityTasks(input: BuildReliabilityTasksInput): ReliabilityTask[] {
  // derive supported field freshness via getFieldFreshness(place, field, now)
  // group unresolved reports by mapped placeId + domain
  // attach coverage-gap relevance without creating duplicate place-field tasks
  // create separate coverage_gap tasks for standalone gaps
  // calculate revision from current verification timestamp + sorted report id/status/duplicateCount + sorted gap ids
  // apply operational state only when task_revision matches current revision
  // suppress active snooze until snoozed_until; never suppress a new revision
  // score, severity-band, and sort according to the spec
}
```

Use a stable string serialization helper and a deterministic non-secret hash suitable for in-app revision keys; cryptographic secrecy is not required because task revisions contain no sensitive data.

- [ ] **Step 8: Run the focused tests, then commit**

Run: `npx vitest run tests/reliability-priority.test.ts tests/reliability-tasks.test.ts`

Expected: PASS.

Commit:

```bash
git add lib/reliability tests/reliability-priority.test.ts tests/reliability-tasks.test.ts
git commit -m "feat: add reliability task engine"
```

---

### Task 2: Persist Operational Task State Without Persisting Freshness

**Files:**
- Create: `lib/cloud/reliability.ts`
- Test: `tests/reliability-cloud-state.test.ts`
- Modify later migration file in Task 3: `supabase/phase-4-data-reliability.sql`

**Interfaces:**
- Produces:
  - `loadReliabilityTaskState(): Promise<ReliabilityTaskState[]>`
  - `saveReliabilityTaskState(input: ReliabilityTaskStateWrite): Promise<ReliabilityTaskState>`
- Consumes: `supabase`, authenticated admin session already established by admin UI.

- [ ] **Step 1: Write failing cloud-wrapper tests with a mocked Supabase client**

Assert `loadReliabilityTaskState()` selects only operational columns and `saveReliabilityTaskState()` invokes RPC `amd_admin_set_reliability_task_state` with `task_key`, `task_revision`, status, snooze time, and note.

```ts
expect(rpc).toHaveBeenCalledWith("amd_admin_set_reliability_task_state", {
  p_task_key: "place-1:phone",
  p_task_revision: "rev-2",
  p_place_id: "place-1",
  p_field_name: "phone",
  p_status: "snoozed",
  p_snoozed_until: "2026-09-20T09:00:00.000Z",
  p_note: "Call again after weekend",
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run tests/reliability-cloud-state.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the wrapper**

```ts
export async function loadReliabilityTaskState(): Promise<ReliabilityTaskState[]> {
  const { data, error } = await supabase
    .from("amd_reliability_task_state")
    .select("task_key,task_revision,place_id,field_name,status,snoozed_until,assigned_to,last_opened_at,note,updated_at");
  if (error) throw error;
  return (data || []).map(fromReliabilityStateRow);
}

export async function saveReliabilityTaskState(input: ReliabilityTaskStateWrite) {
  const { data, error } = await supabase.rpc("amd_admin_set_reliability_task_state", toRpcArgs(input));
  if (error) throw error;
  return fromReliabilityStateRow(Array.isArray(data) ? data[0] : data);
}
```

Do not write freshness or priority into this table.

- [ ] **Step 4: Run test and commit**

Run: `npx vitest run tests/reliability-cloud-state.test.ts`

Expected: PASS.

Commit:

```bash
git add lib/cloud/reliability.ts tests/reliability-cloud-state.test.ts
git commit -m "feat: add reliability operational state client"
```

---

### Task 3: Canonical Verification Migration, RPC Security, Audit History, and Rollback

**Files:**
- Create: `supabase/phase-4-data-reliability.sql`
- Create: `lib/cloud/place-verification.ts`
- Test: `tests/phase4-reliability-schema.test.ts`
- Test: `tests/place-verification-cloud.test.ts`

**Interfaces:**
- Produces SQL objects:
  - table `public.amd_reliability_task_state`
  - table `public.amd_place_verification_events`
  - RPC `public.amd_admin_set_reliability_task_state(...)`
  - RPC `public.amd_admin_verify_place_field(...)`
  - RPC `public.amd_admin_rollback_place_verification(...)`
  - RPC `public.amd_admin_place_verification_history(p_place_id text)`
- Produces client functions:
  - `verifyCanonicalPlaceField(input): Promise<PlaceVerificationResult>`
  - `rollbackPlaceVerification(eventId, note?): Promise<PlaceVerificationResult>`
  - `loadPlaceVerificationHistory(placeId): Promise<PlaceVerificationEvent[]>`

- [ ] **Step 1: Inspect the live Supabase production catalog before writing SQL**

Verify the actual `public.amd_places` columns, primary key, `record` type, report table name/columns, and existing admin JWT pattern. Record the findings in a short comment at the top of the migration SQL before implementation. Do not assume the legacy `public.places` schema.

Expected evidence must include that the canonical record column is JSON/JSONB and the exact place-id column used by `amd_places`.

- [ ] **Step 2: Write failing schema contract tests**

```ts
const sql = fs.readFileSync("supabase/phase-4-data-reliability.sql", "utf8");
expect(sql).toContain("public.amd_places");
expect(sql).not.toMatch(/update\s+public\.places\b/i);
expect(sql).toContain("amd_reliability_task_state");
expect(sql).toContain("amd_place_verification_events");
expect(sql).toContain("amd_admin_verify_place_field");
expect(sql).toContain("amd_admin_rollback_place_verification");
expect(sql).toContain("auth.jwt() -> 'app_metadata'");
expect(sql).toContain("amd_admin");
expect(sql).toContain("is_anonymous");
expect(sql).toMatch(/for\s+update/i);
expect(sql).toMatch(/field_name/i);
expect(sql).toMatch(/verified_unchanged/);
expect(sql).toMatch(/updated_and_verified/);
expect(sql).toMatch(/rollback/);
```

Add negative assertions that the RPC never sets JSON keys `verified`, `dataStatus`, or `lastVerified` as part of field verification, and that anon receives no execute grants.

- [ ] **Step 3: Run and verify RED**

Run: `npx vitest run tests/phase4-reliability-schema.test.ts`

Expected: FAIL because migration SQL does not exist.

- [ ] **Step 4: Implement the migration with strict allowlists and atomic report transition**

The verification RPC must:

```sql
-- authorization predicate shape
coalesce((((auth.jwt() -> 'app_metadata') ->> 'amd_admin'))::boolean, false)
and not coalesce(((auth.jwt() ->> 'is_anonymous'))::boolean, false)
```

Use `SELECT ... FOR UPDATE` on the target `amd_places` row. Validate `p_field_name` against the five V1 domains before mutation. Validate linked report IDs belong to the same place, are `pending`/`reviewed`, and map to the selected domain. For `other`, require explicit supported-domain selection from the client payload.

Each supported field domain updates only its approved business-value keys, corresponding `*VerifiedAt` field, `fieldProvenance[field]`, `lastChecked`, and `lastUpdated`. It leaves `verified`, `dataStatus`, and `lastVerified` unchanged.

Audit event inserts include before/after values, before/after metadata, source, source URL, note, report IDs, `verified_by = auth.uid()`, and action.

Rollback is allowed only if the source event remains the latest event for the same `place_id + field_name`; otherwise raise a conflict exception. Rollback restores prior field value + prior field-specific provenance/timestamp, writes a new `rollback` event, and updates `lastChecked`/`lastUpdated` to rollback time.

Operational-state RPC upserts only state columns and requires the same admin guard.

- [ ] **Step 5: Run schema tests and verify GREEN**

Run: `npx vitest run tests/phase4-reliability-schema.test.ts`

Expected: PASS.

- [ ] **Step 6: Write failing client-wrapper tests**

```ts
expect(rpc).toHaveBeenCalledWith("amd_admin_verify_place_field", {
  p_place_id: place.id,
  p_field_name: "phone",
  p_new_value: { phone: "02-123-4567" },
  p_verify_unchanged: false,
  p_source: "manual_verified",
  p_source_url: null,
  p_note: "Called the shop",
  p_linked_report_ids: [],
  p_report_outcome: null,
});
```

Also test `verify_unchanged`, official source, linked `resolved` report, linked `rejected` report, history load, and rollback wrapper.

- [ ] **Step 7: Run RED, implement `lib/cloud/place-verification.ts`, then run GREEN**

Run before implementation: `npx vitest run tests/place-verification-cloud.test.ts`

Expected: FAIL.

Implement typed wrappers around the four RPCs. Do not expose raw table update helpers.

Run after implementation: `npx vitest run tests/place-verification-cloud.test.ts tests/phase4-reliability-schema.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/phase-4-data-reliability.sql lib/cloud/place-verification.ts tests/phase4-reliability-schema.test.ts tests/place-verification-cloud.test.ts
git commit -m "feat: add canonical verification transaction"
```

---

### Task 4: Reliability Summary and Admin Work Queue UI

**Files:**
- Create: `components/ReliabilitySummary.tsx`
- Create: `components/ReliabilityWorkQueue.tsx`
- Modify: `components/DataQualityDashboard.tsx`
- Test: `tests/reliability-work-queue.test.tsx`
- Test: `tests/data-quality-reliability-composition.test.tsx`

**Interfaces:**
- Consumes: `buildReliabilityTasks()`, `loadReliabilityTaskState()`, report rows, coverage gaps, `Place[]`.
- Produces UI callbacks:
  - `onVerifyTask(task: PlaceReliabilityTask)`
  - `onReviewCoverage(task: CoverageReliabilityTask)`
  - `onSearchCandidates(task: CoverageReliabilityTask)`

- [ ] **Step 1: Write failing queue UI tests**

Render mixed tasks and assert:

```ts
expect(screen.getByText("Critical")).toBeInTheDocument();
expect(screen.getByRole("button", { name: /Reports/i })).toBeInTheDocument();
expect(screen.getByRole("button", { name: /Opening hours/i })).toBeInTheDocument();
fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Noodle" } });
expect(screen.getByText("Noodle Place")).toBeInTheDocument();
expect(screen.queryByText("Cafe Place")).not.toBeInTheDocument();
expect(screen.getByText(/80\/100/)).toBeInTheDocument();
```

TH test must assert equivalent Thai labels. A coverage-only task must show `Review existing` and `Search candidates`; a place-field task must show `Verify`.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run tests/reliability-work-queue.test.tsx tests/data-quality-reliability-composition.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement summary + queue as isolated components**

`ReliabilitySummary` accepts already-derived tasks and renders counts by severity/report/stale/unknown only.

`ReliabilityWorkQueue` owns only presentation filters/search. It must not call external APIs or derive provider data. On task open, persist `in_review` through `saveReliabilityTaskState()` using the current revision.

`DataQualityDashboard` composes the new components and continues to compose existing report, coverage, and review panels. Do not move reliability engine logic into `DataQualityDashboard.tsx`.

- [ ] **Step 4: Run focused tests and commit**

Run: `npx vitest run tests/reliability-work-queue.test.tsx tests/data-quality-reliability-composition.test.tsx`

Expected: PASS.

Commit:

```bash
git add components/ReliabilitySummary.tsx components/ReliabilityWorkQueue.tsx components/DataQualityDashboard.tsx tests/reliability-work-queue.test.tsx tests/data-quality-reliability-composition.test.tsx
git commit -m "feat: add reliability admin work queue"
```

---

### Task 5: Quick Verify Sheet and Verification History With Rollback

**Files:**
- Create: `components/PlaceQuickVerifySheet.tsx`
- Create: `components/VerificationHistoryPanel.tsx`
- Test: `tests/place-quick-verify.test.tsx`
- Test: `tests/verification-history.test.tsx`

**Interfaces:**
- Consumes: `verifyCanonicalPlaceField()`, `rollbackPlaceVerification()`, `loadPlaceVerificationHistory()`.
- Produces:
  - `onVerified(result)` callback so parent reloads canonical places/tasks/reports after success.

- [ ] **Step 1: Write failing Quick Verify behavior tests**

Test phone `verify unchanged`:

```ts
render(<PlaceQuickVerifySheet open task={phoneTask} place={place} language="en" onClose={vi.fn()} onVerified={onVerified} />);
expect(screen.getByDisplayValue(place.phone ?? "")).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "Verify unchanged" }));
await waitFor(() => expect(verifyCanonicalPlaceField).toHaveBeenCalledWith(expect.objectContaining({
  placeId: place.id,
  fieldName: "phone",
  verifyUnchanged: true,
  newValue: null,
})));
```

Test update+verify, official/manual source selector, source URL, note, report outcome, and error state. Add a `closed` report test proving closure flags appear only for the opening/closure domain. Add an `other` report test proving action is blocked until admin selects one supported domain.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run tests/place-quick-verify.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement typed field editors**

Use explicit components/controls inside `PlaceQuickVerifySheet`:

- opening domain: structured hours + optional temporary/permanent closure flags when linked `closed` report exists;
- price domain: existing price model fields only;
- phone domain: normalized text input;
- parking domain: availability + typed `parkingDetails` fields;
- location domain: address, latitude, longitude with numeric/range validation.

Button rules:

- `Verify unchanged` sends no business-value mutation.
- `Update and verify` disabled until field payload validates and differs from canonical value.
- Report outcome selector is available only when linked reports exist.
- `resolved`/`rejected` is submitted only as part of verification RPC.
- `Snooze` writes operational state, never canonical data.
- Opening sheet does not invoke any external lookup on mount.

- [ ] **Step 4: Write failing history/rollback tests**

```ts
expect(screen.getByText("updated_and_verified")).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: /Rollback/i }));
await waitFor(() => expect(rollbackPlaceVerification).toHaveBeenCalledWith(event.id, expect.anything()));
```

A non-latest event must render rollback disabled with an explanatory TH/EN label.

- [ ] **Step 5: Implement history panel, run tests, commit**

Run: `npx vitest run tests/place-quick-verify.test.tsx tests/verification-history.test.tsx`

Expected: PASS.

Commit:

```bash
git add components/PlaceQuickVerifySheet.tsx components/VerificationHistoryPanel.tsx tests/place-quick-verify.test.tsx tests/verification-history.test.tsx
git commit -m "feat: add admin quick verify workflow"
```

---

### Task 6: Wire Reports and Coverage Into Verification-First Reliability Operations

**Files:**
- Modify: `components/PlaceReportAdminQueue.tsx`
- Modify: `components/CoverageDashboard.tsx`
- Modify: `components/DataQualityDashboard.tsx`
- Modify: `lib/cloud/place-reports.ts` only if required to share typed unresolved report rows with the reliability layer
- Test: `tests/phase4-report-verification-flow.test.tsx`
- Test: `tests/phase4-coverage-operations.test.tsx`

**Interfaces:**
- Report queue opens Quick Verify with mapped domain and linked report IDs.
- Coverage `Review existing` applies a reliability-queue filter.
- Coverage `Search candidates` calls existing explicit admin candidate-search callback only after button click.

- [ ] **Step 1: Write failing report-flow tests**

Assert the Phase 4 path has no blind resolve button for a pending report task:

```ts
expect(screen.getByRole("button", { name: /Verify data|ตรวจข้อมูล/i })).toBeInTheDocument();
expect(screen.queryByRole("button", { name: /^Resolved$|^แก้แล้ว$/i })).not.toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: /Verify data|ตรวจข้อมูล/i }));
expect(onOpenQuickVerify).toHaveBeenCalledWith(expect.objectContaining({ reportIds: [report.id] }));
```

For `other`, assert Quick Verify starts in `reportReview` and requires supported-domain selection before submission.

- [ ] **Step 2: Write failing coverage tests**

```ts
fireEvent.click(screen.getByRole("button", { name: "Review existing" }));
expect(onReviewGap).toHaveBeenCalledWith(gap);
expect(searchCandidates).not.toHaveBeenCalled();

fireEvent.click(screen.getByRole("button", { name: "Search candidates" }));
expect(searchCandidates).toHaveBeenCalledTimes(1);
```

No provider function may be invoked merely by rendering `CoverageDashboard`.

- [ ] **Step 3: Run RED, implement minimal wiring, run GREEN**

Run before: `npx vitest run tests/phase4-report-verification-flow.test.tsx tests/phase4-coverage-operations.test.tsx`

Expected: FAIL.

Implementation must preserve report status counts/history display but route active unresolved work through Quick Verify. Coverage buttons remain explicit user actions.

Run after: same command.

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/PlaceReportAdminQueue.tsx components/CoverageDashboard.tsx components/DataQualityDashboard.tsx lib/cloud/place-reports.ts tests/phase4-report-verification-flow.test.tsx tests/phase4-coverage-operations.test.tsx
git commit -m "feat: connect reports and coverage to reliability flow"
```

---

### Task 7: Public Freshness Summary Without Admin Leakage or Provider Calls

**Files:**
- Create: `components/PlaceFreshnessSummary.tsx`
- Modify: `components/PlaceDecisionPanel.tsx`
- Test: `tests/place-freshness-summary.test.tsx`
- Test: `tests/phase4-public-safety.test.tsx`

**Interfaces:**
- Consumes: `Place`, `language`, existing `getFieldFreshness()` and `dataAgeLabel()`.
- Produces no callbacks and no API requests.

- [ ] **Step 1: Write failing display tests**

Cases:

```ts
// all fresh
expect(screen.getByText(/Last checked|ตรวจล่าสุด/)).toBeInTheDocument();
expect(screen.queryByText(/outdated|ข้อมูลบางส่วนอาจเก่า/)).not.toBeInTheDocument();

// stale
expect(screen.getByText(/Some information may be outdated|ข้อมูลบางส่วนอาจเก่า/)).toBeInTheDocument();

// unknown
expect(screen.getByText(/Verification date is unavailable|ยังไม่ทราบวันที่ตรวจข้อมูล/)).toBeInTheDocument();
```

Add structural assertion that `PlaceReportWarning` renders before `PlaceFreshnessSummary`, and freshness renders before ETA/parking in the Decision Panel.

- [ ] **Step 2: Write failing public safety test**

Render Place Detail/Decision Panel with mocks for Google search/routes/photo/parking and admin reliability cloud functions. Assert none are called on render. Assert public DOM does not contain `Priority`, `task_revision`, `verified_by`, report message text, fingerprint, reviewer metadata, or audit history.

- [ ] **Step 3: Run RED**

Run: `npx vitest run tests/place-freshness-summary.test.tsx tests/phase4-public-safety.test.tsx`

Expected: FAIL.

- [ ] **Step 4: Implement compact freshness summary and mount it**

The component calculates the five V1 field statuses using existing thresholds. It renders one highest-severity neutral message plus `dataAgeLabel(place, language)`; it does not render all field details unless the design's compact state needs a single short list.

Do not import Supabase, Google provider modules, route modules, or reliability admin modules into `PlaceFreshnessSummary`.

- [ ] **Step 5: Run GREEN and commit**

Run: `npx vitest run tests/place-freshness-summary.test.tsx tests/phase4-public-safety.test.tsx`

Expected: PASS.

Commit:

```bash
git add components/PlaceFreshnessSummary.tsx components/PlaceDecisionPanel.tsx tests/place-freshness-summary.test.tsx tests/phase4-public-safety.test.tsx
git commit -m "feat: show public place freshness context"
```

---

### Task 8: Cross-Subsystem Safety, Localization, Mobile, and Acceptance Coverage

**Files:**
- Create: `tests/phase4-api-safety.test.tsx`
- Create: `tests/phase4-localization.test.tsx`
- Create: `tests/phase4-acceptance.test.ts`
- Modify or extend existing Playwright mobile test file under `e2e/` that covers Place Detail/Admin UI; use the existing file rather than creating a duplicate suite if one already owns the route.

**Interfaces:**
- No production interface changes unless a failing test identifies a real acceptance gap.

- [ ] **Step 1: Add API-safety regression tests**

Assert zero external-provider calls for:

- admin Data Quality dashboard initial render;
- reliability task derivation;
- Quick Verify initial open;
- coverage dashboard initial render;
- public Place Detail initial render.

Assert exactly one request only after the existing explicit candidate-search/admin external action is clicked; do not add new automatic provider behavior.

- [ ] **Step 2: Add TH/EN copy coverage**

Render Reliability Summary, Queue, Quick Verify, History, Coverage operation copy, and Public Freshness Summary in both languages. Assert no Thai-only units/labels leak into the English Phase 4 components and vice versa where translated copy exists.

- [ ] **Step 3: Add acceptance-structure test**

`tests/phase4-acceptance.test.ts` reads the relevant source/SQL and asserts the critical architecture contracts:

```ts
expect(migration).toContain("amd_admin_verify_place_field");
expect(migration).toContain("amd_admin_rollback_place_verification");
expect(queueSource).toContain("buildReliabilityTasks");
expect(quickVerifySource).toContain("verifyCanonicalPlaceField");
expect(publicFreshnessSource).not.toContain("supabase");
expect(publicFreshnessSource).not.toContain("google");
```

Also assert `AroundMyDormApp.tsx` does not gain reliability scoring or canonical verification code.

- [ ] **Step 4: Extend mobile E2E**

At mobile viewport, verify:

- reliability queue chips/buttons are tappable and do not overflow horizontally;
- Quick Verify sheet respects safe-area/bottom navigation and can scroll to the submit buttons;
- TH and EN render without clipped controls;
- public freshness message fits without covering ETA/parking content.

Use mocked/local app data; the E2E must not spend external API quota.

- [ ] **Step 5: Run focused Phase 4 suite and commit**

Run:

```bash
npx vitest run tests/reliability-priority.test.ts tests/reliability-tasks.test.ts tests/reliability-cloud-state.test.ts tests/phase4-reliability-schema.test.ts tests/place-verification-cloud.test.ts tests/reliability-work-queue.test.tsx tests/data-quality-reliability-composition.test.tsx tests/place-quick-verify.test.tsx tests/verification-history.test.tsx tests/phase4-report-verification-flow.test.tsx tests/phase4-coverage-operations.test.tsx tests/place-freshness-summary.test.tsx tests/phase4-public-safety.test.tsx tests/phase4-api-safety.test.tsx tests/phase4-localization.test.tsx tests/phase4-acceptance.test.ts
```

Expected: PASS.

Commit:

```bash
git add tests e2e
git commit -m "test: cover Phase 4 reliability acceptance"
```

---

### Task 9: Apply Production Migration and Verify Live Security/Catalog Before Merge

**Files:**
- No production code changes unless live schema compatibility requires a reviewed fix.
- Update plan evidence only if repository practice requires recording migration evidence; otherwise keep evidence in PR body.

**Interfaces:**
- Uses the approved Supabase production project for Around My Dorm.

- [ ] **Step 1: Re-run schema contract tests immediately before migration**

Run: `npx vitest run tests/phase4-reliability-schema.test.ts tests/place-verification-cloud.test.ts`

Expected: PASS.

- [ ] **Step 2: Reinspect the live catalog immediately before apply**

Verify `amd_places`, `amd_place_reports`, existing Phase 3 report RPCs, current JWT admin pattern, and absence of conflicting Phase 4 object names.

If live schema differs from the migration assumptions, stop and fix the migration through a new RED→GREEN schema test before apply.

- [ ] **Step 3: Apply `supabase/phase-4-data-reliability.sql` as a named migration**

Use a migration name equivalent to `around_my_dorm_phase_4_data_reliability_operations`.

Expected: migration succeeds atomically.

- [ ] **Step 4: Verify live catalog and grants after migration**

Confirm:

- both new tables exist with RLS enabled;
- anon has no write/read access to audit or operational admin state;
- authenticated execution exists only for intended security-definer RPCs;
- RPC definitions contain the non-anonymous `amd_admin` JWT guard;
- `amd_admin_verify_place_field` targets `amd_places`;
- no RPC grants canonical update ability to anon;
- audit table has no app-facing UPDATE/DELETE policy;
- report transition remains atomic inside verify RPC.

Run Supabase Security Advisor after DDL and distinguish new Phase 4 findings from unrelated pre-existing warnings. Do not claim the entire project is warning-free unless the advisor output actually proves that.

- [ ] **Step 5: Record migration version and verification evidence in the PR body**

Include migration version/name and concise catalog checks. Do not deploy the application merely because migration succeeds.

---

### Task 10: Full Verification, Review, PR Readiness, and Merge Gate

**Files:**
- No new files unless verification reveals a defect that goes through its own RED→GREEN fix.

**Interfaces:**
- Gate for PR readiness only.

- [ ] **Step 1: Run all unit/component tests**

Run: `npm test`

Expected: zero failed test files and zero failed tests.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 4: Run Cloudflare dry-run build**

Run: `npm run build:cloudflare`

Expected: exit code 0 and Wrangler dry-run success.

- [ ] **Step 5: Validate canonical data**

Run: `npm run validate:data`

Expected: exit code 0.

- [ ] **Step 6: Run mobile/browser E2E**

Run: `npm run test:e2e`

Expected: zero failed Playwright tests.

- [ ] **Step 7: Review all 24 spec acceptance criteria against evidence**

Create a checklist in the PR body mapping each criterion to either a test file, live catalog verification, or explicit manual UI/E2E evidence. Every item must have evidence; do not mark a criterion complete from code inspection alone when runtime behavior is involved.

- [ ] **Step 8: Review diff for scope and security**

Verify:

- no automatic provider calls were introduced;
- `AroundMyDormApp.tsx` did not absorb reliability engine logic;
- no raw generic canonical JSON editor exists;
- no public audit/admin/report-sensitive data exposure exists;
- whole-place `verified`, `dataStatus`, `lastVerified` remain unaffected by field verification;
- only approved Phase 4 V1 fields can be mutated through verify RPC;
- rollback is latest-event-only and append-only.

- [ ] **Step 9: Open PR only after the exact head SHA has green verification**

PR title: `Phase 4 data reliability and operations`

PR body must include summary, migration version, full verification commands/results, security/catalog evidence, explicit-provider-cost guard, and note that deployment is a separate action.

- [ ] **Step 10: Merge only after PR head remains unchanged and required checks pass**

Use expected-head-SHA merge protection. After merge, verify `main` points to the merge commit. Do not claim production app deployment until a separate deployment run is verified.

---

## Spec-to-Task Coverage

- Hybrid derived reliability model + no moving freshness persistence: Tasks 1–2.
- Deterministic priority/revision/sorting and operational-state reset: Tasks 1–2.
- Admin work queue/search/filter/severity: Task 4.
- Quick Verify typed editors + verify unchanged: Task 5.
- Canonical transactional write + strict allowlist + provenance/timestamps: Task 3.
- Report verification-first resolve/reject: Tasks 3 and 6.
- Append-only audit and latest-event rollback: Tasks 3 and 5.
- Coverage operations and explicit candidate search: Task 6.
- Public freshness and privacy boundaries: Task 7.
- No automatic external provider usage: Tasks 6–8.
- TH/EN + mobile safe area: Task 8.
- Production migration/RLS/RPC catalog verification: Task 9.
- Full unit/type/build/Cloudflare/data/E2E acceptance: Task 10.
