# Phase 3C On-Demand ETA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit-click walking, motorcycle, and driving ETA calculation from บ้านสุภา to the selected place with zero automatic Route API usage.

**Architecture:** Create a runtime-only ETA service/cache keyed by place + mode, integrate it with the existing Google budget/request logging system, and expose a small Detail panel. Route results remain transient unless a separate verified canonical workflow stores them later.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Google Routes API through the project’s existing Google client/budget conventions.

**Spec:** `docs/superpowers/specs/2026-09-17-phase-3-decision-intelligence-design.md`

## Global Constraints

- Opening app/list/detail, scrolling, and choosing a mode cause zero route requests.
- Only pressing `คำนวณเวลาเดินทาง` causes a request.
- Origin is บ้านสุภา; destination is the current place.
- Modes: walking, two-wheeler/motorcycle, driving.
- Never convert Haversine/straight-line distance into travel minutes.
- Same place+mode reuses the session result unless user explicitly recalculates.
- Provider/API failure returns unavailable/error, never a fabricated ETA.
- Preserve provider attribution/disclaimer requirements for walking/two-wheeler.

---

## File Structure

- Create `lib/route-eta-runtime.ts` — mode types, transient cache, request orchestration, refresh semantics.
- Create or extend a focused Google route client file under `lib/` using existing API key/budget/logging patterns.
- Create `components/PlaceEtaPanel.tsx` — mode selector, calculate/recalculate, states, fallback directions.
- Modify Place Detail to mount the ETA panel.
- Modify `lib/google-api-budget.ts` / request-control module only as needed to register a route-request category.
- Add tests: `tests/route-eta-runtime.test.ts`, `tests/place-eta-panel.test.ts`, `tests/route-api-cost-guard.test.ts`.

### Task 1: Route runtime contract and cache

**Interfaces:**
- `type RouteMode = "walking" | "motorcycle" | "driving"`.
- `type RouteEtaResult = { mode: RouteMode; durationMinutes: number; distanceMeters: number; calculatedAt: string; source: "google_routes" }`.
- `getRuntimeRouteEta(placeId, mode)` returns cached result/null.
- `calculateRouteEta(place, mode, options?: { force?: boolean })` reuses cached result unless `force=true`.

- [ ] **Step 1: Write failing tests** for empty cache, place+mode isolation, duplicate reuse, force refresh, and no persistence to `Place`.
- [ ] **Step 2: Run RED** with `npm test -- tests/route-eta-runtime.test.ts`.
- [ ] **Step 3: Implement runtime cache** in `lib/route-eta-runtime.ts` using module/session memory only; never localStorage/IndexedDB/Supabase for fresh provider response.
- [ ] **Step 4: Run GREEN** and `npm run typecheck`.
- [ ] **Step 5: Commit** `feat: add transient route ETA runtime`.

### Task 2: Google Routes request adapter + budget guard

**Interfaces:**
- Produces `requestGoogleRouteEta({ origin, destination, mode }): Promise<RouteEtaResult>`.
- Maps `walking -> WALK`, `motorcycle -> TWO_WHEELER`, `driving -> DRIVE`.
- Records one request only when the adapter is actually invoked.

- [ ] **Step 1: Write failing request-shape tests** asserting origin is `DORM_CENTER`/verified HomeOrigin, destination uses current place coordinates, selected mode maps exactly once, and missing coordinates fail before network.
- [ ] **Step 2: Write failing cost-guard tests** asserting import/render/select operations do not call the adapter; calculate does once; second mode does one additional call; cached repeat does zero; force recalc does one.
- [ ] **Step 3: Run RED** with `npm test -- tests/route-api-cost-guard.test.ts`.
- [ ] **Step 4: Implement adapter** following existing Google fetch/auth conventions, request only duration + distance fields, normalize seconds/meters, and register route usage with existing budget/request logging.
- [ ] **Step 5: Handle errors explicitly**: `missing_key`, `budget_locked`, `no_route`, `provider_error`; return typed failures, not numeric guesses.
- [ ] **Step 6: Run GREEN**, `npm run typecheck`.
- [ ] **Step 7: Commit** `feat: add guarded Google route requests`.

### Task 3: ETA Detail panel

**Interfaces:**
- `PlaceEtaPanel` consumes `{ place: Place; locale: "th"|"en" }`.
- UI states: idle, loading, success, no-route, locked/unavailable, error.

- [ ] **Step 1: Write failing UI tests** for three mode buttons, zero request on render/mode select, explicit calculate, loading disable, cached result, recalculate, error fallback, and Google Maps directions action.
- [ ] **Step 2: Run RED**.
- [ ] **Step 3: Implement `PlaceEtaPanel.tsx`**. Render stored verified canonical ETA if present; label runtime result with calculated time; show required walking/two-wheeler disclaimer/attribution; provide `คำนวณใหม่` only after success.
- [ ] **Step 4: Mount in Place Detail** under the Decision Panel; do not add route logic to list/card components.
- [ ] **Step 5: Run GREEN** plus `npm run typecheck` and `npm run build`.
- [ ] **Step 6: Commit** `feat: add on-demand ETA panel`.

### Task 4: Regression guard against invented ETA

- [ ] Add source/regression tests proving `withDistance()` still calculates only straight-line distance and does not populate missing walking/motorcycle/driving minutes.
- [ ] Add tests ensuring route failure leaves existing unknown route fields unknown.
- [ ] Run `npm test -- tests/route-eta-runtime.test.ts tests/route-api-cost-guard.test.ts tests/place-eta-panel.test.ts`.
- [ ] Commit `test: guard route ETA integrity`.

### Task 5: Phase 3C verification

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run `npm run build:cloudflare` and verify dry-run only.
- [ ] Inspect route-request logging to verify a normal app/detail open produces zero route calls.
- [ ] Manually test one calculation per mode and duplicate cache behavior in a development environment with an authorized key.
- [ ] Commit any fixes as `fix: stabilize Phase 3C ETA`.
