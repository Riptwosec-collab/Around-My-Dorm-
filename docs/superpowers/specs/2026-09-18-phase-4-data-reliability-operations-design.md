# Phase 4 — Data Reliability & Operations Design

**Status:** Approved design, pending implementation plan  
**Date:** 2026-09-18  
**Repository:** `Riptwosec-collab/Around-My-Dorm-`  
**Branch:** `feature/phase-4-data-reliability-operations`

## 1. Purpose

Phase 4 turns the existing data-quality diagnostics into an operational reliability system. The application already has field-specific freshness, public reports, coverage diagnostics, field provenance, candidate review, and admin report review. The missing layer is a single workflow that tells an admin what to verify next, permits safe canonical verification, records an append-only audit trail, and exposes a small amount of freshness context to public users.

The primary objective is to make the stored place database more trustworthy without introducing automatic external-provider activity or a second source of truth.

## 2. Non-goals

Phase 4 does **not**:

- introduce machine-learning ranking for maintenance priority;
- auto-call Google Places, Routes, Parking, Photo, Geocoding, or other paid/external providers;
- auto-import candidate places;
- auto-change canonical place data from public reports;
- auto-resolve or auto-reject public reports;
- create a second canonical place table;
- expose admin priority scores, audit history, reporter identity, fingerprints, or reviewer metadata to public users;
- add a generic JSON editor for place records;
- replace the existing Phase 2 candidate review workflow;
- replace the existing Phase 3 field freshness rules.

External lookups remain explicit admin actions.

## 3. Existing foundations

Phase 4 reuses the following existing capabilities:

- `lib/place-freshness.ts` and `lib/data-quality.ts` for field-specific freshness;
- `fieldProvenance` and verification timestamps on `Place`;
- `lib/field-provenance.ts`, where `manual_verified` has the highest provenance priority;
- `PlaceReportAdminQueue` and the Phase 3 report RPCs;
- `CoverageDashboard` and stored-data-only coverage analysis;
- Phase 2 candidate review and explicit admin discovery;
- canonical runtime records read from `public.amd_places.record`;
- public report warning aggregation from Phase 3.

The current `applyLocalPlacePatch()` flow is **not** the Phase 4 canonical write path. It writes user-specific `amd_place_overrides`, while Phase 4 verification must update the shared canonical record seen by all users.

## 4. Architecture decision

### 4.1 Selected approach: Hybrid reliability model

Freshness, coverage, and priority are derived from current canonical data and reports. The database persists only state that must survive recomputation, such as snooze/in-review state and verification audit events.

This avoids duplicating moving truth such as `fresh`, `aging`, or `stale` in a queue table.

```text
amd_places.record
      │
      ├── Freshness Engine ──────┐
      ├── Public Reports ────────┤
      ├── Coverage Gaps ─────────┤
      │                          ▼
      │                 Reliability Priority Engine
      │                          │
      │                    Admin Work Queue
      │                          │
      │                    Quick Verify UI
      │                          │
      ▼                          ▼
Canonical Place ◄── Admin Verification RPC
      │
      ├── field verification timestamp
      ├── fieldProvenance
      ├── lastChecked / lastUpdated / lastVerified as applicable
      └── append-only verification audit event
```

### 4.2 Canonical source of truth

Production canonical place data for this project is `public.amd_places`, with the application reading the `record` JSON document. Phase 4 migrations and RPCs must target `public.amd_places`, not the older `public.places` table shown in legacy schema material.

Before applying the migration, implementation must inspect the live production catalog and verify the actual column names and constraints of `public.amd_places`.

### 4.3 No persisted moving freshness state

Statuses such as `fresh`, `aging`, `stale`, and `unknown` must be computed from verification timestamps at read time. They must not be materialized as durable task status because they change as time passes.

## 5. Reliability Work Queue

### 5.1 Task model

A reliability task represents a place-field issue, not a copy of a place.

Conceptual shape:

```ts
type ReliabilityTask = {
  id: string;
  placeId: string;
  field: ReliabilityField | "coverage";
  reasons: ReliabilityReason[];
  priority: number;
  severity: "critical" | "high" | "normal" | "low";
  reportIds: string[];
  freshnessStatus: "fresh" | "aging" | "stale" | "unknown" | null;
  coverageGapId: string | null;
  suggestedAction: "verify" | "review_report" | "review_existing" | "search_candidates";
  scoreBreakdown: ReliabilityScorePart[];
};
```

`id` must be deterministic for derived tasks, for example `placeId:field`, so operational state can attach to the task without persisting the derived task itself.

### 5.2 Supported reliability fields

Phase 4 V1 supports:

- `openingHours`
- `price`
- `phone`
- `parking`
- `location`

`location` covers coordinates and address as one verification workflow in V1.

### 5.3 Task sources

Tasks are derived from:

1. field freshness (`aging`, `stale`, `unknown`);
2. unresolved public reports (`pending`, `reviewed`);
3. coverage gaps from stored canonical data;
4. place importance modifiers such as `recommended` and `localFavorite`.

Multiple signals for the same `placeId + field` combine into one task with a score breakdown.

## 6. Priority Engine

Priority is deterministic, capped at 100, and explainable.

### 6.1 Base score rules

| Signal | Score |
| --- | ---: |
| Public report `pending` | +35 |
| Public report `reviewed` | +25 |
| Field `stale` | +25 |
| Field `unknown` | +20 |
| Field `aging` | +10 |
| Place is `recommended` or `localFavorite` | +10 |
| Critical decision field: opening hours or location | +10 |
| Price or parking field | +7 |
| Phone field | +4 |
| High-severity coverage gap | +10 |
| Multiple independent issues on the same place | +5 to +15 |

The multi-issue bonus is calculated as +5 for two active issue categories, +10 for three, and +15 for four or more. A single report plus stale freshness for the same field is not counted as two issue categories for this bonus; the bonus is meant to reflect breadth across distinct maintenance concerns.

### 6.2 Severity bands

- `critical`: 75–100
- `high`: 50–74
- `normal`: 25–49
- `low`: 0–24

These are admin operational labels only. They must not modify the place's public `verified` or `dataStatus` values automatically.

### 6.3 Sort order

Default ordering:

1. priority descending;
2. tasks with unresolved public reports first;
3. oldest relevant verification timestamp first;
4. shortest straight-line distance from the verified Baan Supha home origin, if available;
5. stable place-name tie-breaker.

Straight-line distance is only a tie-breaker. It is not a walking or driving ETA and must not trigger Routes API usage.

## 7. Persistent operational state

Only state that cannot be re-derived is stored.

Proposed table:

```text
public.amd_reliability_task_state
- task_key text primary key
- place_id text not null
- field_name text not null
- status text not null
- snoozed_until timestamptz null
- assigned_to uuid null
- last_opened_at timestamptz null
- note text null
- updated_at timestamptz not null default now()
```

Allowed `status` values:

- `open`
- `in_review`
- `snoozed`
- `done`

A derived task that becomes healthy disappears from the queue regardless of a stored `done` value. Operational state must never force an otherwise healthy field to remain visible.

If a task reappears later because the field becomes stale again, stale operational state must not suppress it indefinitely. The implementation plan must define a deterministic reset rule, recommended as: a verification event newer than the operational state's `updated_at` invalidates `done` and prior snooze state for future stale cycles.

## 8. Quick Verify UI

### 8.1 Entry points

Quick Verify can open from:

- Reliability Work Queue;
- Public Report Admin Queue;
- Coverage Dashboard's `Review existing` action;
- verification history for a place.

### 8.2 Quick Verify sheet content

The sheet shows:

- place name and field being reviewed;
- current canonical value;
- freshness status;
- last field verification timestamp;
- current provenance source and confidence;
- unresolved public reports related to that field;
- source/reference URL where available;
- editable field controls;
- `Verify unchanged`;
- `Update and verify`;
- `Snooze`;
- explicit external-source buttons such as Google Maps or official source, where a URL is already known.

No provider request runs merely because the sheet opens.

### 8.3 Field-specific editors

V1 uses typed editors, not raw JSON:

- opening hours: existing structured/opening-hours editor;
- price: range/fixed/unit fields mapped to the existing pricing model;
- phone: normalized text input;
- parking: typed parking availability/details editor;
- location: address + latitude + longitude, with validation.

## 9. Canonical verification transaction

### 9.1 RPC

Proposed RPC:

```text
public.amd_admin_verify_place_field(...)
```

Conceptual input:

```text
p_place_id text
p_field_name text
p_new_value jsonb null
p_verify_unchanged boolean
p_source text
p_source_url text null
p_note text null
p_linked_report_ids uuid[] null
p_report_outcome text null
```

`p_report_outcome` is restricted to `resolved`, `rejected`, or null.

### 9.2 Server-side field allowlist

Only the V1 fields are accepted. The RPC must reject unknown field names before any mutation.

### 9.3 Transaction behavior

The RPC performs, in one database transaction:

1. authenticate and authorize a non-anonymous Around My Dorm admin;
2. lock the target `amd_places` row;
3. load the current canonical `record`;
4. validate the field-specific incoming value or verify-unchanged request;
5. snapshot the prior field value and relevant provenance/timestamps;
6. update the canonical record if value changes;
7. update the field-specific verification timestamp;
8. update `fieldProvenance[field]`;
9. update `lastChecked` and `lastUpdated` as appropriate;
10. update `lastVerified` only according to the explicit whole-place rule in section 9.6;
11. write an append-only verification audit event;
12. transition linked reports only if requested and valid;
13. commit.

Any failure rolls back the entire operation, including report transition.

### 9.4 Verification timestamp mapping

| Reliability field | Place timestamp |
| --- | --- |
| `openingHours` | `openingHoursVerifiedAt` |
| `price` | `priceVerifiedAt` |
| `phone` | `phoneVerifiedAt` |
| `parking` | `parkingVerifiedAt` |
| `location` | `locationVerifiedAt` |

### 9.5 Provenance rules

Quick Verify writes either:

- `manual_verified` when an admin verifies manually or from a source that does not qualify as official;
- `official` only when the admin explicitly identifies an official source.

The server must not infer `official` merely because a `source_url` is present.

The updated provenance entry contains `checkedAt`, `verifiedAt`, confidence, and source metadata consistent with the existing `FieldProvenanceEntry` shape.

### 9.6 Whole-place `verified` and `lastVerified`

Field verification must **not** automatically mark the whole place `verified=true` after a single field is checked.

For Phase 4 V1:

- the field-specific timestamp and provenance are always updated after successful verification;
- `lastChecked` is updated;
- `lastUpdated` is updated when canonical record content or verification metadata changes;
- `lastVerified` changes only if the existing place already represents a whole-place verified record or a separate future whole-place verification action is added;
- `verified` is not promoted from false to true by a single-field Quick Verify.

This prevents a phone-number check from incorrectly certifying every field in the place.

### 9.7 Verify unchanged

`Verify unchanged` updates the field verification timestamp, provenance, audit event, and maintenance timestamps without requiring a value change.

Audit action: `verified_unchanged`.

## 10. Verification audit log

Proposed table:

```text
public.amd_place_verification_events
- id uuid primary key
- place_id text not null
- field_name text not null
- action text not null
- before_value jsonb
- after_value jsonb
- before_metadata jsonb
- after_metadata jsonb
- source text not null
- source_url text null
- note text null
- linked_report_ids uuid[] not null default '{}'
- verified_by uuid not null
- created_at timestamptz not null default now()
- rollback_of uuid null
```

Allowed `action` values:

- `verified_unchanged`
- `updated_and_verified`
- `rollback`

Audit rows are append-only to application clients. There is no public read policy and no normal delete/update operation exposed to the app.

## 11. Rollback

Proposed RPC:

```text
public.amd_admin_rollback_place_verification(p_event_id uuid, p_note text null)
```

Rollback:

1. authorizes admin;
2. locks the target canonical place;
3. verifies the source event is rollback-eligible;
4. restores the prior field value and relevant field metadata from the audit snapshot;
5. writes a new `rollback` event pointing to the original event;
6. leaves the original event intact;
7. does not automatically reopen or alter public reports.

### 11.1 Rollback eligibility

To avoid overwriting newer work, V1 permits rollback only when the target event is still the latest verification event for that `place_id + field_name`, excluding the rollback being created. If newer verification exists, the RPC rejects the rollback and the admin must perform a new explicit Quick Verify instead.

## 12. Public report workflow integration

### 12.1 Correct report

```text
pending report
→ admin accepts review
→ Quick Verify canonical data
→ verification transaction succeeds
→ report becomes resolved in the same transaction
```

### 12.2 Incorrect report

```text
pending/reviewed report
→ admin verifies current canonical value is correct
→ `verified_unchanged`
→ report becomes rejected in the same transaction
```

### 12.3 No blind resolution in reliability flow

Quick Verify never offers a report-only `Resolve` action. A report linked to Quick Verify can only be resolved/rejected through a successful verification transaction.

The existing report admin queue may retain legacy status controls temporarily during implementation, but Phase 4 acceptance requires report-driven reliability tasks to use the verification-first path. The implementation plan should either redirect those controls into Quick Verify or clearly separate legacy report administration from the new verified-resolution flow.

## 13. Coverage Operations

Coverage analysis remains stored-data-only and does not call an external provider.

Each coverage gap exposes two distinct actions:

### 13.1 Review existing

- no external API request;
- opens a filtered Reliability Work Queue for existing canonical places contributing to the gap.

### 13.2 Search candidates

- requires an explicit admin click;
- uses the existing admin candidate/discovery workflow;
- does not auto-import;
- discovered candidates remain staged until reviewed and published through the existing candidate process.

Coverage distinguishes:

- **quality gap**: existing places lack reliable data;
- **discovery gap**: the area/category may need additional candidate places.

## 14. Public freshness UI

### 14.1 Placement

Place Detail shows a compact freshness summary near Decision Intelligence.

### 14.2 Display rules

- all relevant fields fresh: show only `Last checked …` / `ตรวจล่าสุด…`;
- any aging field: add a neutral `Some information should be checked again soon` message;
- any stale field: add `Some information may be outdated`;
- any unknown field: add `Verification date is unavailable for some information`;
- unresolved public-report warning remains above the freshness summary.

The public UI does not show admin priority scores or maintenance workflow state.

### 14.3 Fields included

The compact public summary uses the same V1 fields as Quick Verify: opening hours, price, phone, parking, and location.

It reuses the existing Phase 3 freshness thresholds without introducing a second threshold set.

## 15. Admin dashboard composition

`DataQualityDashboard` remains a composition shell rather than absorbing Phase 4 logic.

Target structure:

```text
DataQualityDashboard
 ├─ ReliabilitySummary
 ├─ ReliabilityWorkQueue
 ├─ CoverageDashboard
 ├─ PlaceReportAdminQueue
 └─ ReviewQueuePanel
```

New UI modules should be isolated, for example:

```text
components/ReliabilitySummary.tsx
components/ReliabilityWorkQueue.tsx
components/PlaceQuickVerifySheet.tsx
components/VerificationHistoryPanel.tsx
components/PublicFreshnessSummary.tsx
```

Core logic should live outside components, for example:

```text
lib/reliability/priority.ts
lib/reliability/tasks.ts
lib/reliability/types.ts
lib/cloud/place-verification.ts
```

`AroundMyDormApp.tsx` must not absorb Phase 4 scoring, verification, or queue logic.

## 16. Security model

### 16.1 Canonical write authorization

Phase 4 privileged RPCs must require:

- authenticated session;
- `app_metadata.amd_admin = true`;
- `is_anonymous = false`.

Because production compatibility issues were previously found around a helper function dependency, Phase 4 privileged RPCs should use the direct JWT-claim authorization pattern already proven in the Phase 3 report migration unless the implementation first verifies an equivalent helper exists and is correct in the live production database.

No email-based fallback is introduced by Phase 4.

### 16.2 RPC permissions

- revoke execution from `public` and `anon`;
- grant only to `authenticated` and service role where required;
- every SECURITY DEFINER RPC performs its own admin authorization check;
- use a restricted `search_path`;
- validate every field and enum server-side;
- never trust client-provided reviewer identity.

### 16.3 Table access

`amd_reliability_task_state` and `amd_place_verification_events` are admin-only operational data.

Public users must not read them directly.

### 16.4 Public data boundary

Public freshness UI derives only from canonical place fields already intended for public browsing. It does not expose report notes, reporter fingerprints, report reviewer identity, audit notes, assignment state, or verification actor identity.

## 17. Error handling

### 17.1 Queue failures

If report or operational-state loading fails, freshness-derived tasks still render when possible and the admin UI shows a scoped warning. One unavailable subsystem should not erase all local reliability diagnostics.

### 17.2 Verification failure

On RPC failure:

- no optimistic canonical success message;
- no report status transition;
- Quick Verify retains unsaved edits;
- admin sees a clear retryable error where appropriate.

### 17.3 External lookup failure

Any explicit external lookup failure leaves canonical data untouched and offers retry/fallback navigation only. No estimated or fabricated value is substituted.

## 18. Google/API cost guard

Phase 4 preserves the existing explicit-action policy:

| User/admin action | External provider request |
| --- | ---: |
| Open Data Quality Dashboard | 0 |
| Open Reliability Queue | 0 |
| Open Quick Verify | 0 |
| Change queue filters | 0 |
| Open Place Detail | 0 from Phase 4 |
| Coverage `Review existing` | 0 |
| Verify unchanged | 0 external provider requests |
| Update and verify using already-known/manual data | 0 external provider requests |
| Explicit `Search candidates` | provider request allowed |
| Explicit external source lookup | provider request allowed |

No background prefetch is introduced.

## 19. Localization and mobile behavior

All Phase 4 UI supports Thai and English.

Required mobile behavior:

- queue cards remain usable at phone widths;
- Quick Verify uses existing modal/sheet safe-area conventions;
- primary actions remain reachable above bottom navigation/home indicator;
- long report/source text wraps and scrolls without covering controls;
- no fixed footer hides editable form content.

## 20. Testing strategy

Implementation follows TDD for each behavior change.

### 20.1 Unit tests

Cover at minimum:

- priority scoring and cap at 100;
- score breakdown explanations;
- multi-issue bonus deduplication;
- deterministic task IDs;
- field freshness-to-task mapping;
- report-to-field task mapping;
- operational state merge and reset rules;
- coverage quality/discovery distinction;
- public freshness display states;
- typed Quick Verify payload construction;
- no automatic external-provider calls.

### 20.2 Database/schema tests

Assert:

- tables and constraints exist;
- canonical target is `amd_places`;
- strict field allowlist exists in verification RPC;
- direct admin JWT authorization is present;
- anon execution is revoked;
- anonymous authenticated sessions are rejected;
- audit events are append-only from application roles;
- report transition occurs only after successful verification logic;
- rollback latest-event guard exists.

### 20.3 Integration/UI tests

Cover:

- stale task disappears after verification;
- verify unchanged updates freshness without changing field value;
- update-and-verify refreshes the visible canonical data;
- correct report → verify → resolved;
- incorrect report → verify unchanged → rejected;
- failed verification leaves report unresolved;
- coverage `Review existing` filters local queue with zero provider calls;
- public users cannot see admin score/audit data;
- TH/EN rendering;
- mobile safe-area behavior.

### 20.4 Full verification gate

Before merge:

- unit tests;
- TypeScript typecheck;
- production build;
- Cloudflare Workers dry-run validation;
- canonical data validation;
- mobile Playwright E2E;
- migration applied successfully to the live Supabase project;
- fresh production catalog inspection confirms tables, RLS/policies, grants, RPC definitions, and canonical target.

No completion claim is made without fresh evidence from the final head commit.

## 21. Migration and rollout order

Recommended rollout:

1. implement pure Reliability Priority Engine and task derivation;
2. add queue UI with no writes;
3. add Supabase reliability state + audit schema and privileged RPCs;
4. test migration against actual production schema assumptions;
5. apply migration and inspect live catalog;
6. wire Quick Verify canonical writes;
7. integrate report verification-first flow;
8. add Coverage Operations actions;
9. add public freshness summary;
10. run full verification and review all acceptance criteria;
11. merge only after all gates pass;
12. deploy separately and perform production smoke tests.

## 22. Acceptance criteria

Phase 4 is complete only when all criteria below are satisfied:

1. Reliability Queue combines `stale`, `aging`, `unknown`, unresolved public reports, and coverage gaps from real canonical data.
2. Priority score is deterministic, capped at 100, and exposes an explainable score breakdown.
3. Queue filters by severity, field, report involvement, and place-name search.
4. A derived stale task disappears after its field is verified fresh.
5. Snooze/in-review operational state persists without duplicating canonical place truth.
6. Quick Verify supports opening hours, price, phone, parking, and location/address.
7. Admin can verify an unchanged value without modifying the field value.
8. Shared canonical data mutation uses an admin-only transactional RPC targeting live `amd_places`.
9. Successful verification updates the field timestamp, provenance, maintenance timestamps, and an audit event in one transaction.
10. Public reports cannot automatically mutate canonical data.
11. A report is resolved through the reliability flow only after successful canonical verification.
12. An incorrect report supports `verify unchanged → rejected` atomically.
13. Verification audit history is append-only from application roles, and rollback creates a new event.
14. Rollback restores the prior value only when the source event is still the latest event for that field and never deletes history.
15. Public Place Detail shows last-checked/freshness context and neutral stale/unknown warnings from the existing Phase 3 thresholds.
16. Public UI exposes neither admin priority scores nor sensitive audit/report operational data.
17. Coverage `Review existing` opens a relevant Reliability Queue view without any external API call.
18. Coverage candidate discovery occurs only after explicit admin action and uses the existing staged candidate workflow.
19. Opening Dashboard, Queue, Quick Verify, or Place Detail causes no new automatic Google Places/Routes/Parking/Photo request from Phase 4.
20. Phase 4 UI is complete in Thai and English.
21. Mobile layout and safe-area behavior pass E2E coverage.
22. Unit tests, typecheck, production build, Cloudflare dry-run, canonical data validation, and mobile E2E all pass on the final implementation head.
23. Supabase verification demonstrates that anon and anonymous authenticated users cannot mutate canonical data or access admin reliability/audit state.
24. The migration succeeds against the real production schema and fresh post-migration catalog inspection confirms the expected security and RPC definitions before merge/deploy.

## 23. Success condition

Phase 4 succeeds when reliability work is actionable rather than merely visible: an admin can identify the highest-value stale or reported field, verify it safely, update the shared canonical record, close the related report only after verification, audit or roll back the change, and give public users concise freshness context — all while preserving the project's zero-automatic-external-request rule.