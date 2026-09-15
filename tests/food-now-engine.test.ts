import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import { rankFoodNow } from "@/lib/discovery/food-now";
import type { Place } from "@/types/place";

const seed = PLACES.find((place) => place.categories.includes("food")) ?? PLACES[0]!;
const now = new Date("2026-09-14T20:00:00+07:00");

function foodPlace(id: string, overrides: Partial<Place> = {}): Place {
  return {
    ...seed,
    id,
    slug: id,
    name: id,
    category: "food",
    categories: ["food"],
    distanceKm: 0.4,
    liveOpenNow: true,
    openLate: true,
    placeType: "local",
    localFavorite: true,
    verified: true,
    pricing: {
      type: "range",
      min: 50,
      max: 80,
      fixed: null,
      unit: null,
      currency: "THB",
      displayText: null,
      verifiedAt: null,
    },
    ...overrides,
  };
}

describe("Food Now deterministic engine", () => {
  it("treats strict Unknown distance, price, and open status as not satisfying requested constraints", () => {
    const known = foodPlace("known");
    const unknownDistance = foodPlace("unknown-distance", { distanceKm: null });
    const unknownPrice = foodPlace("unknown-price", {
      pricing: undefined,
      minPrice: null,
      maxPrice: null,
      averagePricePerPerson: null,
      priceText: "",
    });
    const unknownOpen = foodPlace("unknown-open", {
      liveOpenNow: null,
      is24Hours: false,
      structuredOpeningHours: undefined,
      openingHours: undefined,
      openingHoursText: null,
    });

    const picks = rankFoodNow(
      [unknownDistance, unknownPrice, unknownOpen, known],
      { budget: 100, radiusMeters: 1000, localOnly: false, openNow: true, lateOnly: false, verifiedOnly: false },
      { now },
    );

    expect(picks.map((pick) => pick.place.id)).toEqual(["known"]);
  });

  it("returns the same deterministic order for the same inputs and uses stable tie breakers", () => {
    const places = [
      foodPlace("c", { distanceKm: 0.7 }),
      foodPlace("b", { distanceKm: 0.3 }),
      foodPlace("a", { distanceKm: 0.3 }),
    ];
    const criteria = { budget: null, radiusMeters: 2000, localOnly: false, openNow: false, lateOnly: false, verifiedOnly: false };

    const first = rankFoodNow(places, criteria, { now }).map((pick) => pick.place.id);
    const second = rankFoodNow([...places].reverse(), criteria, { now }).map((pick) => pick.place.id);

    expect(first).toEqual(second);
    expect(first.indexOf("a")).toBeLessThan(first.indexOf("b"));
    expect(first.indexOf("b")).toBeLessThan(first.indexOf("c"));
  });

  it("honors LOCAL/late/verified constraints and returns at most five explainable options", () => {
    const places = [
      foodPlace("local-1"),
      foodPlace("local-2", { distanceKm: 0.5 }),
      foodPlace("local-3", { distanceKm: 0.6 }),
      foodPlace("local-4", { distanceKm: 0.7 }),
      foodPlace("local-5", { distanceKm: 0.8 }),
      foodPlace("local-6", { distanceKm: 0.9 }),
      foodPlace("chain", { placeType: "chain", localFavorite: false }),
      foodPlace("not-late", { openLate: false, is24Hours: false }),
      foodPlace("unverified", { verified: false }),
    ];

    const picks = rankFoodNow(
      places,
      { budget: 100, radiusMeters: 1500, localOnly: true, openNow: true, lateOnly: true, verifiedOnly: true },
      { now },
    );

    expect(picks).toHaveLength(5);
    expect(picks.every((pick) => pick.place.id.startsWith("local-"))).toBe(true);
    expect(picks.every((pick) => pick.reasonLine.length > 0)).toBe(true);
    expect(picks.every((pick) => !/unknown|ไม่ทราบ|เดา/i.test(pick.reasonLine))).toBe(true);
  });
});
