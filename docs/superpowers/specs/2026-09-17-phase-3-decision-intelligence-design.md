# Phase 3 — Decision Intelligence Design

Date: 2026-09-17
Status: Approved design, pending implementation plan
Branch: `feature/phase-3-decision-intelligence`

## Goal

Phase 3 upgrades Around My Dorm from a place directory into a decision-support experience that helps a user answer four practical questions quickly:

1. Is this information still trustworthy?
2. Is the place useful right now?
3. How long will it actually take to get there if I ask for a route?
4. Where can I park nearby if needed?

The phase must improve decision quality without introducing background Google API usage. Google-backed route and parking discovery requests remain explicit user actions.

## Architectural approach

Use a modular upgrade rather than adding more logic to `AroundMyDormApp.tsx` or concentrating the phase inside one detail component.

Phase 3 consists of five independently testable subsystems:

1. Freshness Engine
2. Opening Intelligence UI
3. Public Report + Admin Review workflow
4. On-demand ETA Engine
5. Parking Match + optional Google fallback

Existing `Place` data remains the canonical model. New logic should reuse the current field-level timestamps, provenance, route distance fields, parking fields, API budget controls, and Google request logging wherever possible.

No subsystem in Phase 3 may automatically trigger a Google API request merely because the app loads, a list renders, a place detail opens, or a card enters the viewport.

---

## 1. Freshness Engine

### Purpose

Expose the age and trustworthiness of individual fields without incorrectly marking an entire place stale because one field is old.

### Freshness states

Every supported field resolves to one of:

- `fresh`
- `aging`
- `stale`
- `unknown`

The status is derived at runtime from the most specific verification timestamp available. Do not persist the computed freshness status itself.

### Thresholds

| Field family | Fresh | Aging | Stale |
| --- | --- | --- | --- |
| Opening hours | 0–14 days | 15–30 days | >30 days |
| Price | 0–30 days | 31–60 days | >60 days |
| Parking | 0–30 days | 31–60 days | >60 days |
| Phone/contact | 0–90 days | — | >90 days |
| Location/address | 0–180 days | — | >180 days |
| Images | 0–180 days | — | >180 days |

When a family does not define a separate aging band, values past the fresh threshold become stale.

If no usable timestamp exists, status is `unknown`.

### Timestamp precedence

For a field, use the most specific source available in this order:

1. matching `fieldProvenance` entry
2. field-specific verification timestamp such as `openingHoursVerifiedAt`, `priceVerifiedAt`, `parkingVerifiedAt`, `phoneVerifiedAt`, `locationVerifiedAt`, or `imageVerifiedAt`
3. suitable canonical verification timestamp only when the field genuinely shares that verification event
4. otherwise unknown

Do not substitute unrelated timestamps merely to avoid `unknown`.

### Runtime result shape

A utility such as `getFieldFreshness(place, field)` should return a stable result containing at least:

- `status`
- `ageDays`
- `verifiedAt`
- display label in the requested language or language-neutral data that UI can localize

Example meaning: `fresh`, `8 days`, verified timestamp, label equivalent to “verified 8 days ago”.

### UI behavior

Normal fresh data should not receive a large badge. Aging, stale, and unknown data should be surfaced only where useful.

Examples:

- `ยืนยัน 6 วันที่แล้ว`
- `ข้อมูลเวลาเปิดเริ่มเก่า`
- `ตรวจล่าสุด 74 วันที่แล้ว`
- `ยังไม่เคยยืนยัน`

A stale price must not cause fresh opening-hours data to become stale, and vice versa.

---

## 2. Opening Intelligence

### Existing capability

The existing open-status engine already distinguishes states such as open, closed, open 24 hours, opening soon, closing soon, temporary closure, and permanent closure. Phase 3 reuses that engine rather than replacing it.

### Required presentation

Surface more useful time-to-event information in cards and place details:

- `เปิดอยู่ • ปิด 21:00`
- `ใกล้ปิด • อีก 18 นาที`
- `ใกล้เปิด • อีก 12 นาที`
- `เปิดอีกครั้ง 17:00`

The opening-status engine must continue to handle:

- multiple daily periods
- overnight periods crossing midnight
- 24-hour places
- temporary closure
- permanent closure
- unknown opening data

### Freshness interaction

Opening intelligence and freshness are separate signals.

If a place is calculated as open from locally stored hours but those hours are stale, the UI may still show the calculated status but must also surface a warning such as `เวลาเปิดอาจล้าสมัย`.

A pending public report about opening hours may add a neutral warning such as `มีรายงานว่าข้อมูลเวลาเปิดอาจไม่ถูกต้อง • กำลังตรวจสอบ`, but it must not automatically change the canonical opening-hours data or mark the report as verified fact.

---

## 3. Public Reports and Admin Review

### Public report capability

Anyone may submit a report from Place Detail without signing in.

Supported report types:

- `closed`
- `opening_hours`
- `price`
- `moved`
- `parking`
- `phone`
- `location`
- `other`

Optional free-text detail is limited to 500 characters.

A report never edits the canonical place row automatically.

### Table

Add a Supabase table such as `amd_place_reports` with fields sufficient for:

- report identity
- `place_id`
- `report_type`
- optional message
- workflow status
- created timestamp
- reviewed timestamp
- resolved timestamp
- reviewer identity
- resolution note
- opaque reporter fingerprint
- duplicate grouping/key
- duplicate count or equivalent aggregation metadata

Workflow statuses:

- `pending`
- `reviewed`
- `resolved`
- `rejected`

### Security model

Public/anonymous clients must not receive direct unrestricted write access to the report table.

Public submission goes through a validated RPC/server boundary that:

- validates `place_id`
- validates the report type enum
- enforces the message length
- computes/enforces duplicate protection
- enforces rate limits
- sets server-controlled workflow fields

Public users cannot read other users’ reports.

Only authorized admins may read the review queue and transition workflow status.

Client callers cannot set `reviewed_by`, `reviewed_at`, `resolved_at`, or force a resolved/rejected status during submission.

### Anonymous reporter identity

Public reporting should not require account creation.

Use an opaque client identifier dedicated to anti-spam/reporting and persist only a transformed/hash-safe representation suitable for duplicate and rate-limit checks.

Do not expose the raw identifier in admin UI and do not reuse it for unrelated personalization or cross-feature tracking.

If authenticated reporting is added later, `auth.uid()` may replace the anonymous fingerprint for that reporter.

### Anti-spam policy

Use three layers:

1. client cooldown after a successful submission
2. duplicate protection for the same reporter/place/type within a time window
3. server/RPC rate limits

Initial policy:

- max 5 reports per 10 minutes per reporter identity
- max 20 reports per 24 hours per reporter identity
- same place + report type + reporter identity: max one accepted report per 24 hours

Repeated equivalent submissions should return a friendly “already received” result rather than silently creating unlimited rows.

### Review workflow

Admin queue actions:

- take for review
- open the place record
- mark resolved after the canonical data was actually corrected/verified
- reject with a resolution note

`resolved` means an admin completed the real data correction/verification. The resolve action itself must not silently invent or overwrite canonical place values.

Maintain audit metadata for every transition.

### Report warning behavior

A pending report is an unverified signal.

The public UI may show a neutral warning in Place Detail, but it must not state that the reported claim is true.

Resolved/rejected reports remain available for audit. Duplicate reports should be aggregated or linked instead of generating unlimited redundant rows.

---

## 4. On-demand ETA Engine

### Cost principle

Routes are explicit user actions only.

Expected request behavior:

| User action | Route request count |
| --- | ---: |
| Open app | 0 |
| Render home/list | 0 |
| Open Place Detail | 0 |
| Select travel mode | 0 |
| Press `คำนวณเวลาเดินทาง` | 1 for the selected mode |
| Calculate another mode | +1 for that mode |

### Supported modes

The UI lets the user choose before calculation:

- walking
- motorcycle/two-wheeler
- driving

Only the selected mode is requested.

### Existing stored values

If verified route-derived distance/ETA values already exist in the canonical data, they may be displayed without making a fresh request.

Do not manufacture walking, motorcycle, or driving minutes from straight-line distance.

Haversine distance may remain useful as straight-line distance only.

### Runtime request results

Fresh Google-backed route results are runtime/transient by default and do not overwrite canonical route fields automatically.

Within the current session, duplicate requests for the same place + travel mode should reuse the runtime result unless the user explicitly chooses `คำนวณใหม่`.

The result UI should include:

- travel mode
- duration
- routed distance
- calculated timestamp

For walking/two-wheeler modes, show any required provider disclaimer/attribution appropriate to the selected route provider.

### Failure behavior

If route calculation is unavailable because of a missing key, API lock, quota guard, provider failure, or no route:

- do not create an estimated route duration
- show a clear unavailable/error state
- preserve a fallback action to open directions in Google Maps when possible

### API controls

Route requests must integrate with the project’s existing Google request tracking and budget controls so route usage is visible in the same operational system as other Google requests.

---

## 5. Parking Match

### Local-first rule

Parking recommendations always use the Around My Dorm canonical dataset first.

Eligible categories include at least:

- `parking`
- `monthly_parking`

Candidates without a usable location cannot be ranked by proximity and should not be inserted into the nearby top list as though their distance were known.

### Ranking

Rank nearby parking using known facts, prioritizing:

1. proximity
2. verified/known availability
3. verified walking ETA when already available
4. price fit/value
5. 24-hour access
6. useful amenities such as covered parking, CCTV, security guard, overnight access, or EV charging

Do not fabricate walking minutes from straight-line distance.

If only straight-line distance exists, show it as distance and do not label it as walking time.

### Place Detail presentation

Show up to three nearby parking options initially with useful facts such as:

- name
- distance
- hourly/daily/monthly price when known
- 24-hour access
- availability status
- CCTV/security/covered parking when known
- verified walking ETA when available

Actions:

- view parking detail
- directions
- view all parking
- `ค้นหาที่จอดเพิ่ม`

### Google fallback

`ค้นหาที่จอดเพิ่ม` is an explicit manual action.

Opening Place Detail or viewing the local parking section must not automatically query Google.

Google parking search results are transient discovery candidates. They must not automatically merge into canonical place data.

An admin may later route a useful candidate through the existing review/import process.

---

## 6. Place Card UX

Phase 3 must not overload cards.

Cards should expose only high-value decision signals, for example:

- open/closed state
- closing/opening soon
- known straight-line or stored travel distance information already available
- a small freshness warning only when data is aging/stale/unknown enough to matter

Examples:

- `เปิดอยู่ • ปิด 21:00`
- `ใกล้ปิด • อีก 18 นาที`
- `ใกล้เปิด • อีก 12 นาที`
- `เวลาเปิดอาจล้าสมัย`

Full freshness breakdown, route calculation, parking matching, and report controls live in Place Detail.

---

## 7. Place Detail Decision Panel

Add a focused section such as `ข้อมูลสำหรับไปตอนนี้` that groups decision-critical information without replacing the existing detail experience.

Suggested content:

- current opening state and next transition
- opening-hours freshness
- current price and price freshness
- straight-line distance from บ้านสุภา
- on-demand ETA selector + calculate button
- nearby parking recommendations
- `รายงานข้อมูลผิด`

Freshness is shown per field rather than as a single all-or-nothing place badge.

ETA UI states:

- idle
- loading
- success
- no route
- API locked/unavailable
- error

While loading, disable the calculation action sufficiently to prevent accidental double submission.

After success, allow `คำนวณใหม่` when the user intentionally wants a fresh request.

---

## 8. Public Report Sheet UX

The report flow opens from Place Detail.

Report type choices:

- ร้านปิดแล้ว
- เวลาเปิดไม่ตรง
- ราคาเปลี่ยน
- ร้านย้าย
- ที่จอดไม่ตรง
- เบอร์โทรผิด
- พิกัด/ที่อยู่ผิด
- อื่นๆ

Optional notes are limited to 500 characters.

Success state explains that the report will be reviewed before data is changed.

Duplicate submission state explains that an equivalent report was already received.

Rate-limit state tells the user to try again later without exposing internal anti-spam mechanics.

---

## 9. Admin Review Queue UX

Add a `DATA REPORTS` section to admin tooling.

Summary metrics:

- new/pending
- reviewing
- resolved
- rejected

Filters should include the common report categories.

Each report card should expose:

- place name
- report type
- report timestamp
- user note if present
- current canonical value relevant to the report
- freshness of that value
- duplicate/related report count when available

Admin actions:

- open place
- take for review
- mark resolved after correction/verification
- reject

All state transitions retain audit metadata.

---

## 10. Data Quality Dashboard additions

Extend existing data-quality tooling with field freshness metrics, for example:

- opening hours fresh percentage
- price fresh percentage
- parking fresh percentage
- location fresh percentage
- count of stale opening-hours records
- count of unknown price verification dates
- pending report count

Metrics should be actionable: selecting a metric should make it possible to identify the affected places for admin follow-up.

The objective is to prevent coverage expansion from degrading trustworthiness as the dataset grows.

---

## 11. Error handling and degraded modes

Phase 3 must prefer unknown/unavailable states over invented data.

Rules:

- missing verification time → freshness `unknown`
- missing route → no ETA rather than an estimate
- route provider failure → visible error/fallback, no fabricated duration
- unknown parking availability → label unknown rather than available
- pending report → “reported / under review”, not “confirmed incorrect”
- Google parking search failure → local parking section remains usable
- reporting RPC failure → preserve user-entered note during the current interaction where practical and show a retry state

---

## 12. Localization and mobile requirements

All new public UI must support the existing TH/EN language flow.

The implementation must remain usable on small mobile displays and respect safe-area insets for sheets, fixed controls, and bottom navigation.

Avoid adding a new permanent navigation tab solely for Phase 3. Prefer Place Detail sections, bottom sheets, and existing admin surfaces.

---

## 13. Testing strategy

Use TDD for implementation work.

Required regression coverage includes:

### Freshness

- threshold boundaries
- unknown timestamps
- provenance precedence
- fields aging independently

### Opening intelligence

- closing soon
- opening soon
- overnight schedules
- multiple daily periods
- stale opening-hours warning independent from open-state calculation

### Reports

- valid anonymous submission
- invalid report type rejected
- message length enforcement
- same reporter/place/type duplicate blocked or aggregated
- short-window and daily rate limits
- public cannot read report queue
- non-admin cannot mutate review state
- admin transition audit fields
- report never directly edits canonical place data

### ETA

- zero route requests on app/list/detail startup
- selecting a mode makes zero requests
- calculate makes exactly one request for selected mode
- another mode requires another explicit request
- duplicate session request reuses runtime result
- recalculate explicitly requests fresh data
- no Haversine-to-minutes estimation
- provider/API-lock failures never produce fake ETA

### Parking

- local canonical candidates rank before any Google fallback
- missing route ETA does not create fake walking minutes
- explicit parking search is required before Google request
- Google parking candidates remain transient and are not auto-imported

### UI/build

- TH/EN paths remain valid
- mobile/safe-area components retain expected structure
- unit tests pass
- type check passes
- production build passes
- Cloudflare Workers bundle validation passes

---

## 14. Acceptance criteria

Phase 3 is complete only when all of the following are true:

1. Home, list, and Place Detail startup cause zero Route API requests.
2. ETA requests happen only after travel mode selection and an explicit calculate action.
3. Walking/driving/motorcycle durations are never inferred from straight-line distance.
4. Opening-soon and closing-soon behavior works for normal and overnight schedules.
5. Freshness is evaluated independently for opening hours, price, parking, contact, location, and image data.
6. A stale field does not mark unrelated verified fields stale.
7. Public reports never edit canonical place data automatically.
8. Duplicate and rate-limit protections prevent report spam.
9. Public users cannot read other users’ reports.
10. Admins can review, resolve, and reject reports with an audit trail.
11. Parking uses the local Around My Dorm dataset first.
12. Google parking discovery occurs only after explicit user action.
13. Google parking results do not automatically enter canonical data.
14. API/provider failure states never generate fabricated data.
15. Phase 3 UI remains usable on small mobile screens and safe areas.
16. TH/EN flows remain intact.
17. Unit tests, type check, production build, and Cloudflare Workers bundle validation are green before integration.

---

## 15. Out of scope

Phase 3 intentionally excludes:

- LLM-based recommendations
- background Google auto-refresh
- continuous traffic monitoring
- reporter reputation/user account system
- push notifications
- automatic correction from public reports
- automatic import of Google parking candidates
- turn-by-turn navigation
- a full redesign of the app shell

These may be considered in a later phase.

---

## Implementation boundary

This document defines behavior and architecture only. The next step after user review is a separate implementation plan produced from this approved design. No production implementation should begin until that plan is written and reviewed according to the project workflow.
