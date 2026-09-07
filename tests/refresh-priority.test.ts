import { describe, expect, it } from "vitest";
import { buildRefreshQueue, recommendedRefreshPlaces, scoreRefreshPriority } from "@/lib/refresh-priority";
import type { Place } from "@/types/place";

const DAY = 86_400_000;
const NOW = new Date("2026-09-08T00:00:00.000Z").getTime();

function makePlace(overrides: Partial<Place> = {}): Place {
  return {
    id: "p1", googlePlaceId: "g1", name: "Refresh Test", nameEn: null, slug: "refresh-test", category: "cafe", categories: ["cafe"], subcategory: null,
    shortDescription: "", description: "", address: "Lat Phrao Bangkok", area: "Lat Phrao", soi: null, latitude: 13.82, longitude: 100.58,
    distanceKm: null, walkingMinutes: null, drivingMinutes: null, openingHours: { monday: "08:00-20:00", tuesday: "08:00-20:00", wednesday: "08:00-20:00", thursday: "08:00-20:00", friday: "08:00-20:00", saturday: "08:00-20:00", sunday: "08:00-20:00" }, is24Hours: false,
    priceLevel: 1, priceText: "60-100 THB", averagePricePerPerson: 80, minPrice: 60, maxPrice: 100, popularMenus: [], recommendedItems: [], tags: [], rating: 4.5, reviewCount: 120,
    phone: "021234567", line: null, facebook: null, instagram: null, website: "https://example.com", googleMapsUrl: null, image: null, images: [], paymentMethods: [], delivery: null, deliveryApps: [], dineIn: null, takeaway: null,
    parking: { available: null, type: null, price: null, note: null }, airConditioned: null, wifi: null, powerOutlet: null, toilet: null, petFriendly: null, wheelchairAccessible: null, openLate: null,
    studentFriendly: null, goodForWorking: null, recommended: false, localFavorite: false, verified: true, lastVerified: new Date(NOW - 10 * DAY).toISOString(), lastChecked: new Date(NOW - 10 * DAY).toISOString(), source: ["seed"], notes: null,
    ...overrides,
  };
}

describe("Smart Refresh Queue", () => {
  it("puts a temporary closure in CRITICAL", () => {
    const item = scoreRefreshPriority(makePlace({ temporaryClosed: true }), NOW);
    expect(item.priority).toBe("critical");
    expect(item.factors.possibleClosure).toBe(1);
  });

  it("orders older records ahead of younger records when otherwise equal", () => {
    const older90 = makePlace({ id: "old", lastChecked: new Date(NOW - 100 * DAY).toISOString(), lastVerified: new Date(NOW - 100 * DAY).toISOString() });
    const older60 = makePlace({ id: "mid", lastChecked: new Date(NOW - 70 * DAY).toISOString(), lastVerified: new Date(NOW - 70 * DAY).toISOString() });
    const older30 = makePlace({ id: "young", lastChecked: new Date(NOW - 40 * DAY).toISOString(), lastVerified: new Date(NOW - 40 * DAY).toISOString() });
    const queue = buildRefreshQueue([older30, older60, older90], NOW);
    expect(queue.items.map((item) => item.place.id)).toEqual(["old", "mid", "young"]);
    expect(queue.items[0].score).toBeGreaterThan(queue.items[2].score);
  });

  it("raises priority score when key data is missing", () => {
    const complete = scoreRefreshPriority(makePlace(), NOW);
    const incomplete = scoreRefreshPriority(makePlace({ address: null, phone: null, priceText: null, minPrice: null, maxPrice: null, averagePricePerPerson: null }), NOW);
    expect(incomplete.score).toBeGreaterThan(complete.score);
    expect(incomplete.missingFields).toContain("address");
    expect(incomplete.missingFields).toContain("price");
  });

  it("keeps missing Place IDs in the local queue but out of Google Place Details recommendations", () => {
    const missing = makePlace({ id: "missing", googlePlaceId: null, lastChecked: new Date(NOW - 120 * DAY).toISOString() });
    const linked = makePlace({ id: "linked", googlePlaceId: "g-linked", lastChecked: new Date(NOW - 120 * DAY).toISOString() });
    const queue = buildRefreshQueue([missing, linked], NOW);
    expect(queue.items.some((item) => item.place.id === "missing")).toBe(true);
    expect(recommendedRefreshPlaces([missing, linked], 50, NOW).map((place) => place.id)).toEqual(["linked"]);
  });

  it("is deterministic for identical inputs", () => {
    const a = makePlace({ id: "a", name: "Alpha", lastChecked: new Date(NOW - 100 * DAY).toISOString() });
    const b = makePlace({ id: "b", name: "Beta", lastChecked: new Date(NOW - 100 * DAY).toISOString() });
    expect(buildRefreshQueue([b, a], NOW).items.map((item) => item.place.id)).toEqual(buildRefreshQueue([b, a], NOW).items.map((item) => item.place.id));
  });
});
