import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS } from "@/components/FilterSheet";
import { PLACES } from "@/data/places";
import { deriveDiscoveryState, type DiscoveryInput } from "@/lib/discovery/derive-visible-places";
import { parseDiscoveryQuery } from "@/lib/discovery/query-intent";
import type { Place } from "@/types/place";

const seed = PLACES[0]!;
const origin = { lat: 13.82, lng: 100.58 };

function candidate(id: string, overrides: Partial<Place> = {}): Place {
  return {
    ...seed,
    id,
    slug: id,
    name: id,
    category: "cafe",
    categories: ["cafe"],
    latitude: 13.82,
    longitude: 100.58,
    verified: true,
    ...overrides,
  };
}

function input(places: Place[] = [candidate("near")]): DiscoveryInput {
  return {
    places,
    origin,
    category: "all",
    query: "",
    queryIntent: parseDiscoveryQuery(""),
    filters: EMPTY_FILTERS,
    radiusMeters: 500,
    mapSearchCenter: origin,
    originMode: "dorm",
    sortMode: "distanceAsc",
    verifiedOnly: false,
    recommendationContext: {},
  } as DiscoveryInput;
}

describe("shared discovery engine", () => {
  it("applies distance, category, query and radius semantics in one derivation", () => {
    const result = deriveDiscoveryState(input([
      candidate("near cafe", { latitude: 13.8201, longitude: 100.5801 }),
      candidate("far cafe", { latitude: 13.90, longitude: 100.70 }),
      candidate("near food", { category: "food", categories: ["food"] }),
    ]));

    expect(result.allPlaces).toHaveLength(3);
    expect(result.visiblePlaces.map((place) => place.id)).toEqual(["near food", "near cafe"]);

    const cafes = deriveDiscoveryState({
      ...input(result.allPlaces),
      category: "cafe",
      query: "near",
      queryIntent: parseDiscoveryQuery("near"),
    } as DiscoveryInput);
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

  it("applies natural query intent locally", () => {
    const cheap = candidate("cheap open cafe", {
      pricing: { ...seed.pricing, min: 50, max: 80, fixed: null, displayText: "฿50–80" },
    });
    const expensive = candidate("expensive cafe", {
      pricing: { ...seed.pricing, min: 150, max: 180, fixed: null, displayText: "฿150–180" },
    });
    const query = "กาแฟไม่เกิน 100";
    const result = deriveDiscoveryState({
      ...input([cheap, expensive]),
      query,
      queryIntent: parseDiscoveryQuery(query),
    } as DiscoveryInput);
    expect(result.visiblePlaces.map((place) => place.id)).toEqual(["cheap open cafe"]);
  });

  it("uses only remaining free text and never fabricates walking data", () => {
    const unknownWalking = candidate("ร้านป้าสมใจ", {
      walkingMinutes: null,
      distance: { ...seed.distance, walkingMinutes: null },
    });
    const query = "กาแฟ ร้านป้าสมใจ";
    const result = deriveDiscoveryState({
      ...input([unknownWalking]),
      query,
      queryIntent: parseDiscoveryQuery(query),
    } as DiscoveryInput);
    expect(result.visiblePlaces.map((place) => place.id)).toEqual(["ร้านป้าสมใจ"]);
    expect(result.visiblePlaces[0]?.walkingMinutes).toBeNull();
    expect(result.visiblePlaces[0]?.distance?.walkingMinutes).toBeNull();
  });
});
