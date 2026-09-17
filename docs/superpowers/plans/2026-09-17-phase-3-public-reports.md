# Phase 3 Public Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current localStorage demo report flow with a Supabase-backed public report workflow that is rate-limited, duplicate-protected, private to admins, and auditable.

**Architecture:** Keep public submission behind one Supabase RPC and admin reads/transitions behind RLS-protected cloud functions. The existing `ReportPlaceSheet` becomes a thin UI client; a new report cloud module owns RPC calls and typed results; a dedicated admin panel is mounted inside existing data-management/admin surfaces.

**Tech Stack:** Supabase Postgres/RLS/RPC, `@supabase/supabase-js`, React, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-phase-3-decision-intelligence-design.md`

## Global Constraints

- Public reports never update canonical place data directly.
- Report type enum: `closed`, `opening_hours`, `price`, `moved`, `parking`, `phone`, `location`, `other`.
- Message max length: 500 characters.
- Same reporter + place + type: one accepted report per 24h.
- Reporter max: 5 reports / 10 minutes and 20 / 24 hours.
- Public users cannot read the report queue.
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
- RPC: `public.amd_admin_transition_place_report(p_report_id uuid, p_status text, p_resolution_note text default null)`.

- [ ] **Step 1: Write failing schema contract test**

Read `supabase/place-reports.sql` in the test and assert it declares the table, valid status/report checks, RLS, public submit RPC, admin transition RPC, and no public select policy.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/place-reports-schema.test.ts`
Expected: FAIL because the SQL file is missing.

- [ ] **Step 3: Write the SQL**

Core table shape:

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

The submit RPC must validate `place_id` exists in canonical data, enforce both rate windows and the 24h duplicate rule transactionally, and return a small typed status (`accepted`, `duplicate`, `rate_limited`). Do not grant direct public insert/select.

Admin transition must derive `reviewed_by = auth.uid()` and set timestamps based on target state. Require `app_metadata.amd_admin = true` using the project’s current admin authorization pattern.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- tests/place-reports-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

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
- Produces admin-only `loadPlaceReports()` and `transitionPlaceReport()`.

- [ ] **Step 1: Write failing unit tests with mocked Supabase RPC/from calls**

Assert public submit calls `amd_submit_place_report`; no code path inserts directly into `amd_place_reports`; admin transition calls only the transition RPC.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/place-reports-cloud.test.ts`
Expected: FAIL because module is missing.

- [ ] **Step 3: Implement cloud module**

Generate the reporter identity from a reporting-specific browser token, hash it with Web Crypto SHA-256 before sending, and never expose the raw token to admin UI. In tests, allow a deterministic injected fingerprint helper.

- [ ] **Step 4: Run GREEN and commit**

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

Test valid submit, optional message max 500, duplicate message, rate-limit message, retryable error, and TH/EN labels. Assert source no longer references `localStorage` or `around-dorm-place-reports-v1`.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/report-place-sheet.test.tsx`
Expected: FAIL against current local demo.

- [ ] **Step 3: Implement async states**

Use stable enum values internally and localized labels externally. Preserve entered note on network error. Apply client cooldown only after accepted/duplicate response.

- [ ] **Step 4: Run GREEN and commit**

Run: `npm test -- tests/report-place-sheet.test.tsx`
Expected: PASS.

```bash
git add components/ReportPlaceSheet.tsx tests/report-place-sheet.test.tsx
git commit -m "feat: connect public reports to Supabase"
```

### Task 4: Add admin report queue and pending warnings

**Files:**
- Create: `components/PlaceReportAdminQueue.tsx`
- Modify: `components/DataQualityDashboard.tsx`
- Modify: `components/PlaceDetail.tsx`
- Test: `tests/place-report-admin.test.tsx`

**Interfaces:**
- Admin queue consumes `loadPlaceReports()` / `transitionPlaceReport()`.
- Place Detail may consume a minimal count/status lookup that exposes only whether an unresolved report exists for the current place/field; it must not expose reporter identity/message publicly.

- [ ] **Step 1: Write failing tests**

Cover pending/reviewing/resolved/rejected counts, status transitions, audit-safe UI, and neutral public wording `กำลังตรวจสอบ`/`under review`.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/place-report-admin.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement queue and warning boundary**

Keep canonical editing separate: `mark resolved` only changes report status after an admin has corrected/verified the real place data.

- [ ] **Step 4: Verify**

Run: `npm test -- tests/place-report-admin.test.tsx tests/report-place-sheet.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/PlaceReportAdminQueue.tsx components/DataQualityDashboard.tsx components/PlaceDetail.tsx tests/place-report-admin.test.tsx
git commit -m "feat: add admin place report review queue"
```
