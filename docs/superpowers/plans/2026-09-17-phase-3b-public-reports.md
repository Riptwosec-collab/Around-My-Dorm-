# Phase 3B Public Reports + Admin Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add anonymous public data-error reports with duplicate/rate-limit protection and a secure admin review queue that never edits canonical place data automatically.

**Architecture:** Put anti-spam and workflow authority in Supabase SQL/RPC/RLS, expose a small client wrapper in `lib/`, and keep public/report-admin UIs separate. Public clients submit through RPC and cannot read the queue; admin access reuses the existing `app_metadata.amd_admin=true` authorization convention.

**Tech Stack:** Supabase/Postgres/RLS/RPC, Next.js, React, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-phase-3-decision-intelligence-design.md`

## Global Constraints

- Public reports never modify canonical place rows automatically.
- Public cannot read report rows or mutate workflow status.
- Anonymous reporting does not require account creation.
- Reporter identifiers are opaque and used only for anti-spam/reporting.
- Initial limits: 5 reports/10 minutes, 20/24 hours, same place+type+reporter once/24 hours.
- Report message max length: 500 characters.
- Workflow states: `pending`, `reviewed`, `resolved`, `rejected`; `reviewed` means actively under review.

---

## File Structure

- Create `supabase/place-reports.sql` — table, constraints, indexes, RLS, submit RPC, admin transition RPC or policies.
- Create `lib/place-reports.ts` — types, anonymous reporter token/fingerprint handling, RPC wrappers.
- Create `components/PlaceReportSheet.tsx` — public report bottom sheet.
- Create `components/AdminPlaceReports.tsx` — queue, filters, actions, audit display.
- Modify the current Place Detail component to add `รายงานข้อมูลผิด` / EN equivalent.
- Modify the existing admin surface (`DataManagement.tsx` or appropriate admin hub) to mount `AdminPlaceReports`.
- Modify `components/DataQualityDashboard.tsx` to include pending report count.
- Add tests: `tests/place-reports-client.test.ts`, `tests/place-reports-schema.test.ts`, `tests/place-report-ui.test.ts`, `tests/admin-place-reports.test.ts`.

### Task 1: Report schema and RPC contract

**Interfaces:**
- SQL enum/check values: report types `closed|opening_hours|price|moved|parking|phone|location|other`; statuses `pending|reviewed|resolved|rejected`.
- RPC `amd_submit_place_report(p_place_id text, p_report_type text, p_message text, p_reporter_fingerprint text)` returns structured outcome such as `accepted|duplicate|rate_limited` plus report id when accepted.
- Admin transition interface records reviewer and timestamps server-side.

- [ ] **Step 1: Write failing schema contract tests** that read `supabase/place-reports.sql` and assert table name, report/status constraints, max message validation, RLS enabled, public submit RPC, no public SELECT policy, duplicate/rate-limit logic, and admin-only review mutation.
- [ ] **Step 2: Run RED** using `npm test -- tests/place-reports-schema.test.ts`.
- [ ] **Step 3: Implement `supabase/place-reports.sql`** with UUID id, `place_id`, type, message, status default `pending`, timestamps, `reviewed_by`, resolution note, fingerprint hash text, duplicate grouping/count, indexes for rate-limit queries, and RLS. The submit RPC must validate place/type/message, evaluate 10-minute/24-hour counters and same-place/type 24-hour duplicate window, then insert or return a non-insert outcome.
- [ ] **Step 4: Add admin transition function/policy** that permits only JWTs with `app_metadata.amd_admin=true`, validates legal transitions, and sets audit fields server-side.
- [ ] **Step 5: Run GREEN** and inspect SQL for any broad `anon SELECT/UPDATE/DELETE` grants.
- [ ] **Step 6: Commit** `feat: add secure place reports schema`.

### Task 2: Client report service and anonymous identity

**Interfaces:**
- Produces `type PlaceReportType` matching SQL.
- Produces `submitPlaceReport(input: { placeId: string; type: PlaceReportType; message?: string }): Promise<{ outcome: "accepted"|"duplicate"|"rate_limited"; reportId?: string }>`.
- Produces admin list/update functions using the existing Supabase client/auth pattern.

- [ ] **Step 1: Write failing tests** for stable per-browser report identifier, message trimming/500-char guard, exact RPC payload, duplicate/rate-limit result mapping, and no cross-feature storage key usage.
- [ ] **Step 2: Run RED** with `npm test -- tests/place-reports-client.test.ts`.
- [ ] **Step 3: Implement `lib/place-reports.ts`** using a dedicated local storage key, cryptographically random UUID when available, a one-way digest/transform before RPC if supported in-browser, and no raw identifier exposure to UI.
- [ ] **Step 4: Run GREEN** and `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: add place report client service`.

### Task 3: Public report sheet

**Interfaces:**
- `PlaceReportSheet` consumes `{ place: Place; open: boolean; onClose(): void; locale: "th"|"en" }`.
- Uses `submitPlaceReport()` only after explicit submit.

- [ ] **Step 1: Write failing UI tests** for eight report choices, optional 500-char note, success, duplicate, rate-limit, retry/error, and client cooldown after success.
- [ ] **Step 2: Run RED**.
- [ ] **Step 3: Implement `components/PlaceReportSheet.tsx`** using existing bottom-sheet/safe-area patterns. Keep entered note on transient RPC failure.
- [ ] **Step 4: Add Detail action** without making it the primary CTA. Pending-report public warning must say “reported / under review”, never “confirmed wrong”.
- [ ] **Step 5: Run GREEN**, `npm run typecheck`, and targeted mobile structure tests.
- [ ] **Step 6: Commit** `feat: add public incorrect-data reporting`.

### Task 4: Admin review queue

**Interfaces:**
- Admin list returns reports with place id/name, report type, message, status/timestamps, current canonical value where available, freshness metadata, and duplicate count.
- Transition actions: `takeReview`, `resolve`, `reject`.

- [ ] **Step 1: Write failing admin tests** for pending/reviewed/resolved/rejected filters, admin-only controls, audit metadata, and “resolve does not edit canonical data”.
- [ ] **Step 2: Run RED**.
- [ ] **Step 3: Implement `components/AdminPlaceReports.tsx`** with summary counts, filters, current-value context, open-place action, take-review, resolve, reject + resolution note.
- [ ] **Step 4: Mount queue** into the existing admin management surface; do not create a new public navigation tab.
- [ ] **Step 5: Add pending report metric** to `DataQualityDashboard.tsx`.
- [ ] **Step 6: Run GREEN**, `npm run typecheck`, `npm run build`.
- [ ] **Step 7: Commit** `feat: add admin data report queue`.

### Task 5: Supabase application and Phase 3B verification

- [ ] Apply `supabase/place-reports.sql` to the configured Supabase project using the approved migration workflow; record the migration name/version in the PR notes.
- [ ] Verify anon submission can insert only through the RPC and cannot SELECT the queue.
- [ ] Verify non-admin authenticated user cannot transition reports.
- [ ] Verify admin can review/resolve/reject and audit fields are server-controlled.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, `npm run build:cloudflare`.
- [ ] Commit any fixes as `fix: stabilize Phase 3B reporting`.
