# Phase 4 — Data Reliability & Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reliability operations layer that derives maintenance work from canonical freshness, public reports, and coverage gaps; lets authorized admins verify shared canonical place fields safely; records append-only audit history; and exposes compact public freshness context without automatic external-provider requests.

**Architecture:** Use a hybrid model. Reliability tasks/priority are derived from `amd_places.record`, unresolved Phase 3 reports, and stored-data-only coverage gaps; only operational task state and verification audit events persist. A focused `ReliabilityOperations` controller owns admin report/state loading and selected verification work, while canonical writes go through strict admin-only Supabase RPCs that atomically update one supported field domain, field verification metadata, audit history, and optional linked report status.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.8, Vitest 3.2 + Testing Library, Supabase/PostgreSQL RPC + RLS, Playwright 1.55, Cloudflare Workers/Wrangler, Node >=22.

**Spec:** `docs/superpowers/specs/2026-09-18-phase-4-data-reliability-operations-design.md`

## Global Constraints

- Production canonical place data is `public.amd_places.record`; do not target legacy `public.places` without live-catalog proof.
- Supported Phase 4 V1 verification domains are exactly `openingHours`, `price`, `phone`, `parking`, and `location`; `reportReview` is queue-only.
- Field-level Quick Verify must never change whole-place `verified`, `dataStatus`, or `lastVerified`.
- External Google/Routes/Parking/Photo/Geocoding requests must never run automatically from dashboard open, task derivation, Quick Verify open, coverage analysis, or public Place Detail open.
- Public reports never mutate canonical data directly and cannot be resolved/rejected in the Phase 4 reliability flow without successful canonical verification.
- `manual_verified` and `official` provenance follow the existing provenance model; a URL alone never implies `official`.
- Public UI must not expose admin priority score, operational state, audit metadata, reporter fingerprints, reviewer metadata, or report notes.
- Derived `fresh/aging/stale/unknown` states remain computed and are never persisted as task truth.
- Verification audit history is append-only; rollback creates a new event and never deletes prior events.
- TH/EN copy and mobile safe-area behavior are required for all new UI.
- Use TDD for every production behavior change: verify RED before implementation and GREEN after minimal implementation.
- Final verification commands: `npm test`, `npm run typecheck`, `npm run build`, `npm run build:cloudflare`, `npm run validate:data`, `npm run test:e2e`.

---

## File Structure

Create:

- `lib/reliability/types.ts` — all Phase 4 task/state/score types.
- `lib/reliability/report-domain.ts` — report type → reliability domain mapping.
- `lib/reliability/priority.ts` — deterministic scoring and severity.
- `lib/reliability/tasks.ts` — task derivation, revision, dedupe, state application, sorting.
- `lib/cloud/reliability.ts` — operational task-state client.
- `lib/cloud/place-verification.ts` — verify/history/rollback RPC client.
- `components/ReliabilityOperations.tsx` — admin controller: reports + task state + selected task + refresh orchestration.
- `components/ReliabilitySummary.tsx` — task counts only.
- `components/ReliabilityWorkQueue.tsx` — filters/search/task actions only.
- `components/PlaceQuickVerifySheet.tsx` — typed field verification UI.
- `components/VerificationHistoryPanel.tsx` — append-only audit history + eligible rollback.
- `components/PlaceFreshnessSummary.tsx` — public freshness-only UI.
- `supabase/phase-4-data-reliability.sql` — task state, audit, RLS/grants, admin RPCs.
- `e2e/phase4-reliability.spec.ts` — mobile/admin/public Phase 4 E2E.

Modify:

- `components/DataManagement.tsx` — pass existing `onReload` to Data Quality/Reliability composition.
- `components/DataQualityDashboard.tsx` — mount `ReliabilityOperations`; keep diagnostics/review composition lean.
- `components/PlaceReportAdminQueue.tsx` — become controlled by `ReliabilityOperations` and route active reports to Quick Verify.
- `components/CoverageDashboard.tsx` — keep analysis local; route explicit actions to reliability/candidate callbacks.
- `components/PlaceDecisionPanel.tsx` — mount public freshness after report warning and before ETA/parking.
- `lib/cloud/place-reports.ts` — reuse existing admin `loadPlaceReports()` type/function without public-sensitive leakage.

Tests remain in `tests/` with `.test.ts` / `.test.tsx`.

---

### Task 1: Reliability Types, Report Mapping, Priority, Revision, and Derived Tasks

**Files:**
- Create: `lib/reliability/types.ts`
- Create: `lib/reliability/report-domain.ts`
- Create: `lib/reliability/priority.ts`
- Create: `lib/reliability/tasks.ts`
- Test: `tests/reliability-priority.test.ts`
- Test: `tests/reliability-tasks.test.ts`

**Interfaces produced:**

```ts
export type ReliabilityField = "openingHours" | "price" | "phone" | "parking" | "location";
export type ReliabilityDomain = ReliabilityField | "reportReview" | "coverage";
export type ReliabilitySeverity = "critical" | "high" | "normal" | "low";
export type ReliabilityTaskStatus = "open" | "in_review" | "snoozed" | "done";
export type ReliabilityScorePart = { code: string; points: number };

export type ReliabilityTaskState = {
  taskKey: string;
  taskRevision: string;
  placeId: string | null;
  fieldName: ReliabilityDomain;
  status: ReliabilityTaskStatus;
  snoozedUntil: string | null;
  assignedTo: string | null;
  lastOpenedAt: string | null;
  note: string | null;
  updatedAt: string;
};

export type ReliabilityTaskStateWrite = Omit<ReliabilityTaskState, "assignedTo" | "lastOpenedAt" | "updatedAt">;

export type PlaceReliabilityTask = {
  kind: "place_field";
  id: string;
  revision: string;
  placeId: string;
  placeName: string;
  field: ReliabilityField | "reportReview";
  reasons: string[];
  priority: number;
  severity: ReliabilitySeverity;
  reportIds: string[];
  freshnessStatus: "fresh" | "aging" | "stale" | "unknown" | null;
  relatedCoverageGapIds: string[];
  scoreBreakdown: ReliabilityScorePart[];
};

export type CoverageReliabilityTask = {
  kind: "coverage_gap";
  id: string;
  revision: string;
  placeId: null;
  label: string;
  field: "coverage";
  coverageGapId: string;
  priority: number;
  severity: ReliabilitySeverity;
  scoreBreakdown: ReliabilityScorePart[];
};

export type ReliabilityTask = PlaceReliabilityTask | CoverageReliabilityTask;
```

- [ ] **Step 1: Write failing mapping/scoring tests**

```ts
import { describe, expect, it } from "vitest";
import { mapReportTypeToReliabilityDomain } from "@/lib/reliability/report-domain";
import { scoreReliabilityTask } from "@/lib/reliability/priority";

describe("Phase 4 reliability priority", () => {
  it("maps reports to the approved domains", () => {
    expect(mapReportTypeToReliabilityDomain("opening_hours")).toBe("openingHours");
    expect(mapReportTypeToReliabilityDomain("closed")).toBe("openingHours");
    expect(mapReportTypeToReliabilityDomain("price")).toBe("price");
    expect(mapReportTypeToReliabilityDomain("parking")).toBe("parking");
    expect(mapReportTypeToReliabilityDomain("phone")).toBe("phone");
    expect(mapReportTypeToReliabilityDomain("location")).toBe("location");
    expect(mapReportTypeToReliabilityDomain("moved")).toBe("location");
    expect(mapReportTypeToReliabilityDomain("other")).toBe("reportReview");
  });

  it("caps score at 100 and returns a breakdown", () => {
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

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/reliability-priority.test.ts`

Expected: FAIL because Phase 4 reliability modules do not exist.

- [ ] **Step 3: Implement `types.ts`, report mapping, and scorer**

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
export const mapReportTypeToReliabilityDomain = (type: PlaceReportType) => DOMAIN[type];
```

```ts
// lib/reliability/priority.ts
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

- [ ] **Step 4: Run GREEN for scorer**

Run: `npx vitest run tests/reliability-priority.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing derived-task/revision tests**

Use `PLACES[0]` and fixed `now = new Date("2026-09-18T09:00:00Z")`. Test that:

```ts
expect(tasks.map((task) => task.id)).toContain(`${place.id}:openingHours`);
expect(tasks.find((task) => task.id === `${place.id}:openingHours`)?.reportIds).toEqual([report.id]);
expect(firstRevision).not.toBe(secondRevision);
expect(tasks.every((task) => task.priority <= 100)).toBe(true);
expect(tasks.find((task) => task.kind === "coverage_gap")?.placeId).toBeNull();
```

Also prove matching-revision snooze suppresses only until `snoozedUntil`, while a changed task revision ignores prior `done/snoozed/in_review` state.

- [ ] **Step 6: Run RED**

Run: `npx vitest run tests/reliability-tasks.test.ts`

Expected: FAIL because `buildReliabilityTasks()` does not exist.

- [ ] **Step 7: Implement deterministic task derivation**

Create this exact input type in `lib/reliability/tasks.ts`:

```ts
export type BuildReliabilityTasksInput = {
  places: Place[];
  reports: PlaceReportRow[];
  coverageGaps: CoverageGap[];
  operationalState: ReliabilityTaskState[];
  now?: Date;
};
```

Implementation rules:

```ts
export function buildReliabilityTasks(input: BuildReliabilityTasksInput): ReliabilityTask[] {
  const now = input.now ?? new Date();
  const unresolved = input.reports.filter((report) => report.status === "pending" || report.status === "reviewed");
  // Build exactly one task per placeId + mapped domain, merge freshness/report/gap signals,
  // derive revision from field verification timestamp + sorted report id/status/duplicateCount + sorted gap ids,
  // create standalone coverage_gap tasks, apply state only when taskRevision matches,
  // suppress only currently-active snooze, score, then sort by priority/report/oldest/distance/name.
  return deriveAndSortReliabilityTasks({ ...input, reports: unresolved, now });
}
```

Implement `deriveAndSortReliabilityTasks()` in the same file; it is private and must be covered through `buildReliabilityTasks()` tests. Use stable JSON serialization plus a deterministic non-secret string hash for revisions.

- [ ] **Step 8: Run focused GREEN and commit**

Run: `npx vitest run tests/reliability-priority.test.ts tests/reliability-tasks.test.ts`

Expected: PASS.

Commit:

```bash
git add lib/reliability tests/reliability-priority.test.ts tests/reliability-tasks.test.ts
git commit -m "feat: add reliability task engine"
```

---

### Task 2: Persist Only Operational Task State

**Files:**
- Create: `lib/cloud/reliability.ts`
- Test: `tests/reliability-cloud-state.test.ts`

**Interfaces produced:**

```ts
loadReliabilityTaskState(): Promise<ReliabilityTaskState[]>
saveReliabilityTaskState(input: ReliabilityTaskStateWrite): Promise<ReliabilityTaskState>
```

- [ ] **Step 1: Write failing Supabase wrapper tests**

Assert `loadReliabilityTaskState()` reads only operational columns and `saveReliabilityTaskState()` calls:

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

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/reliability-cloud-state.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement explicit row/RPC mapping**

```ts
const fromRow = (row: any): ReliabilityTaskState => ({
  taskKey: row.task_key,
  taskRevision: row.task_revision,
  placeId: row.place_id,
  fieldName: row.field_name,
  status: row.status,
  snoozedUntil: row.snoozed_until,
  assignedTo: row.assigned_to,
  lastOpenedAt: row.last_opened_at,
  note: row.note,
  updatedAt: row.updated_at,
});

export async function loadReliabilityTaskState() {
  const { data, error } = await supabase.from("amd_reliability_task_state")
    .select("task_key,task_revision,place_id,field_name,status,snoozed_until,assigned_to,last_opened_at,note,updated_at");
  if (error) throw error;
  return (data || []).map(fromRow);
}

export async function saveReliabilityTaskState(input: ReliabilityTaskStateWrite) {
  const { data, error } = await supabase.rpc("amd_admin_set_reliability_task_state", {
    p_task_key: input.taskKey,
    p_task_revision: input.taskRevision,
    p_place_id: input.placeId,
    p_field_name: input.fieldName,
    p_status: input.status,
    p_snoozed_until: input.snoozedUntil,
    p_note: input.note,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return fromRow(row);
}
```

- [ ] **Step 4: Run GREEN and commit**

Run: `npx vitest run tests/reliability-cloud-state.test.ts`

Expected: PASS.

Commit:

```bash
git add lib/cloud/reliability.ts tests/reliability-cloud-state.test.ts
git commit -m "feat: add reliability task state client"
```

---

### Task 3: Canonical Verification SQL, Security, Audit, History, and Rollback

**Files:**
- Create: `supabase/phase-4-data-reliability.sql`
- Create: `lib/cloud/place-verification.ts`
- Test: `tests/phase4-reliability-schema.test.ts`
- Test: `tests/place-verification-cloud.test.ts`

**Client types produced in `lib/cloud/place-verification.ts`:**

```ts
export type PlaceVerificationAction = "verified_unchanged" | "updated_and_verified" | "rollback";
export type PlaceVerificationResult = { placeId: string; fieldName: ReliabilityField; action: PlaceVerificationAction; eventId: string };
export type PlaceVerificationEvent = {
  id: string;
  placeId: string;
  fieldName: ReliabilityField;
  action: PlaceVerificationAction;
  beforeValue: unknown;
  afterValue: unknown;
  source: string;
  sourceUrl: string | null;
  note: string | null;
  linkedReportIds: string[];
  createdAt: string;
  rollbackOf: string | null;
  rollbackEligible: boolean;
};
```

- [ ] **Step 1: Inspect live Supabase catalog before writing SQL**

Verify exact `public.amd_places` id column, `record` JSON/JSONB type, `public.amd_place_reports` columns/statuses, Phase 3 report RPCs, and current JWT admin predicate. Put the verified table/column facts in comments at the top of the migration SQL. Do not use legacy `public.places`.

- [ ] **Step 2: Write failing SQL contract tests**

```ts
const sql = fs.readFileSync("supabase/phase-4-data-reliability.sql", "utf8");
expect(sql).toContain("public.amd_places");
expect(sql).not.toMatch(/update\s+public\.places\b/i);
expect(sql).toContain("amd_reliability_task_state");
expect(sql).toContain("amd_place_verification_events");
expect(sql).toContain("amd_admin_verify_place_field");
expect(sql).toContain("amd_admin_rollback_place_verification");
expect(sql).toContain("amd_admin_place_verification_history");
expect(sql).toContain("amd_admin_set_reliability_task_state");
expect(sql).toContain("auth.jwt() -> 'app_metadata'");
expect(sql).toContain("amd_admin");
expect(sql).toContain("is_anonymous");
expect(sql).toMatch(/for\s+update/i);
expect(sql).toMatch(/verified_unchanged/);
expect(sql).toMatch(/updated_and_verified/);
expect(sql).toMatch(/rollback/);
expect(sql).not.toMatch(/grant\s+execute[^;]+to\s+anon/i);
```

Add assertions that field verification SQL never assigns whole-place JSON keys `verified`, `dataStatus`, or `lastVerified`.

- [ ] **Step 3: Run SQL RED**

Run: `npx vitest run tests/phase4-reliability-schema.test.ts`

Expected: FAIL because migration SQL does not exist.

- [ ] **Step 4: Implement migration**

Use this exact authorization predicate in every privileged RPC:

```sql
coalesce((((auth.jwt() -> 'app_metadata') ->> 'amd_admin'))::boolean, false)
and not coalesce(((auth.jwt() ->> 'is_anonymous'))::boolean, false)
```

Create:

```sql
public.amd_reliability_task_state(
  task_key text primary key,
  task_revision text not null,
  place_id text null,
  field_name text not null,
  status text not null check (status in ('open','in_review','snoozed','done')),
  snoozed_until timestamptz null,
  assigned_to uuid null,
  last_opened_at timestamptz null,
  note text null,
  updated_at timestamptz not null default now()
);
```

Create append-only `public.amd_place_verification_events` with the exact fields from the approved spec: id, place_id, field_name, action, before/after values, before/after metadata, source, source_url, note, linked_report_ids, verified_by, created_at, rollback_of.

`amd_admin_verify_place_field` must `SELECT ... FOR UPDATE` the canonical place row, validate one of five domains, validate linked reports belong to the same place and are `pending/reviewed`, update only approved business keys + field verification timestamp + `fieldProvenance[field]` + `lastChecked` + `lastUpdated`, insert audit event, and transition linked reports only inside the same transaction. Leave `verified`, `dataStatus`, `lastVerified` unchanged.

`amd_admin_rollback_place_verification` must reject rollback when a newer event exists for the same place+field, restore prior field value/provenance/field verification timestamp, update `lastChecked/lastUpdated` to rollback time, and append a rollback event without changing reports.

Enable RLS on both tables; no anon access. Audit has admin SELECT only and no app-facing UPDATE/DELETE policy. Task state has admin SELECT and state mutation only through the security-definer state RPC.

- [ ] **Step 5: Run SQL GREEN**

Run: `npx vitest run tests/phase4-reliability-schema.test.ts`

Expected: PASS.

- [ ] **Step 6: Write failing client RPC tests**

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

Also test verify unchanged, `official`, linked resolved/rejected report, history, and rollback.

- [ ] **Step 7: Run RED, implement wrappers, run GREEN**

Run before: `npx vitest run tests/place-verification-cloud.test.ts`

Expected: FAIL.

Implement exact exports:

```ts
verifyCanonicalPlaceField(input: VerifyCanonicalPlaceFieldInput): Promise<PlaceVerificationResult>
loadPlaceVerificationHistory(placeId: string): Promise<PlaceVerificationEvent[]>
rollbackPlaceVerification(eventId: string, note: string | null): Promise<PlaceVerificationResult>
```

Run after: `npx vitest run tests/place-verification-cloud.test.ts tests/phase4-reliability-schema.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/phase-4-data-reliability.sql lib/cloud/place-verification.ts tests/phase4-reliability-schema.test.ts tests/place-verification-cloud.test.ts
git commit -m "feat: add canonical verification transaction"
```

---

### Task 4: ReliabilityOperations Controller + Admin Queue Composition

**Files:**
- Create: `components/ReliabilityOperations.tsx`
- Create: `components/ReliabilitySummary.tsx`
- Create: `components/ReliabilityWorkQueue.tsx`
- Modify: `components/DataQualityDashboard.tsx`
- Modify: `components/DataManagement.tsx`
- Test: `tests/reliability-operations.test.tsx`
- Test: `tests/reliability-work-queue.test.tsx`

**Controller contract:**

```ts
export function ReliabilityOperations({
  places,
  language,
  onReload,
  onSearchCoverageGap,
}: {
  places: Place[];
  language: "th" | "en";
  onReload: () => void;
  onSearchCoverageGap: (gap: CoverageGap) => void;
})
```

- [ ] **Step 1: Write failing controller tests**

Mock `loadPlaceReports()`, `loadReliabilityTaskState()`, `buildCoverageReport()`, and assert one initial admin refresh produces the inputs for `buildReliabilityTasks()`. Assert no Google/Routes/Parking/Photo function is invoked.

After mocked successful `onVerified`, assert:

```ts
expect(onReload).toHaveBeenCalledTimes(1);
expect(loadPlaceReports).toHaveBeenCalledTimes(2);
expect(loadReliabilityTaskState).toHaveBeenCalledTimes(2);
```

- [ ] **Step 2: Write failing queue UI tests**

Assert Critical/High filters, Reports/Opening/Price/Parking/Phone/Location filters, searchbox behavior, TH/EN labels, coverage actions, and `Verify` action for place-field tasks.

- [ ] **Step 3: Run RED**

Run: `npx vitest run tests/reliability-operations.test.tsx tests/reliability-work-queue.test.tsx`

Expected: FAIL.

- [ ] **Step 4: Implement controller and presentational children**

`ReliabilityOperations` owns:

```ts
const [reports, setReports] = useState<PlaceReportRow[]>([]);
const [taskState, setTaskState] = useState<ReliabilityTaskState[]>([]);
const [selectedTask, setSelectedTask] = useState<PlaceReliabilityTask | null>(null);
const coverageReport = useMemo(() => buildCoverageReport(places), [places]);
const tasks = useMemo(() => buildReliabilityTasks({ places, reports, coverageGaps: coverageReport.gaps, operationalState: taskState }), [places, reports, coverageReport.gaps, taskState]);
```

`refreshAdminData()` loads `loadPlaceReports()` and `loadReliabilityTaskState()` together. Successful verification calls `onReload()` then `refreshAdminData()`; updated `places` from parent completes canonical refresh on the next render.

`DataManagement` passes its existing `onReload` into `DataQualityDashboard`; `DataQualityDashboard` passes it to `ReliabilityOperations`. Do not add reliability engine logic to `AroundMyDormApp.tsx`.

- [ ] **Step 5: Run GREEN and commit**

Run: `npx vitest run tests/reliability-operations.test.tsx tests/reliability-work-queue.test.tsx`

Expected: PASS.

Commit:

```bash
git add components/ReliabilityOperations.tsx components/ReliabilitySummary.tsx components/ReliabilityWorkQueue.tsx components/DataQualityDashboard.tsx components/DataManagement.tsx tests/reliability-operations.test.tsx tests/reliability-work-queue.test.tsx
git commit -m "feat: add reliability operations workspace"
```

---

### Task 5: Quick Verify Sheet + Verification History

**Files:**
- Create: `components/PlaceQuickVerifySheet.tsx`
- Create: `components/VerificationHistoryPanel.tsx`
- Modify: `components/ReliabilityOperations.tsx`
- Test: `tests/place-quick-verify.test.tsx`
- Test: `tests/verification-history.test.tsx`

- [ ] **Step 1: Write failing Quick Verify tests**

```ts
render(<PlaceQuickVerifySheet open task={phoneTask} place={place} language="en" onClose={vi.fn()} onVerified={onVerified} />);
fireEvent.click(screen.getByRole("button", { name: "Verify unchanged" }));
await waitFor(() => expect(verifyCanonicalPlaceField).toHaveBeenCalledWith(expect.objectContaining({
  placeId: place.id,
  fieldName: "phone",
  verifyUnchanged: true,
  newValue: null,
})));
```

Also test update+verify, manual/official source, source URL, note, linked report outcome, server error, `closed` report closure flags, and `other` report blocked until admin chooses a supported domain.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/place-quick-verify.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement typed editors inside the sheet**

Implement explicit controls, not a raw JSON editor:

- `openingHours`: seven-day structured controls plus `temporaryClosed/permanentlyClosed` only when reviewing a linked `closed` report;
- `price`: pricing type, min/max/fixed/unit using existing `Pricing` shape;
- `phone`: normalized text;
- `parking`: availability + typed `ParkingDetails` values;
- `location`: address + latitude [-90,90] + longitude [-180,180].

`Verify unchanged` sends `newValue: null`. `Update and verify` stays disabled until a valid changed payload exists. Report `resolved/rejected` is sent only through `verifyCanonicalPlaceField()`. Snooze calls `saveReliabilityTaskState()` and never canonical verification.

- [ ] **Step 4: Write failing history tests**

Assert latest event can rollback and older event cannot:

```ts
expect(screen.getByText("updated_and_verified")).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: /Rollback/i }));
await waitFor(() => expect(rollbackPlaceVerification).toHaveBeenCalledWith(latest.id, expect.any(String)));
expect(screen.getByTestId(`rollback-${older.id}`)).toBeDisabled();
```

- [ ] **Step 5: Implement history panel/controller integration**

Load history when a place task is selected. After verify or rollback succeeds, close/refresh as appropriate, call controller `onReload`, then refresh reports/task state/history.

- [ ] **Step 6: Run GREEN and commit**

Run: `npx vitest run tests/place-quick-verify.test.tsx tests/verification-history.test.tsx tests/reliability-operations.test.tsx`

Expected: PASS.

Commit:

```bash
git add components/PlaceQuickVerifySheet.tsx components/VerificationHistoryPanel.tsx components/ReliabilityOperations.tsx tests/place-quick-verify.test.tsx tests/verification-history.test.tsx tests/reliability-operations.test.tsx
git commit -m "feat: add quick verify and audit history"
```

---

### Task 6: Verification-First Report Queue + Coverage Operations

**Files:**
- Modify: `components/PlaceReportAdminQueue.tsx`
- Modify: `components/CoverageDashboard.tsx`
- Modify: `components/ReliabilityOperations.tsx`
- Modify: `components/DataQualityDashboard.tsx`
- Test: `tests/phase4-report-verification-flow.test.tsx`
- Test: `tests/phase4-coverage-operations.test.tsx`

**Controlled Report Queue contract:**

```ts
PlaceReportAdminQueue({
  places,
  language,
  reports,
  loading,
  error,
  onRefresh,
  onOpenQuickVerify,
})
```

- [ ] **Step 1: Write failing report-flow test**

```ts
expect(screen.getByRole("button", { name: /Verify data|ตรวจข้อมูล/i })).toBeInTheDocument();
expect(screen.queryByRole("button", { name: /^Resolved$|^แก้แล้ว$/i })).not.toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: /Verify data|ตรวจข้อมูล/i }));
expect(onOpenQuickVerify).toHaveBeenCalledWith(expect.objectContaining({ reportIds: [report.id] }));
```

`other` opens `reportReview` and cannot submit until a supported domain is selected.

- [ ] **Step 2: Write failing coverage tests**

```ts
fireEvent.click(screen.getByRole("button", { name: "Review existing" }));
expect(onReviewGap).toHaveBeenCalledWith(gap);
expect(searchCandidates).not.toHaveBeenCalled();
fireEvent.click(screen.getByRole("button", { name: "Search candidates" }));
expect(searchCandidates).toHaveBeenCalledTimes(1);
```

Provider mocks remain zero on initial render.

- [ ] **Step 3: Run RED**

Run: `npx vitest run tests/phase4-report-verification-flow.test.tsx tests/phase4-coverage-operations.test.tsx`

Expected: FAIL.

- [ ] **Step 4: Implement controlled report queue and coverage routing**

Move active report data ownership to `ReliabilityOperations`; the queue keeps filters/counts/display but no independent report fetch. Pending/reviewed rows expose `Verify data`, not blind `Resolved/Reject` mutation in the Phase 4 path. Historical resolved/rejected rows remain visible read-only.

Coverage `Review existing` sets a queue filter using the selected `coverageGapId`; `Search candidates` calls the explicit callback supplied by Data Quality/Data Management and never runs on mount.

- [ ] **Step 5: Run GREEN and commit**

Run: `npx vitest run tests/phase4-report-verification-flow.test.tsx tests/phase4-coverage-operations.test.tsx tests/reliability-operations.test.tsx`

Expected: PASS.

Commit:

```bash
git add components/PlaceReportAdminQueue.tsx components/CoverageDashboard.tsx components/ReliabilityOperations.tsx components/DataQualityDashboard.tsx tests/phase4-report-verification-flow.test.tsx tests/phase4-coverage-operations.test.tsx
git commit -m "feat: connect reports and coverage to reliability"
```

---

### Task 7: Public Freshness Summary

**Files:**
- Create: `components/PlaceFreshnessSummary.tsx`
- Modify: `components/PlaceDecisionPanel.tsx`
- Test: `tests/place-freshness-summary.test.tsx`
- Test: `tests/phase4-public-safety.test.tsx`

- [ ] **Step 1: Write failing freshness display tests**

```ts
expect(screen.getByText(/Last checked|ตรวจล่าสุด/)).toBeInTheDocument();
expect(screen.getByText(/Some information may be outdated|ข้อมูลบางส่วนอาจเก่า/)).toBeInTheDocument();
expect(screen.getByText(/Verification date is unavailable|ยังไม่ทราบวันที่ตรวจข้อมูล/)).toBeInTheDocument();
```

Use separate fixtures for all-fresh, stale, and unknown. All-fresh must omit stale/unknown warnings.

- [ ] **Step 2: Write failing public privacy/API test**

Render Decision Panel with provider/admin mocks. Assert zero Google search/routes/photo/parking/admin-reliability calls on render and DOM absence of `Priority`, `task_revision`, `verified_by`, report note/message, reporter fingerprint, reviewer metadata, and audit history.

- [ ] **Step 3: Run RED**

Run: `npx vitest run tests/place-freshness-summary.test.tsx tests/phase4-public-safety.test.tsx`

Expected: FAIL.

- [ ] **Step 4: Implement compact public component**

Use existing `getFieldFreshness()` for the five V1 domains and `dataAgeLabel()` for last-check copy. Render one highest-severity neutral warning; do not import Supabase, reliability admin modules, Google provider modules, route modules, or parking search modules.

Mount order in `PlaceDecisionPanel`:

```tsx
<PlaceReportWarning ... />
<PlaceFreshnessSummary ... />
<PlaceEtaPanel ... />
<NearbyParkingPanel ... />
```

- [ ] **Step 5: Run GREEN and commit**

Run: `npx vitest run tests/place-freshness-summary.test.tsx tests/phase4-public-safety.test.tsx`

Expected: PASS.

Commit:

```bash
git add components/PlaceFreshnessSummary.tsx components/PlaceDecisionPanel.tsx tests/place-freshness-summary.test.tsx tests/phase4-public-safety.test.tsx
git commit -m "feat: show public freshness context"
```

---

### Task 8: Cross-Subsystem API Safety, TH/EN, Mobile E2E, and Acceptance Tests

**Files:**
- Create: `tests/phase4-api-safety.test.tsx`
- Create: `tests/phase4-localization.test.tsx`
- Create: `tests/phase4-acceptance.test.ts`
- Create: `e2e/phase4-reliability.spec.ts`

- [ ] **Step 1: Add API-safety tests**

Assert zero external-provider calls for initial render of Data Management/Reliability Operations, derived task build, Quick Verify open, Coverage Dashboard, and public Place Detail. Assert candidate/provider search occurs only after its explicit admin button click.

- [ ] **Step 2: Add TH/EN coverage**

Render Reliability Summary, Queue, Quick Verify, History, Report Queue Phase 4 actions, Coverage actions, and Public Freshness in both languages. Assert English UI does not emit Thai-only Phase 4 labels and Thai UI has the approved Thai copy.

- [ ] **Step 3: Add architecture acceptance test**

```ts
const migration = fs.readFileSync("supabase/phase-4-data-reliability.sql", "utf8");
const appShell = fs.readFileSync("components/AroundMyDormApp.tsx", "utf8");
const freshness = fs.readFileSync("components/PlaceFreshnessSummary.tsx", "utf8");
expect(migration).toContain("amd_admin_verify_place_field");
expect(migration).toContain("amd_admin_rollback_place_verification");
expect(appShell).not.toContain("buildReliabilityTasks(");
expect(appShell).not.toContain("verifyCanonicalPlaceField(");
expect(freshness).not.toContain("supabase");
expect(freshness.toLowerCase()).not.toContain("google");
```

- [ ] **Step 4: Implement `e2e/phase4-reliability.spec.ts`**

Use Playwright mobile viewport and intercepted/mocked external-provider endpoints. Cover:

- Reliability Queue chips/buttons have no horizontal overflow;
- Quick Verify sheet scroll reaches Verify/Update buttons and respects safe-area/bottom navigation;
- TH and EN controls are not clipped;
- public freshness summary does not overlap ETA/parking;
- intercepted external-provider request counter remains zero until an explicit provider/search action is clicked.

- [ ] **Step 5: Run focused Phase 4 suite and commit**

Run:

```bash
npx vitest run tests/reliability-priority.test.ts tests/reliability-tasks.test.ts tests/reliability-cloud-state.test.ts tests/phase4-reliability-schema.test.ts tests/place-verification-cloud.test.ts tests/reliability-operations.test.tsx tests/reliability-work-queue.test.tsx tests/place-quick-verify.test.tsx tests/verification-history.test.tsx tests/phase4-report-verification-flow.test.tsx tests/phase4-coverage-operations.test.tsx tests/place-freshness-summary.test.tsx tests/phase4-public-safety.test.tsx tests/phase4-api-safety.test.tsx tests/phase4-localization.test.tsx tests/phase4-acceptance.test.ts
```

Expected: PASS.

Run: `npx playwright test e2e/phase4-reliability.spec.ts`

Expected: PASS.

Commit:

```bash
git add tests/phase4-api-safety.test.tsx tests/phase4-localization.test.tsx tests/phase4-acceptance.test.ts e2e/phase4-reliability.spec.ts
git commit -m "test: cover Phase 4 reliability acceptance"
```

---

### Task 9: Apply Production Migration and Verify Live Security/Catalog

**Files:**
- Production artifact already created: `supabase/phase-4-data-reliability.sql`

- [ ] **Step 1: Re-run schema/client tests immediately before migration**

Run: `npx vitest run tests/phase4-reliability-schema.test.ts tests/place-verification-cloud.test.ts`

Expected: PASS.

- [ ] **Step 2: Reinspect production catalog**

Verify live `amd_places`, `amd_place_reports`, Phase 3 report RPCs, JWT admin pattern, and absence of conflicting Phase 4 object names. If any assumption differs, create a failing schema regression test, fix SQL, and get it green before applying.

- [ ] **Step 3: Apply named migration**

Migration name: `around_my_dorm_phase_4_data_reliability_operations`.

Expected: migration succeeds atomically.

- [ ] **Step 4: Verify catalog/RLS/grants/RPC definitions after apply**

Confirm both Phase 4 tables exist with RLS enabled; anon has no access; audit has no app UPDATE/DELETE policy; intended authenticated RPC grants exist; every privileged RPC has `amd_admin` + non-anonymous guard; verify RPC targets `amd_places`; report transition is inside verification transaction; rollback is latest-event-only.

Run Supabase Security Advisor after DDL. Report Phase 4 findings separately from unrelated pre-existing project warnings; never claim global advisor cleanliness without evidence.

- [ ] **Step 5: Record migration version and catalog/security evidence in PR body**

Do not deploy the app merely because database migration succeeded.

---

### Task 10: Full Verification and PR/Merge Gate

**Files:**
- No planned production file changes. Any defect found here gets its own RED→GREEN fix before proceeding.

- [ ] **Step 1: Unit/component suite**

Run: `npm test`

Expected: zero failed test files/tests.

- [ ] **Step 2: TypeScript**

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 3: Production build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 4: Cloudflare dry run**

Run: `npm run build:cloudflare`

Expected: exit code 0 and Wrangler dry-run success.

- [ ] **Step 5: Canonical data validation**

Run: `npm run validate:data`

Expected: exit code 0.

- [ ] **Step 6: Full E2E**

Run: `npm run test:e2e`

Expected: zero failed Playwright tests.

- [ ] **Step 7: Map all 24 Spec acceptance criteria to evidence**

PR body must map each criterion to a unit/component test, E2E result, or live catalog/security verification. Runtime criteria require runtime evidence, not code inspection alone.

- [ ] **Step 8: Diff/security review**

Confirm no automatic provider calls, no reliability logic moved into `AroundMyDormApp.tsx`, no generic canonical JSON editor, no public audit/admin-sensitive leakage, no field verify mutation of whole-place status, strict five-domain allowlist, append-only latest-event rollback.

- [ ] **Step 9: Open PR only on exact verified head SHA**

Title: `Phase 4 data reliability and operations`.

PR body includes summary, migration version, verification outputs, security/catalog evidence, explicit-provider-cost guard, and statement that deployment is separate.

- [ ] **Step 10: Merge only after checks pass and head SHA is unchanged**

Use expected-head-SHA merge protection. Verify `main` points to the merge commit after merge. Do not claim production app deployment until a separate deployment run is verified.

---

## Spec-to-Task Coverage

- Derived reliability model, priority, revisions, dedupe, reset: Task 1.
- Persist only operational state: Task 2.
- Canonical transactional verification, strict allowlist, provenance/timestamps, atomic report transition, audit, rollback: Task 3.
- Admin workspace/controller, queue filters/search/severity, canonical refresh orchestration: Task 4.
- Typed Quick Verify, verify unchanged, history/rollback UX: Task 5.
- Report verification-first flow + coverage operations + explicit candidate search: Task 6.
- Public last-checked/stale/unknown UI + privacy boundary: Task 7.
- No automatic external-provider activity, TH/EN, mobile safe area, architecture regression: Task 8.
- Production migration + RLS/RPC/catalog/security proof: Task 9.
- Full unit/type/build/Cloudflare/data/E2E acceptance + PR/merge evidence: Task 10.
