import { describe, expect, it } from "vitest";
import { RADII } from "@/lib/app-shell-config";
import { buildPlatformDiagnostics, filterPlacesInSearchArea } from "@/lib/hybrid-map-platform";
import { googleMapsPlaceUrl } from "@/lib/google-maps-links";
import type { Place } from "@/types/place";

function place(id: string, overrides: Partial<Place> = {}): Place {
  return {
    id, googlePlaceId: null, name: id, nameEn: null, slug: id, category: "food", categories: ["food"], subcategory: null,
    shortDescription: "", description: "", address: null, area: "Bangkok", soi: null, latitude: null, longitude: null,
    distanceKm: null, walkingMinutes: null, drivingMinutes: null,
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

describe("hybrid map platform", () => {
  it("exposes only the approved radius presets", () => {
    expect(RADII.map((item) => item.value)).toEqual([500, 1000, 2000, 3000, 5000]);
  });

  it("uses one visible-place search-area function for list and map domains", () => {
    const center = { lat: 13.82, lng: 100.58 };
    const near = place("near", { latitude: 13.8205, longitude: 100.5805 });
    const far = place("far", { latitude: 13.86, longitude: 100.62 });
    const missing = place("missing");
    const visible = filterPlacesInSearchArea([near, far, missing], center, 1000);
    expect(visible.map((item) => item.id)).toEqual(["near"]);
  });

  it("builds a Google Maps URL from the strongest available identity and falls back safely", () => {
    const linked = place("linked", { googlePlaceId: "ChIJ123", googleMapsUrl: null });
    const coords = place("coords", { latitude: 13.82, longitude: 100.58 });
    const textOnly = place("text-only", { name: "Cafe Test", address: "Lat Phrao Bangkok" });
    expect(googleMapsPlaceUrl(linked)).toContain("query_place_id=ChIJ123");
    expect(googleMapsPlaceUrl(coords)).toContain("13.82%2C100.58");
    expect(googleMapsPlaceUrl(textOnly)).toContain("Cafe+Test");
  });

  it("reports admin coverage diagnostics including duplicate Place IDs and route coverage", () => {
    const places = [
      place("a", { googlePlaceId: "g1", latitude: 13.82, longitude: 100.58, walkingMinutes: 4 }),
      place("b", { googlePlaceId: "g1", latitude: 13.821, longitude: 100.581 }),
      place("c"),
    ];
    const diagnostics = buildPlatformDiagnostics(places);
    expect(diagnostics.total).toBe(3);
    expect(diagnostics.matched).toBe(2);
    expect(diagnostics.coordinates).toBe(2);
    expect(diagnostics.markers).toBe(2);
    expect(diagnostics.missingCoordinates).toBe(1);
    expect(diagnostics.duplicateGooglePlaceIds).toEqual(["g1"]);
    expect(diagnostics.routePlaces).toBe(1);
  });
});