import { describe, expect, it } from "vitest";
import { assessGooglePlaceMatch, auditExistingPlaceIds, placeIdCoverageSummary } from "@/lib/google-place-id-manager";
import type { Place } from "@/types/place";
import type { GoogleDiscoveryCandidate } from "@/lib/google-live";

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: "p1", googlePlaceId: null, name: "THER CAFE & Bistro", nameEn: null, slug: "ther", category: "cafe", categories: ["cafe"], subcategory: null,
    shortDescription: "", description: "", address: "Lat Phrao 41 Bangkok", area: "Lat Phrao", soi: "41", latitude: 13.82, longitude: 100.58,
    distanceKm: null, walkingMinutes: null, drivingMinutes: null, openingHours: { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null }, is24Hours: false,
    priceLevel: null, priceText: null, averagePricePerPerson: null, minPrice: null, maxPrice: null, popularMenus: [], recommendedItems: [], tags: [], rating: null, reviewCount: null,
    phone: null, line: null, facebook: null, instagram: null, website: null, googleMapsUrl: null, image: null, images: [], paymentMethods: [], delivery: null, deliveryApps: [], dineIn: null, takeaway: null,
    parking: { available: null, type: null, price: null, note: null }, airConditioned: null, wifi: null, powerOutlet: null, toilet: null, petFriendly: null, wheelchairAccessible: null, openLate: null,
    studentFriendly: null, goodForWorking: null, recommended: false, localFavorite: false, verified: false, lastVerified: null, source: ["seed"], notes: null, ...overrides,
  };
}

function candidate(overrides: Partial<GoogleDiscoveryCandidate> = {}): GoogleDiscoveryCandidate {
  return { googlePlaceId: "g1", name: "THER CAFE & Bistro", address: "Lat Phrao 41 Bangkok", latitude: 13.82005, longitude: 100.58005, primaryType: "cafe", primaryTypeLabel: "Cafe", rating: null, reviewCount: null, openNow: null, googleMapsUrl: "https://maps.google.com/", fetchedAt: new Date().toISOString(), ...overrides };
}

describe("Google Place ID integrity", () => {
  it("uses actual records for coverage", () => {
    const places = [place(), place({ id: "p2", googlePlaceId: "g2" })];
    const summary = placeIdCoverageSummary(places);
    expect(summary.total).toBe(2);
    expect(summary.missing).toBe(1);
    expect(summary.linked).toBe(1);
  });

  it("detects duplicate Google Place IDs locally without Google", () => {
    const places = [place({ googlePlaceId: "g1" }), place({ id: "p2", googlePlaceId: "g1" })];
    expect(auditExistingPlaceIds(places).some((issue) => issue.kind === "duplicate_google_place_id")).toBe(true);
  });

  it("scores a close matching candidate highly", () => {
    const local = place();
    const result = assessGooglePlaceMatch(local, candidate(), [local]);
    expect(result.confidence).toBeGreaterThanOrEqual(85);
    expect(result.hardBlocked).toBe(false);
  });

  it("blocks a same-name chain branch that is far away", () => {
    const local = place({ name: "7-Eleven Lat Phrao 41", placeType: "chain", address: "Lat Phrao 41 Bangkok" });
    const remote = candidate({ name: "7-Eleven Lat Phrao 41", address: "Lat Phrao 101 Bangkok", latitude: 13.9, longitude: 100.65, primaryType: "convenience_store" });
    const result = assessGooglePlaceMatch(local, remote, [local]);
    expect(result.isChain).toBe(true);
    expect(result.chainSafetyPassed).toBe(false);
    expect(result.hardBlocked).toBe(true);
  });

  it("blocks linking a Google Place ID already used by another local record", () => {
    const local = place();
    const other = place({ id: "p2", googlePlaceId: "g1" });
    const result = assessGooglePlaceMatch(local, candidate({ googlePlaceId: "g1" }), [local, other]);
    expect(result.duplicateGooglePlaceId).toBe(true);
    expect(result.hardBlocked).toBe(true);
  });
});
