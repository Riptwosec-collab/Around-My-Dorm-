# Phase 3 Public Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current localStorage demo report flow with a Supabase-backed public report workflow that is rate-limited, duplicate-protected, private to admins, auditable, and able to expose only safe unresolved-warning summaries to public Place Detail.

**Architecture:** Public submission goes through one validated RPC; public warning lookup goes through a separate aggregate-only RPC; admin reads/transitions remain RLS/admin protected. `ReportPlaceSheet` becomes a thin UI client and `lib/cloud/place-reports.ts` owns typed cloud calls.

**Tech Stack:** Supabase Postgres/RLS/RPC, `@supabase/supabase-js`, React, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-phase-3-decision-intelligence-design.md`

## Global Constraints

- Public reports never update canonical place data directly.
- Report type enum: `closed`, `opening_hours`, `price`, `moved`, `parking`, `phone`, `location`, `other`.
- Message max length: 500 characters.
- Same reporter + place + type: one accepted report per 24h.
- Reporter max: 5 reports / 10 minutes and 20 / 24 hours.
- Public users cannot read the report queue, reporter identity, free-text notes, or audit fields.
- Public warning lookup may expose only unresolved report type/count for one place.
- Admin status flow: `pending` -> `reviewed` -> `resolved` or `rejected`; `reviewed` means actively under review.
- Reviewer/audit fields are server controlled.

---

### Task 1: Create report schema, RLS, and RPCs

**Files:**
- Create: `supabase/place-reports.sql`
- Test: `tests/place-reports-schema.test.ts`

**Interfaces:**
- DB table: `public.amd_place_reports`.
- RPC: `public.amd_submit_place_report(p_place_id text, p_report_type text, p_message text, p_reporter_fingerprint text)`.
- RPC: `public.amd_place_report_warning(p_place_id text)` returning only `report_type` and unresolved `report_count`.
- RPC: `public.amd_admin_transition_place_report(p_report_id uuid, p_status text, p_resolution_note text default null)`.

- [ ] **Step 1: Write failing schema contract test**

Assert SQL declares the table, status/report checks, RLS, submit RPC, aggregate-only warning RPC, admin transition RPC, and no public table SELECT/INSERT policy.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/place-reports-schema.test.ts`
Expected: FAIL because `supabase/place-reports.sql` does not exist.

- [ ] **Step 3: Write table and submission controls**

```sql
create table if not exists public.amd_place_reports (
  id uuid primary key default gen_random_uuid(),
  place_id text not null,
  report_type text not null check (report_type in ('closed','opening_hours','price','moved','parking','phone','location','other')),
  message text null check (char_length(coalesce(message, '')) <= 500),
  status text not null default 'pending' check (status in ('pending','reviewed','resolved','rejected')),
  reporter_fingerprint text not null,
  duplicate_count integer not null default 0,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  resolved_at timestamptz null,
  reviewed_by uuid null,
  resolution_note text null
);
```

The submit RPC must validate `place_id`, enforce both rate windows and the 24h duplicate rule transactionally, and return `accepted`, `duplicate`, or `rate_limited`. Do not grant direct public insert/select.

- [ ] **Step 4: Implement safe public warning RPC**

`amd_place_report_warning` must only return unresolved (`pending`/`reviewed`) grouped report type/count for the requested place. It must never return `message`, `reporter_fingerprint`, reviewer identity, timestamps beyond what is necessary, or reports for other places.

- [ ] **Step 5: Implement admin transition RPC**

Derive `reviewed_by = auth.uid()` and timestamps server-side. Require `app_metadata.amd_admin = true` using the current admin authorization pattern.

- [ ] **Step 6: Run GREEN and commit**

Run: `npm test -- tests/place-reports-schema.test.ts`
Expected: PASS.

```bash
git add supabase/place-reports.sql tests/place-reports-schema.test.ts
git commit -m "feat: add secure place report schema"
```

### Task 2: Add typed report cloud client

**Files:**
- Create: `lib/cloud/place-reports.ts`
- Test: `tests/place-reports-cloud.test.ts`

**Interfaces:**
- Produces: `type PlaceReportType = "closed" | "opening_hours" | "price" | "moved" | "parking" | "phone" | "location" | "other"`.
- Produces: `submitPlaceReport(input): Promise<{ status: "accepted" | "duplicate" | "rate_limited"; reportId?: string }>`.
- Produces: `loadPlaceReportWarnings(placeId: string): Promise<Array<{ reportType: PlaceReportType; reportCount: number }>>`.
- Produces admin-only `loadPlaceReports()` and `transitionPlaceReport()`.

- [ ] **Step 1: Write failing mocked cloud tests**

Assert public submit calls `amd_submit_place_report`, warning lookup calls only `amd_place_report_warning`, no public code path selects `amd_place_reports` directly, and admin transition calls only the admin RPC.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/place-reports-cloud.test.ts`
Expected: FAIL because module is missing.

- [ ] **Step 3: Implement reporting-only anonymous fingerprint**

Create a reporting-specific browser token, hash it with Web Crypto SHA-256 before sending, never expose the raw token to admin UI, and do not reuse it for personalization. Tests may inject a deterministic fingerprint helper.

- [ ] **Step 4: Implement typed RPC wrappers**

Normalize Supabase RPC payloads to the interfaces above; throw retryable errors for network/backend failures rather than pretending submission succeeded.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- tests/place-reports-cloud.test.ts`
Expected: PASS.

```bash
git add lib/cloud/place-reports.ts tests/place-reports-cloud.test.ts
git commit -m "feat: add place report cloud client"
```

### Task 3: Replace localStorage report sheet

**Files:**
- Modify: `components/ReportPlaceSheet.tsx`
- Test: `tests/report-place-sheet.test.tsx`

**Interfaces:**
- Consumes: `submitPlaceReport()`.

- [ ] **Step 1: Write failing UI tests**

Cover valid submit, max-500 note, duplicate response, rate-limit response, retryable error preserving text, and TH/EN labels. Assert source no longer references `localStorage` or `around-dorm-place-reports-v1`.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/report-place-sheet.test.tsx`
Expected: FAIL against current local demo.

- [ ] **Step 3: Implement enum-backed async states**

Use stable enum values internally and localized labels externally. Apply client cooldown only after `accepted` or `duplicate`.

- [ ] **Step 4: Run GREEN and commit**

Run: `npm test -- tests/report-place-sheet.test.tsx`
Expected: PASS.

```bash
git add components/ReportPlaceSheet.tsx tests/report-place-sheet.test.tsx
git commit -m "feat: connect public reports to Supabase"
```

### Task 4: Add admin report queue and safe pending warnings

**Files:**
- Create: `components/PlaceReportAdminQueue.tsx`
- Modify: `components/DataQualityDashboard.tsx`
- Modify: `components/PlaceDetail.tsx`
- Test: `tests/place-report-admin.test.tsx`

**Interfaces:**
- Admin queue consumes `loadPlaceReports()` / `transitionPlaceReport()`.
- Place Detail consumes `loadPlaceReportWarnings(place.id)` only.

- [ ] **Step 1: Write failing tests**

Cover pending/reviewing/resolved/rejected counts, admin transitions, audit-safe UI, and neutral public wording such as `มีรายงานว่าข้อมูลเวลาเปิดอาจไม่ถูกต้อง • กำลังตรวจสอบ` / `Opening information has been reported as possibly incorrect • under review`.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/place-report-admin.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement admin queue**

Show place, report type, note, created time, current canonical value/freshness, and duplicate count only to authorized admin UI. `mark resolved` changes report status only after actual data correction/verification.

- [ ] **Step 4: Implement public warning display**

Place Detail fetches only safe aggregate warning data for its own `place.id`; it must never fetch/list the admin report table.

- [ ] **Step 5: Verify and commit**

Run: `npm test -- tests/place-report-admin.test.tsx tests/report-place-sheet.test.tsx && npm run typecheck`
Expected: PASS.

```bash
git add components/PlaceReportAdminQueue.tsx components/DataQualityDashboard.tsx components/PlaceDetail.tsx tests/place-report-admin.test.tsx
git commit -m "feat: add admin place report review queue"
```
