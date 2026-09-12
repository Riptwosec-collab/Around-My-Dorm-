import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRuntimeRouteCache,
  loadRouteCache,
  mergeRouteCacheIntoPlaces,
  storeRuntimeRouteResults,
} from "@/lib/route-cache";
import type { Place } from "@/types/place";

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: "p1", googlePlaceId: null, name: "Test", nameEn: null, slug: "test", category: "food", categories: ["food"], subcategory: null,
    shortDescription: "", description: "", address: null, area: "Bangkok", soi: null, latitude: 13.82, longitude: 100.58,
    distanceKm: 0.5, walkingMinutes: null, drivingMinutes: null,
    openingHours: { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null }, is24Hours: false,
    priceLevel: null, priceText: null, averagePricePerPerson: null, minPrice: null, maxPrice: null,
    popularMenus: [], recommendedItems: [], tags: [], rating: null, reviewCount: null,
    phone: null, line: null, facebook: null, instagram: null, website: null, googleMapsUrl: null,
    image: null, images: [], paymentMethods: [], delivery: null, deliveryApps: [], dineIn: null, takeaway: null,
    parking: { available: null, type: null, price: null, note: null }, airConditioned: null, wifi: null, powerOutlet: null, toilet: null,
    petFriendly: null, wheelchairAccessible: null, openLate: null, studentFriendly: null, goodForWorking: null,
    recommended: false, localFavorite: false, verified: false, lastVerified: null, source: ["seed"], notes: null,
    ...overrides,
  };
}

describe("Google Routes runtime store", () => {
  beforeEach(() => clearRuntimeRouteCache());

  it("stores route results only in runtime memory and merges them into places", async () => {
    storeRuntimeRouteResults("baan-supha-apartment", [
      { placeId: "p1", mode: "WALK", distanceMeters: 640, durationSeconds: 480, statusCode: 0, statusMessage: null, condition: "ROUTE_EXISTS" },
      { placeId: "p1", mode: "DRIVE", distanceMeters: 900, durationSeconds: 240, statusCode: 0, statusMessage: null, condition: "ROUTE_EXISTS" },
    ]);
    const rows = await loadRouteCache();
    expect(rows).toHaveLength(2);
    const merged = mergeRouteCacheIntoPlaces([place()], rows)[0];
    expect(merged.distance?.walkingDistanceMeters).toBe(640);
    expect(merged.walkingMinutes).toBe(8);
    expect(merged.distance?.drivingDistanceMeters).toBe(900);
    expect(merged.drivingMinutes).toBe(4);
  });

  it("can be cleared completely without touching cloud persistence", async () => {
    storeRuntimeRouteResults("baan-supha-apartment", [
      { placeId: "p1", mode: "TWO_WHEELER", distanceMeters: 800, durationSeconds: 180, statusCode: 0, statusMessage: null, condition: "ROUTE_EXISTS" },
    ]);
    expect((await loadRouteCache()).length).toBe(1);
    clearRuntimeRouteCache();
    expect(await loadRouteCache()).toEqual([]);
  });
});