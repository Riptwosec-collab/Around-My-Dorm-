import { describe, expect, it } from "vitest";
import { mergeRouteCacheIntoPlaces, type RouteCacheRow } from "@/lib/route-cache";
import type { Place } from "@/types/place";

function place(): Place {
  return {
    id: "p1", googlePlaceId: "g1", name: "Shop", nameEn: null, slug: "shop", category: "food", categories: ["food"], subcategory: null,
    shortDescription: "", description: "", address: null, area: "จันทรเกษม", soi: null, latitude: 13.82, longitude: 100.58,
    distanceKm: 0.8, straightLineDistanceKm: 0.8, walkingMinutes: null, drivingMinutes: null,
    distance: { straightLineMeters: 800, walkingDistanceMeters: null, walkingMinutes: null, motorcycleDistanceMeters: null, motorcycleMinutes: null, drivingDistanceMeters: null, drivingMinutes: null },
    openingHours: { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null }, is24Hours: false,
    priceLevel: null, priceText: null, averagePricePerPerson: null, minPrice: null, maxPrice: null,
    popularMenus: [], recommendedItems: [], tags: [], rating: null, reviewCount: null,
    phone: null, line: null, facebook: null, instagram: null, website: null, googleMapsUrl: null,
    image: null, images: [], paymentMethods: [], delivery: null, deliveryApps: [], dineIn: null, takeaway: null,
    parking: { available: null, type: null, price: null, note: null }, airConditioned: null, wifi: null, powerOutlet: null, toilet: null, petFriendly: null, wheelchairAccessible: null, openLate: null,
    studentFriendly: null, goodForWorking: null, recommended: false, localFavorite: false, verified: false, lastVerified: null, source: ["seed"], notes: null,
  };
}

const rows: RouteCacheRow[] = [
  { origin_id: "baan-supha-apartment", place_id: "p1", travel_mode: "WALK", distance_meters: 920, duration_seconds: 660, status: "ROUTE_EXISTS", fetched_at: "2026-09-12T08:00:00Z", expires_at: "2026-10-01T00:00:00Z" },
  { origin_id: "baan-supha-apartment", place_id: "p1", travel_mode: "DRIVE", distance_meters: 1200, duration_seconds: 300, status: "ROUTE_EXISTS", fetched_at: "2026-09-12T08:00:00Z", expires_at: "2026-10-01T00:00:00Z" },
];

describe("route cache", () => {
  it("merges route distances and durations without destroying straight-line distance", () => {
    const merged = mergeRouteCacheIntoPlaces([place()], rows)[0];
    expect(merged.distance?.straightLineMeters).toBe(800);
    expect(merged.distance?.walkingDistanceMeters).toBe(920);
    expect(merged.walkingMinutes).toBe(11);
    expect(merged.distance?.drivingDistanceMeters).toBe(1200);
    expect(merged.drivingMinutes).toBe(5);
    expect(merged.distance?.motorcycleMinutes).toBeNull();
  });

  it("does not invent motorcycle time when TWO_WHEELER data is unavailable", () => {
    const unavailable: RouteCacheRow[] = [{ origin_id: "baan-supha-apartment", place_id: "p1", travel_mode: "TWO_WHEELER", distance_meters: null, duration_seconds: null, status: "ROUTE_NOT_FOUND", fetched_at: "2026-09-12T08:00:00Z", expires_at: "2026-10-01T00:00:00Z" }];
    const merged = mergeRouteCacheIntoPlaces([place()], unavailable)[0];
    expect(merged.distance?.motorcycleMinutes).toBeNull();
  });
});
