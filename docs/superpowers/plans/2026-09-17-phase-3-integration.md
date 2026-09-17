# Phase 3 Decision Intelligence Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the five Phase 3 subsystems into the existing app, apply the report database migration, and prove the full zero-background-API and mobile/TH-EN acceptance criteria before PR/merge.

**Architecture:** Execute subsystem plans independently, then integrate only through stable interfaces in `PlaceCard`, `PlaceDetail`, `DataQualityDashboard`, and the existing cloud/API controls. Keep `AroundMyDormApp.tsx` limited to passing data/handlers; do not move subsystem logic into the shell.

**Tech Stack:** Next.js 15.5, React 19.1, TypeScript 5.8, Vitest 3.2, Playwright 1.55, Supabase JS 2.116, Wrangler 4.68.

**Spec:** `docs/superpowers/specs/2026-09-17-phase-3-decision-intelligence-design.md`

## Global Constraints

- Execute subsystem plans in this order: Freshness -> Opening Intelligence -> Public Reports -> ETA -> Parking -> Integration.
- App/list/detail startup must make zero Route API requests.
- Google parking discovery and route calculation require explicit user actions.
- No fake route minutes from Haversine.
- Public report submission cannot mutate canonical place data.
- New public UI supports TH/EN and mobile safe areas.
- Merge only after unit tests, typecheck, production build, and Cloudflare dry-run all pass.

## Subsystem Plans

1. `docs/superpowers/plans/2026-09-17-phase-3-freshness.md`
2. `docs/superpowers/plans/2026-09-17-phase-3-opening-intelligence.md`
3. `docs/superpowers/plans/2026-09-17-phase-3-public-reports.md`
4. `docs/superpowers/plans/2026-09-17-phase-3-eta.md`
5. `docs/superpowers/plans/2026-09-17-phase-3-parking.md`

---

### Task 1: Add one focused Decision Panel composition

**Files:**
- Create: `components/PlaceDecisionPanel.tsx`
- Modify: `components/PlaceDetail.tsx`
- Modify: `components/AroundMyDormApp.tsx`
- Test: `tests/place-decision-panel.test.tsx`

**Interfaces:**
- `PlaceDecisionPanel({ place, allPlaces, language }: { place: Place; allPlaces: Place[]; language: "th" | "en" })`.
- Internally composes field freshness display, `PlaceEtaPanel`, `NearbyParkingPanel`, and report action; opening copy is derived from `getPlaceOpenStatus()` + `formatOpeningIntelligence()`.

- [ ] **Step 1: Write failing composition test**

Assert the panel contains opening, freshness, price, straight-line distance, ETA selector, local parking, and report action; assert no route or Google parking function is called merely by render.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/place-decision-panel.test.tsx`
Expected: FAIL because `PlaceDecisionPanel` is missing.

- [ ] **Step 3: Implement composition**

Move only Phase 3 presentation from `PlaceDetail` into the new component. Do not move unrelated gallery/menu/contact functionality. Keep `PlaceDetail` responsible for sheet framing and existing detail content.

- [ ] **Step 4: Pass `allPlaces` through the existing shell boundary**

In the `PlaceDetail` call site, pass the current canonical `databasePlaces`/resolved place collection. Do not import the data seed directly into the panel.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- tests/place-decision-panel.test.tsx && npm run typecheck`
Expected: PASS.

```bash
git add components/PlaceDecisionPanel.tsx components/PlaceDetail.tsx components/AroundMyDormApp.tsx tests/place-decision-panel.test.tsx
git commit -m "feat: compose Phase 3 place decision panel"
```

### Task 2: Apply and verify Supabase report migration

**Files:**
- Uses: `supabase/place-reports.sql`
- Test: `tests/place-reports-schema.test.ts`

**Interfaces:**
- Requires the connected Supabase project currently used by Around My Dorm.

- [ ] **Step 1: Re-run schema test before live apply**

Run: `npm test -- tests/place-reports-schema.test.ts`
Expected: PASS.

- [ ] **Step 2: Apply the exact `supabase/place-reports.sql` migration through the connected Supabase migration action**

Migration name: `around_my_dorm_phase3_place_reports`.

Do not manually paste a modified variant in production; the repository SQL is the source of truth.

- [ ] **Step 3: Verify database objects**

Check that `amd_place_reports`, `amd_submit_place_report`, and `amd_admin_transition_place_report` exist and that public/anon cannot select report rows directly.

- [ ] **Step 4: Smoke-test RPC outcomes with non-production test place/report data only if the connected environment supports safe rollback**

Expected public outcomes: `accepted`, then `duplicate` for same place/type/fingerprint window; admin transition requires an authorized admin session.

- [ ] **Step 5: Commit only repository-side follow-up if migration verification exposed a contract mismatch**

If no repo changes are needed, do not create an empty commit.

### Task 3: Cross-subsystem API safety regression suite

**Files:**
- Create: `tests/phase3-api-safety.test.tsx`
- Modify only if test exposes a defect in the owning subsystem.

**Interfaces:**
- Guards the acceptance rule that all provider requests are explicit.

- [ ] **Step 1: Write failing/guard tests before any integration fix**

Test these exact actions:

```text
render app shell              -> 0 route requests, 0 parking searches
render PlaceCard              -> 0 route requests, 0 parking searches
open PlaceDetail              -> 0 route requests, 0 parking searches
select walking mode           -> 0 route requests
press calculate               -> 1 route request
press find more parking       -> 1 parking search
```

- [ ] **Step 2: Run suite**

Run: `npm test -- tests/phase3-api-safety.test.tsx`
Expected: PASS after subsystem integration. If it fails, fix the responsible subsystem with its own focused test first, then rerun.

- [ ] **Step 3: Commit guard suite**

```bash
git add tests/phase3-api-safety.test.tsx
git commit -m "test: guard Phase 3 explicit API behavior"
```

### Task 4: Localization, small-screen, and safe-area regression

**Files:**
- Modify: `locales/index.ts` or existing locale source if new copy is not already colocated safely.
- Create: `tests/phase3-localization.test.ts`
- Create: `tests/phase3-mobile-structure.test.ts`

**Interfaces:**
- All user-visible Phase 3 copy must resolve for `th` and `en`.

- [ ] **Step 1: Add failing localization coverage**

Assert both languages provide equivalent labels for freshness warnings, calculate/recalculate, route modes, report outcomes, nearby parking, and manual parking search.

- [ ] **Step 2: Add failing safe-area/source-structure coverage**

Assert bottom sheets/panels preserve `env(safe-area-inset-bottom)` where fixed/bottom-aligned and no new permanent navigation tab was added.

- [ ] **Step 3: Run RED/GREEN cycle**

Run: `npm test -- tests/phase3-localization.test.ts tests/phase3-mobile-structure.test.ts`
Expected: PASS after copy/safe-area fixes.

- [ ] **Step 4: Commit**

```bash
git add locales components tests/phase3-localization.test.ts tests/phase3-mobile-structure.test.ts
git commit -m "test: cover Phase 3 localization and mobile layout"
```

### Task 5: Full repository verification

**Files:**
- No planned production changes; fix only defects proven by verification.

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 2: Run data validation**

Run: `npm run validate:data`
Expected: PASS with no canonical-data validation regression.

- [ ] **Step 3: Run type check**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Validate Cloudflare bundle**

Run: `npm run build:cloudflare`
Expected: `wrangler deploy --dry-run` exits 0; this is validation only, not production deployment.

- [ ] **Step 6: Run focused E2E if the project test environment is available**

Run: `npm run test:e2e`
Expected: PASS. If E2E infrastructure is unavailable, record that limitation explicitly instead of claiming it passed.

### Task 6: PR readiness review

**Files:**
- Review all Phase 3 changed files.

- [ ] **Step 1: Compare branch against `main`**

Review that changes are restricted to Phase 3 behavior, tests, schema, and docs; reject unrelated refactors.

- [ ] **Step 2: Confirm acceptance checklist**

Verify all 17 design acceptance criteria have direct test or verification evidence.

- [ ] **Step 3: Confirm no prohibited persistence**

Check that transient Google route and parking discovery results are not persisted into canonical place data automatically.

- [ ] **Step 4: Prepare PR summary**

PR title: `Phase 3: add decision intelligence`

Summary must call out: field freshness, opening intelligence, secure public reports/admin queue, explicit ETA, local-first parking, no background Google route/parking requests, verification commands and results.

- [ ] **Step 5: Do not merge until CI is green**

After PR creation, inspect the actual workflow run/job steps. A local build alone is not evidence that CI passed, and a merge is not evidence of deployment.
