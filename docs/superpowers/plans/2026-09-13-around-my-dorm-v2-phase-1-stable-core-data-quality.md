# Around My Dorm V2 Phase 1 — Stable Core and Data Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a smaller, testable V2 core by normalizing stored places, centralizing discovery derivation, isolating database-loading state, and adding actionable data-health diagnostics without changing user-visible behavior or Google API cost controls.

**Architecture:** Keep `AroundMyDormApp` as the mounted product shell, but move pure data transformation and orchestration into focused modules. Normalize places only at the final database-read boundary, derive search/filter/radius/sort results through one shared discovery function, and expose database lifecycle through a small hook. Extend the existing local-only data-quality system rather than creating a second scoring system.

**Tech Stack:** Next.js 15.5+, React 19.1+, TypeScript 5.8+, Vitest 3.2+, Testing Library, Playwright 1.55+, Supabase JS 2.116+, Cloudflare Workers/Wrangler 4.68+. No new dependencies in Phase 1.

**Spec:** `docs/superpowers/specs/2026-09-13-around-my-dorm-v2-design.md`

## Global Constraints

- Preserve existing Saved/Favorites, Collections, Recently Viewed, Search, Filters, sorting, Place Detail, Parking, routes/deep links, internal IDs, slugs, classifications, curated notes, prices, parking data, source URLs, and provenance.
- Keep `types/place.ts` as the canonical place model; do not introduce a parallel place schema.
- Stored Around My Dorm data remains primary for normal browsing.
- Google Maps JavaScript must not auto-load during startup, ordinary navigation, filtering, scrolling, marker/card selection, or data-quality work.
- Places Search, Place Details, photo enrichment, matching, retries, and route refresh remain explicit user/admin actions protected by existing controls.
- Phase 1 normalization, discovery, diagnostics, and database lifecycle code must perform zero Google network requests.
- Never fabricate opening hours, prices, parking facts, coordinates, ratings, phone numbers, walking/driving times, or images.
- Local distance derivation may calculate straight-line distance only; verified route times remain untouched.
- Manual/curated values remain authoritative. Normalization may clean representation but must not replace meaningful content with inferred external values.
- Duplicate detection in Phase 1 is diagnostic only. Do not merge or delete canonical records.
- Node.js remains `>=20.9.0`; no package dependency changes are required.
- Each task follows TDD: failing test first, confirm RED, implement the smallest coherent change, confirm GREEN, run relevant regression tests, then commit.

---

### Task 1: Add deterministic place normalization

**Files:**
- Create: `lib/place-data/normalize-place.ts`
- Create: `tests/place-normalization.test.ts`

**Interfaces:**
- Consumes: existing `Place` from `types/place.ts`.
- Produces: `normalizePlace(place: Place): Place` and `normalizePlaces(places: Place[]): Place[]`.
- Later tasks consume normalized place records from the database loader and diagnostics.

- [ ] **Step 1: Write the failing normalization tests**

Create `tests/place-normalization.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import { normalizePlace, normalizePlaces } from "@/lib/place-data/normalize-place";

const seed = PLACES[0]!;

describe("place normalization", () => {
  it("keeps the primary category and removes duplicate collection values", () => {
    const source = {
      ...seed,
      category: "cafe" as const,
      categories: ["food" as const, "cafe" as const, "food" as const],
      tags: [" local ", "local", "wifi"],
      images: [" https://img.test/a.jpg ", "https://img.test/a.jpg", ""],
      source: ["seed", " seed ", "manual"],
    };

    const normalized = normalizePlace(source);

    expect(normalized.categories).toEqual(["cafe", "food"]);
    expect(normalized.tags).toEqual(["local", "wifi"]);
    expect(normalized.images).toEqual(["https://img.test/a.jpg"]);
    expect(normalized.source).toEqual(["seed", "manual"]);
    expect(source.images).toHaveLength(3);
  });

  it("turns blank nullable identity/link fields into null without inventing values", () => {
    const normalized = normalizePlace({
      ...seed,
      nameEn: "   ",
      googlePlaceId: "  ",
      googleMapsUrl: " ",
      phone: "   ",
      latitude: null,
      longitude: null,
      walkingMinutes: null,
      drivingMinutes: null,
    });

    expect(normalized.nameEn).toBeNull();
    expect(normalized.googlePlaceId).toBeNull();
    expect(normalized.googleMapsUrl).toBeNull();
    expect(normalized.phone).toBeNull();
    expect(normalized.latitude).toBeNull();
    expect(normalized.walkingMinutes).toBeNull();
    expect(normalized.drivingMinutes).toBeNull();
  });

  it("normalizes arrays without mutating the input array", () => {
    const source = [{ ...seed, tags: ["one", " one "] }];
    const result = normalizePlaces(source);
    expect(result[0]?.tags).toEqual(["one"]);
    expect(source[0]?.tags).toEqual(["one", " one "]);
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
npm test -- tests/place-normalization.test.ts
```

Expected: FAIL because `@/lib/place-data/normalize-place` does not exist.

- [ ] **Step 3: Implement the normalization module**

Create `lib/place-data/normalize-place.ts` with focused representation cleanup only:

```ts
import type { CategoryId, Place } from "@/types/place";

function compactNullable(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function uniqueStrings(values: readonly string[] | null | undefined): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function normalizeCategories(primary: CategoryId, categories: readonly CategoryId[]): CategoryId[] {
  return Array.from(new Set<CategoryId>([primary, ...categories]));
}

export function normalizePlace(place: Place): Place {
  return {
    ...place,
    name: place.name.trim(),
    nameEn: compactNullable(place.nameEn),
    googlePlaceId: compactNullable(place.googlePlaceId),
    address: compactNullable(place.address),
    soi: compactNullable(place.soi),
    phone: compactNullable(place.phone),
    line: compactNullable(place.line),
    facebook: compactNullable(place.facebook),
    instagram: compactNullable(place.instagram),
    website: compactNullable(place.website),
    googleMapsUrl: compactNullable(place.googleMapsUrl),
    image: compactNullable(place.image),
    priceText: compactNullable(place.priceText),
    notes: compactNullable(place.notes),
    categories: normalizeCategories(place.category, place.categories ?? []),
    tags: uniqueStrings(place.tags),
    images: uniqueStrings(place.images),
    popularMenus: uniqueStrings(place.popularMenus),
    recommendedItems: uniqueStrings(place.recommendedItems),
    paymentMethods: uniqueStrings(place.paymentMethods),
    deliveryApps: uniqueStrings(place.deliveryApps),
    source: uniqueStrings(place.source),
    galleryImages: place.galleryImages ? uniqueStrings(place.galleryImages) : place.galleryImages,
    menuImages: place.menuImages ? uniqueStrings(place.menuImages) : place.menuImages,
    parkingImages: place.parkingImages ? uniqueStrings(place.parkingImages) : place.parkingImages,
  };
}

export function normalizePlaces(places: Place[]): Place[] {
  return places.map(normalizePlace);
}
```

Do not add inferred Maps URLs, route values, hours, prices, or images here. Those remain separate explicit workflows.

- [ ] **Step 4: Run targeted tests and typecheck**

Run:

```bash
npm test -- tests/place-normalization.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/place-data/normalize-place.ts tests/place-normalization.test.ts
git commit -m "feat: normalize stored place records"
```

---

### Task 2: Add local-only data-health diagnostics

**Files:**
- Create: `lib/place-data/data-health.ts`
- Create: `tests/data-health.test.ts`

**Interfaces:**
- Consumes: normalized `Place[]`, `normalizePlaceName()`, `haversineKm()`, `dataAgeDays()`, and `scorePlaceDataQuality()`.
- Produces: `buildDataHealthSummary(places: Place[], now?: number): DataHealthSummary`.
- Produces issue codes that the Data Quality UI can display without making provider calls.

Use these exact public types:

```ts
export type DataHealthIssueCode =
  | "duplicate_id"
  | "duplicate_slug"
  | "duplicate_google_place_id"
  | "invalid_coordinates"
  | "category_mismatch"
  | "missing_maps_link"
  | "duplicate_image"
  | "invalid_price_range"
  | "stale_record"
  | "missing_area_context"
  | "local_chain_ambiguity"
  | "possible_duplicate_business";

export type DataHealthIssue = {
  code: DataHealthIssueCode;
  severity: "warning" | "error";
  placeIds: string[];
  message: string;
};

export type DataHealthSummary = {
  total: number;
  status: { verified: number; partial: number; stale: number; unverified: number };
  withCoordinates: number;
  withMapsLink: number;
  withUsableImage: number;
  withHours: number;
  withPrice: number;
  duplicateCandidates: number;
  needsReview: number;
  issues: DataHealthIssue[];
};
```

- [ ] **Step 1: Write failing data-health tests**

Create `tests/data-health.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import { buildDataHealthSummary } from "@/lib/place-data/data-health";

const seed = PLACES[0]!;

function place(id: string, overrides = {}) {
  return {
    ...seed,
    id,
    slug: id,
    name: `Shop ${id}`,
    latitude: 13.82,
    longitude: 100.58,
    category: "cafe" as const,
    categories: ["cafe" as const],
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${id}`,
    dataStatus: "verified" as const,
    verified: true,
    lastChecked: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("data health diagnostics", () => {
  it("counts usable coverage and explicit data states", () => {
    const summary = buildDataHealthSummary([
      place("a"),
      place("b", { dataStatus: "partial", verified: false, googleMapsUrl: null }),
    ], new Date("2026-09-13T00:00:00.000Z").getTime());

    expect(summary.total).toBe(2);
    expect(summary.status.verified).toBe(1);
    expect(summary.status.partial).toBe(1);
    expect(summary.withCoordinates).toBe(2);
    expect(summary.withMapsLink).toBe(1);
  });

  it("reports identity, coordinate, category and price problems without mutating data", () => {
    const source = [
      place("same", { slug: "dup", googlePlaceId: "g-dup" }),
      place("same", {
        slug: "dup",
        googlePlaceId: "g-dup",
        latitude: 120,
        category: "cafe" as const,
        categories: ["food" as const],
        minPrice: 200,
        maxPrice: 100,
      }),
    ];

    const summary = buildDataHealthSummary(source, new Date("2026-09-13T00:00:00.000Z").getTime());
    const codes = new Set(summary.issues.map((issue) => issue.code));

    expect(codes).toContain("duplicate_id");
    expect(codes).toContain("duplicate_slug");
    expect(codes).toContain("duplicate_google_place_id");
    expect(codes).toContain("invalid_coordinates");
    expect(codes).toContain("category_mismatch");
    expect(codes).toContain("invalid_price_range");
    expect(source[1]?.latitude).toBe(120);
  });

  it("flags nearby same-name businesses as review candidates but does not merge them", () => {
    const summary = buildDataHealthSummary([
      place("x", { name: "ร้านกาแฟ ABC", latitude: 13.82000, longitude: 100.58000 }),
      place("y", { name: "ร้านกาแฟ ABC", latitude: 13.82035, longitude: 100.58025 }),
    ]);

    expect(summary.issues.some((issue) => issue.code === "possible_duplicate_business")).toBe(true);
    expect(summary.total).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
npm test -- tests/data-health.test.ts
```

Expected: FAIL because `@/lib/place-data/data-health` does not exist.

- [ ] **Step 3: Implement data-health classification helpers**

Create `lib/place-data/data-health.ts`. Reuse existing utilities rather than reimplementing score logic:

```ts
import { scorePlaceDataQuality, dataAgeDays } from "@/lib/data-quality";
import { haversineKm, normalizePlaceName } from "@/lib/place-utils";
import type { Place } from "@/types/place";

function hasValidCoordinates(place: Place) {
  return (
    place.latitude != null &&
    place.longitude != null &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude) &&
    place.latitude >= -90 && place.latitude <= 90 &&
    place.longitude >= -180 && place.longitude <= 180
  );
}

function resolvedStatus(place: Place, now: number): keyof DataHealthSummary["status"] {
  const age = dataAgeDays(place, now);
  if (place.dataStatus === "stale" || (age != null && age > 90)) return "stale";
  if (place.dataStatus === "unverified") return "unverified";
  if (place.dataStatus === "partial") return "partial";
  if (place.dataStatus === "verified" || place.verified) return "verified";
  return "unverified";
}
```

Then implement `buildDataHealthSummary()` with these exact rules:

- Duplicate `id`, `slug`, and non-empty `googlePlaceId` are errors.
- Coordinates outside valid latitude/longitude ranges are errors.
- Primary `category` absent from `categories` is a warning.
- A record with a Google Place ID or valid coordinates but no `googleMapsUrl` and no `googleMaps?.url` gets `missing_maps_link`; do not generate or fetch a link in this task.
- Duplicate non-empty URLs within `images`, `galleryImages`, `menuImages`, or `parkingImages` get `duplicate_image`.
- `minPrice > maxPrice` or `pricing.min > pricing.max` gets `invalid_price_range`.
- `dataAgeDays() > 90` or `dataStatus === "stale"` gets `stale_record`.
- Valid coordinates with both blank `area` and blank `soi` gets `missing_area_context`.
- `placeType === "chain"` together with `localFavorite === true` gets `local_chain_ambiguity` for review; do not rewrite either field.
- Two different records whose `normalizePlaceName(name)` matches and whose valid coordinates are within 100 meters get one `possible_duplicate_business` warning for that pair.
- Coverage for image/hours/price reuses `scorePlaceDataQuality(place).missing` so scoring semantics stay consistent.
- `needsReview` is the number of unique place IDs appearing in any issue.
- `duplicateCandidates` is the number of duplicate-related issue groups (`duplicate_id`, `duplicate_slug`, `duplicate_google_place_id`, `possible_duplicate_business`).

A compact grouping helper is acceptable:

```ts
function duplicatesBy(places: Place[], value: (place: Place) => string | null) {
  const groups = new Map<string, string[]>();
  for (const place of places) {
    const key = value(place);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), place.id]);
  }
  return [...groups.entries()].filter(([, ids]) => ids.length > 1);
}
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- tests/data-health.test.ts tests/data-quality.test.ts tests/place-utils.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/place-data/data-health.ts tests/data-health.test.ts
git commit -m "feat: add local place data health diagnostics"
```

---

### Task 3: Extract the shared discovery derivation engine

**Files:**
- Create: `lib/discovery/derive-visible-places.ts`
- Create: `tests/discovery-engine.test.ts`

**Interfaces:**
- Consumes: existing `withDistance`, `matchesSearch`, `passesFilters`, `filterPlacesInSearchArea`, `sortPlaces`, `FilterState`, `OriginMode`, `RecommendationContext`, `CategoryId`, `SortMode`, and `Place`.
- Produces: `deriveDiscoveryState(input: DiscoveryInput): DiscoveryResult`.
- Later Home/Explore/Map work must consume this shared semantic path instead of reimplementing filters.

Use these exact types:

```ts
export type DiscoveryInput = {
  places: Place[];
  origin: GeoPoint;
  category: "all" | CategoryId;
  query: string;
  filters: FilterState;
  radiusMeters: number;
  mapSearchCenter: GeoPoint;
  originMode: OriginMode;
  sortMode: SortMode;
  verifiedOnly: boolean;
  recommendationContext: RecommendationContext;
};

export type DiscoveryResult = {
  allPlaces: Place[];
  visiblePlaces: Place[];
};
```

- [ ] **Step 1: Write failing shared-discovery tests**

Create `tests/discovery-engine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS } from "@/components/FilterSheet";
import { PLACES } from "@/data/places";
import { deriveDiscoveryState } from "@/lib/discovery/derive-visible-places";

const seed = PLACES[0]!;
const origin = { lat: 13.82, lng: 100.58 };

function candidate(id: string, overrides = {}) {
  return {
    ...seed,
    id,
    slug: id,
    name: id,
    category: "cafe" as const,
    categories: ["cafe" as const],
    latitude: 13.82,
    longitude: 100.58,
    verified: true,
    ...overrides,
  };
}

function input(places = [candidate("near")]) {
  return {
    places,
    origin,
    category: "all" as const,
    query: "",
    filters: EMPTY_FILTERS,
    radiusMeters: 500,
    mapSearchCenter: origin,
    originMode: "dorm" as const,
    sortMode: "distanceAsc" as const,
    verifiedOnly: false,
    recommendationContext: {},
  };
}

describe("shared discovery engine", () => {
  it("applies distance, category, query and radius semantics in one derivation", () => {
    const result = deriveDiscoveryState(input([
      candidate("near cafe", { latitude: 13.8201, longitude: 100.5801 }),
      candidate("far cafe", { latitude: 13.90, longitude: 100.70 }),
      candidate("near food", { category: "food" as const, categories: ["food" as const] }),
    ]));

    expect(result.allPlaces).toHaveLength(3);
    expect(result.visiblePlaces.map((place) => place.id)).toEqual(["near cafe", "near food"]);

    const cafes = deriveDiscoveryState({ ...input(result.allPlaces), category: "cafe", query: "near" });
    expect(cafes.visiblePlaces.map((place) => place.id)).toEqual(["near cafe"]);
  });

  it("keeps coordinate-less stored records visible for dorm browsing but not current-location mode", () => {
    const unknown = candidate("unknown", { latitude: null, longitude: null });
    expect(deriveDiscoveryState(input([unknown])).visiblePlaces).toHaveLength(1);
    expect(deriveDiscoveryState({ ...input([unknown]), originMode: "me" }).visiblePlaces).toHaveLength(0);
  });

  it("respects existing strict filters without external requests", () => {
    const places = [candidate("verified"), candidate("unverified", { verified: false })];
    const result = deriveDiscoveryState({
      ...input(places),
      filters: { ...EMPTY_FILTERS, verifiedOnly: true },
    });
    expect(result.visiblePlaces.map((place) => place.id)).toEqual(["verified"]);
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
npm test -- tests/discovery-engine.test.ts
```

Expected: FAIL because `@/lib/discovery/derive-visible-places` does not exist.

- [ ] **Step 3: Implement the extracted derivation using current semantics**

Create `lib/discovery/derive-visible-places.ts`:

```ts
import type { FilterState } from "@/components/FilterSheet";
import { filterPlacesInSearchArea, type GeoPoint } from "@/lib/hybrid-map-platform";
import { matchesSearch, withDistance } from "@/lib/place-utils";
import { passesFilters, sortPlaces, type RecommendationContext } from "@/lib/place-ranking";
import type { OriginMode } from "@/lib/app-shell-config";
import type { CategoryId, Place, SortMode } from "@/types/place";

export type DiscoveryInput = {
  places: Place[];
  origin: GeoPoint;
  category: "all" | CategoryId;
  query: string;
  filters: FilterState;
  radiusMeters: number;
  mapSearchCenter: GeoPoint;
  originMode: OriginMode;
  sortMode: SortMode;
  verifiedOnly: boolean;
  recommendationContext: RecommendationContext;
};

export type DiscoveryResult = { allPlaces: Place[]; visiblePlaces: Place[] };

export function deriveDiscoveryState(input: DiscoveryInput): DiscoveryResult {
  const allPlaces = input.places.map((place) => withDistance(place, input.origin));
  const base = allPlaces.filter((place) => {
    if (input.category !== "all" && !place.categories.includes(input.category)) return false;
    if (!matchesSearch(place, input.query)) return false;
    if (!passesFilters(place, input.filters, input.verifiedOnly)) return false;
    if (input.originMode === "me" && place.distanceKm == null) return false;
    return true;
  });

  const inArea = new Set(
    filterPlacesInSearchArea(base, input.mapSearchCenter, input.radiusMeters).map((place) => place.id),
  );
  const visible = base.filter(
    (place) => place.latitude == null || place.longitude == null || inArea.has(place.id),
  );

  return {
    allPlaces,
    visiblePlaces: sortPlaces(visible, input.sortMode, input.recommendationContext),
  };
}
```

This intentionally mirrors the existing `AroundMyDormApp` behavior. Do not “fix” radius behavior or remove coordinate-less records in this task because that would be a product behavior change.

- [ ] **Step 4: Run targeted discovery regressions**

Run:

```bash
npm test -- tests/discovery-engine.test.ts tests/place-ranking.test.ts tests/place-utils.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/discovery/derive-visible-places.ts tests/discovery-engine.test.ts
git commit -m "refactor: centralize place discovery derivation"
```

---

### Task 4: Normalize database output and isolate database lifecycle in a hook

**Files:**
- Modify: `lib/database/places.ts`
- Create: `components/app-shell/usePlaceDatabase.ts`
- Create: `tests/use-place-database.test.ts`

**Interfaces:**
- Consumes: `loadPlacesFromDatabase()` and `normalizePlaces()`.
- Produces: normalized `PlaceDatabaseResult.places` from the repository boundary.
- Produces: `usePlaceDatabase(options?: UsePlaceDatabaseOptions)` with `places`, `databaseSource`, `loading`, `error`, `warning`, and `reload`.

Use these exact hook types:

```ts
export type PlaceLoader = () => Promise<PlaceDatabaseResult>;
export type UsePlaceDatabaseOptions = { loader?: PlaceLoader };

export type PlaceDatabaseState = {
  places: Place[];
  databaseSource: string;
  loading: boolean;
  error: string | null;
  warning: string | null;
  reload: () => Promise<void>;
};
```

- [ ] **Step 1: Write the failing hook lifecycle tests**

Create `tests/use-place-database.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PLACES } from "@/data/places";
import { usePlaceDatabase } from "@/components/app-shell/usePlaceDatabase";

const seed = PLACES[0]!;

describe("usePlaceDatabase", () => {
  it("loads once, exposes warning state and supports explicit reload", async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce({ places: [seed], source: "supabase", loadedAt: "2026-09-13T00:00:00Z", warning: "route cache unavailable" })
      .mockResolvedValueOnce({ places: [{ ...seed, id: "reloaded" }], source: "supabase", loadedAt: "2026-09-13T00:01:00Z", warning: null });

    const { result } = renderHook(() => usePlaceDatabase({ loader }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(loader).toHaveBeenCalledTimes(1);
    expect(result.current.places).toHaveLength(1);
    expect(result.current.warning).toBe("route cache unavailable");

    await act(async () => result.current.reload());
    expect(loader).toHaveBeenCalledTimes(2);
    expect(result.current.places[0]?.id).toBe("reloaded");
  });

  it("reports loader failure without fabricating fallback places", async () => {
    const loader = vi.fn().mockRejectedValue(new Error("Cloud database unavailable"));
    const { result } = renderHook(() => usePlaceDatabase({ loader }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.places).toEqual([]);
    expect(result.current.error).toContain("Cloud database unavailable");
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
npm test -- tests/use-place-database.test.ts
```

Expected: FAIL because `components/app-shell/usePlaceDatabase.ts` does not exist.

- [ ] **Step 3: Normalize the final database output**

Modify `lib/database/places.ts` to import:

```ts
import { normalizePlaces } from "@/lib/place-data/normalize-place";
```

Change only the final return boundary of `loadPlacesFromDatabase()`:

```ts
return {
  places: normalizePlaces(personalizedPlaces),
  source: "supabase",
  loadedAt: new Date().toISOString(),
  warning,
};
```

Do not normalize before provenance/user/route layers; the final boundary should see the fully merged record.

- [ ] **Step 4: Implement the database lifecycle hook**

Create `components/app-shell/usePlaceDatabase.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { loadPlacesFromDatabase, type PlaceDatabaseResult } from "@/lib/database/places";
import type { Place } from "@/types/place";

export type PlaceLoader = () => Promise<PlaceDatabaseResult>;
export type UsePlaceDatabaseOptions = { loader?: PlaceLoader };
export type PlaceDatabaseState = {
  places: Place[];
  databaseSource: string;
  loading: boolean;
  error: string | null;
  warning: string | null;
  reload: () => Promise<void>;
};

export function usePlaceDatabase(options: UsePlaceDatabaseOptions = {}): PlaceDatabaseState {
  const loader = options.loader ?? loadPlacesFromDatabase;
  const [places, setPlaces] = useState<Place[]>([]);
  const [databaseSource, setDatabaseSource] = useState("supabase");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loader();
      setPlaces(result.places);
      setDatabaseSource(result.source);
      setWarning(result.warning);
      setError(null);
    } catch (cause) {
      setPlaces([]);
      setDatabaseSource("supabase");
      setWarning(null);
      setError(cause instanceof Error ? cause.message : "Supabase cloud database unavailable");
    } finally {
      setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { places, databaseSource, loading, error, warning, reload };
}
```

The default loader reference is a module function and remains stable. Tests inject a stable `vi.fn()` loader.

- [ ] **Step 5: Run hook, normalization and database-adjacent tests**

Run:

```bash
npm test -- tests/use-place-database.test.ts tests/place-normalization.test.ts tests/field-provenance.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/database/places.ts components/app-shell/usePlaceDatabase.ts tests/use-place-database.test.ts
git commit -m "refactor: isolate normalized place database lifecycle"
```

---

### Task 5: Upgrade the Data Quality Dashboard with health coverage

**Files:**
- Modify: `components/DataQualityDashboard.tsx`
- Create: `tests/data-quality-dashboard.test.ts`

**Interfaces:**
- Consumes: existing `buildDataCompletenessDashboard()` and new `buildDataHealthSummary()`.
- Produces: local-only coverage/status cards and review counts while preserving the existing quality score and missing-field cards.

- [ ] **Step 1: Write the failing dashboard rendering test**

Create `tests/data-quality-dashboard.test.ts` without JSX so the existing `.test.ts` Vitest configuration remains unchanged:

```ts
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import { DataQualityDashboard } from "@/components/DataQualityDashboard";

const seed = PLACES[0]!;

describe("DataQualityDashboard", () => {
  it("renders local coverage and review diagnostics", () => {
    render(React.createElement(DataQualityDashboard, {
      language: "th",
      places: [
        { ...seed, id: "a", slug: "a", verified: true, dataStatus: "verified", latitude: 13.82, longitude: 100.58 },
        { ...seed, id: "b", slug: "b", verified: false, dataStatus: "partial", latitude: null, longitude: null, googleMapsUrl: null },
      ],
    }));

    expect(screen.getByTestId("data-health-total")).toHaveTextContent("2");
    expect(screen.getByTestId("data-health-coordinates")).toHaveTextContent("1");
    expect(screen.getByTestId("data-health-review")).toBeInTheDocument();
    expect(screen.getByText(/ไม่ใช้ External API|No external API request/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
npm test -- tests/data-quality-dashboard.test.ts
```

Expected: FAIL because the required `data-health-*` elements are not rendered.

- [ ] **Step 3: Add the health summary to the existing dashboard**

Modify `components/DataQualityDashboard.tsx` to compute both views:

```ts
const quality = useMemo(() => buildDataCompletenessDashboard(places), [places]);
const health = useMemo(() => buildDataHealthSummary(places), [places]);
```

Keep the existing quality average, missing Place ID/photo/hours/phone cards, and grade chips. Add one compact coverage row with these stable test IDs:

```tsx
<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
  <div data-testid="data-health-total" className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
    <p className="text-[18px] font-bold">{health.total}</p>
    <p className="text-[8px] text-white/38">{language === "en" ? "Canonical places" : "ร้านทั้งหมด"}</p>
  </div>
  <div data-testid="data-health-coordinates" className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
    <p className="text-[18px] font-bold">{health.withCoordinates}</p>
    <p className="text-[8px] text-white/38">{language === "en" ? "With coordinates" : "มีพิกัด"}</p>
  </div>
  <div data-testid="data-health-maps" className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
    <p className="text-[18px] font-bold">{health.withMapsLink}</p>
    <p className="text-[8px] text-white/38">Maps link</p>
  </div>
  <div data-testid="data-health-images" className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
    <p className="text-[18px] font-bold">{health.withUsableImage}</p>
    <p className="text-[8px] text-white/38">{language === "en" ? "Usable image" : "มีรูปใช้งานได้"}</p>
  </div>
  <div data-testid="data-health-review" className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
    <p className="text-[18px] font-bold">{health.needsReview}</p>
    <p className="text-[8px] text-white/38">{language === "en" ? "Needs review" : "ควรตรวจสอบ"}</p>
  </div>
</div>
```

Also add a small status line showing `verified / partial / stale / unverified` and duplicate candidate count. Do not add buttons that call Google from this component.

- [ ] **Step 4: Run dashboard and health tests**

Run:

```bash
npm test -- tests/data-quality-dashboard.test.ts tests/data-health.test.ts tests/data-quality.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/DataQualityDashboard.tsx tests/data-quality-dashboard.test.ts
git commit -m "feat: surface place data health coverage"
```

---

### Task 6: Integrate the stable core into AroundMyDormApp and lock regressions

**Files:**
- Modify: `components/AroundMyDormApp.tsx`
- Modify: `tests/app-shell-architecture.test.ts`

**Interfaces:**
- Consumes: `usePlaceDatabase()` and `deriveDiscoveryState()` from Tasks 3–4.
- Preserves: existing props, routes, favorites/recent/collections behavior, map/session behavior, Data Management callback contract, Google load gate, and current visible-place semantics.
- Produces: a thinner shell with database lifecycle and discovery derivation removed from inline component code.

- [ ] **Step 1: Tighten the architecture test before editing the shell**

Extend `tests/app-shell-architecture.test.ts` with a failing test:

```ts
it("delegates database lifecycle and discovery derivation to V2 core modules", () => {
  expect(source).toContain('@/components/app-shell/usePlaceDatabase');
  expect(source).toContain('@/lib/discovery/derive-visible-places');
  expect(source).not.toContain('async function reloadDatabase()');
  expect(source).not.toContain('filterPlacesInSearchArea(base');
});
```

Keep the existing maintenance ceiling and existing extracted-ranking/primitives checks.

- [ ] **Step 2: Run the architecture test and confirm RED**

Run:

```bash
npm test -- tests/app-shell-architecture.test.ts
```

Expected: FAIL because `AroundMyDormApp` still owns database reload and discovery filtering.

- [ ] **Step 3: Replace inline database lifecycle with the hook**

In `components/AroundMyDormApp.tsx`:

Remove the direct `loadPlacesFromDatabase` import and import:

```ts
import { usePlaceDatabase } from "@/components/app-shell/usePlaceDatabase";
```

Replace these shell-owned states/functions:

```ts
const [loadingPlaces, setLoadingPlaces] = useState(true);
const [databasePlaces, setDatabasePlaces] = useState<Place[]>([]);
const [databaseSource, setDatabaseSource] = useState("supabase");
async function reloadDatabase() { /* current implementation */ }
useEffect(() => { void reloadDatabase(); }, []);
```

with:

```ts
const {
  places: databasePlaces,
  databaseSource,
  loading: loadingPlaces,
  error: databaseError,
  warning: databaseWarning,
  reload: reloadDatabase,
} = usePlaceDatabase();
```

Preserve current user feedback with a small effect after `showToast` remains available as a function declaration:

```ts
useEffect(() => {
  if (databaseError) {
    setCloudError(databaseError);
    showToast(
      settings.language === "en"
        ? `Cloud database unavailable: ${databaseError}`
        : `ฐานข้อมูล Cloud ใช้งานไม่ได้: ${databaseError}`,
      "removed",
    );
    return;
  }
  if (databaseWarning) showToast(databaseWarning, "removed");
}, [databaseError, databaseWarning, settings.language]);
```

Do not clear unrelated cloud-profile errors from this effect.

- [ ] **Step 4: Replace inline discovery derivation with the shared engine**

Remove the direct `filterPlacesInSearchArea` import and add:

```ts
import { deriveDiscoveryState } from "@/lib/discovery/derive-visible-places";
```

Keep `recommendationContext` as a memo derived from preferred categories, favorites, and recents. Replace the current separate `allPlaces` and `visiblePlaces` memos with:

```ts
const { allPlaces, visiblePlaces } = useMemo(
  () => deriveDiscoveryState({
    places: databasePlaces,
    origin,
    category,
    query: debouncedQuery,
    filters,
    radiusMeters,
    mapSearchCenter,
    originMode,
    sortMode,
    verifiedOnly: settings.verifiedOnly,
    recommendationContext,
  }),
  [
    databasePlaces,
    origin,
    category,
    debouncedQuery,
    filters,
    radiusMeters,
    mapSearchCenter,
    originMode,
    sortMode,
    settings.verifiedOnly,
    recommendationContext,
  ],
);
```

Do not change favorite-place reconciliation, recent resolution, quick filters, map selection, or collection behavior in this task.

- [ ] **Step 5: Run focused architecture/core regressions**

Run:

```bash
npm test -- \
  tests/place-normalization.test.ts \
  tests/data-health.test.ts \
  tests/discovery-engine.test.ts \
  tests/use-place-database.test.ts \
  tests/data-quality-dashboard.test.ts \
  tests/app-shell-architecture.test.ts \
  tests/place-ranking.test.ts \
  tests/data-quality.test.ts \
  tests/google-api-control.test.ts \
  tests/google-api-lock.test.ts \
  tests/data-management-admin-gate.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the complete Phase 1 verification gate**

Run in this order:

```bash
npm run lint
npm run typecheck
npm run validate:data
npm test
npm run build
npx playwright test \
  e2e/manual-google-maps.spec.ts \
  e2e/map-functional.spec.ts \
  e2e/p0-google-api-lock.spec.ts
npx wrangler deploy --dry-run
```

Expected results:

- ESLint exits 0.
- TypeScript exits 0.
- Data validation exits 0 without newly introduced invalid canonical records.
- Full Vitest suite passes.
- Next.js production build passes.
- Playwright verifies normal Home/Map browsing still initializes zero Google Maps/Places requests before explicit load and map behavior remains functional.
- Google API hard-lock E2E remains green.
- Wrangler dry-run succeeds; do not deploy production in Phase 1 unless separately authorized.

If a regression test exposes existing stale text selectors in `e2e/manual-google-maps.spec.ts`, update only the selector to match the already-rendered explicit manual-load copy; do not weaken the request-count assertions (`mapsJs === 0`, `places === 0`).

- [ ] **Step 7: Commit the integration**

```bash
git add components/AroundMyDormApp.tsx tests/app-shell-architecture.test.ts
git commit -m "refactor: establish v2 stable core and data health"
```

---

## Phase 1 Completion Gate

Phase 1 is complete only when all of the following are true:

- Every database-loaded record passes through `normalizePlaces()` exactly once at the final read boundary.
- `AroundMyDormApp` no longer owns raw database fetch lifecycle logic.
- `AroundMyDormApp` no longer implements the core category/query/filter/radius/sort pipeline inline.
- Home/Explore/Map consumers still receive the same stored-data semantics as before this phase.
- Data Management shows local data-health coverage and duplicate/review diagnostics without external requests.
- No destructive deduplication is introduced.
- Existing Google API lock, admin gate, and explicit map-load rules remain green.
- Full lint, typecheck, data validation, Vitest, production build, targeted Playwright, and Wrangler dry-run gates pass.

## Deferred to Separate Plans

The following approved V2 work is intentionally not implemented by this Phase 1 plan and receives its own implementation plan after Phase 1 is green:

1. Places Expansion and controlled import completeness work.
2. Map V2 presentation, category markers, richer selected-place sheet, split-pane desktop behavior, and stored-first Search This Area UX.
3. Premium UI V2 visual redesign and responsive/motion pass.
4. Performance profiling, broad visual/E2E regression hardening, and production deployment/post-deploy verification.
