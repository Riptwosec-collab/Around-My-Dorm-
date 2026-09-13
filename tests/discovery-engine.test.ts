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
    expect(result.visiblePlaces.map((place) => place.id)).toEqual(["near food", "near cafe"]);

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
