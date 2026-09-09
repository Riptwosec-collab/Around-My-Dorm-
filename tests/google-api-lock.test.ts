import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGoogleApiControlSettings, resetGoogleApiControlMemoryForTests, saveGoogleApiControlSettings } from "@/lib/google-api-control";
import { resetGoogleRequestMemoryForTests, runGoogleRequestBatch, runGoogleTextSearchRequest } from "@/lib/google-request-manager";
import type { Place } from "@/types/place";

function linkedPlace(): Place {
  return {
    id: "lock-test", googlePlaceId: "g-lock", name: "Lock Test", nameEn: null, slug: "lock-test", category: "cafe", categories: ["cafe"], subcategory: null,
    shortDescription: "", description: "", address: "Bangkok", area: "Bangkok", soi: null, latitude: 13.8, longitude: 100.5, distanceKm: null, walkingMinutes: null, drivingMinutes: null,
    openingHours: { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null }, is24Hours: false, priceLevel: null, priceText: null,
    averagePricePerPerson: null, minPrice: null, maxPrice: null, popularMenus: [], recommendedItems: [], tags: [], rating: null, reviewCount: null, phone: null, line: null, facebook: null,
    instagram: null, website: null, googleMapsUrl: null, image: null, images: [], paymentMethods: [], delivery: null, deliveryApps: [], dineIn: null, takeaway: null, parking: { available: null, type: null, price: null, note: null },
    airConditioned: null, wifi: null, powerOutlet: null, toilet: null, petFriendly: null, wheelchairAccessible: null, openLate: null, studentFriendly: null, goodForWorking: null,
    recommended: false, localFavorite: false, verified: false, lastVerified: null, source: ["test"], notes: null,
  };
}

describe("Google API hard request lock", () => {
  beforeEach(() => {
    resetGoogleApiControlMemoryForTests();
    resetGoogleRequestMemoryForTests();
    vi.restoreAllMocks();
  });

  it("persists locked state", () => {
    saveGoogleApiControlSettings({ locked: true });
    expect(getGoogleApiControlSettings().locked).toBe(true);
  });

  it("blocks Place Details before any network call", async () => {
    saveGoogleApiControlSettings({ locked: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(runGoogleRequestBatch({ apiKey: "test", places: [linkedPlace()], safetyLimit: 1 })).rejects.toThrow(/locked/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks Text Search before any network call", async () => {
    saveGoogleApiControlSettings({ locked: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(runGoogleTextSearchRequest({ apiKey: "test", query: "cafe", center: { lat: 13.8, lng: 100.5 }, radiusMeters: 1000 })).rejects.toThrow(/locked/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
