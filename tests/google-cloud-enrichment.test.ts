import { describe, expect, it } from "vitest";
import { mergeGoogleCloudPayload, sanitizeGoogleLiveDetails } from "@/lib/google-cloud-enrichment";
import type { GoogleLiveDetails } from "@/lib/google-live";
import type { Place } from "@/types/place";

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: "p1", googlePlaceId: null, name: "Local Cafe", nameEn: null, slug: "local-cafe", category: "cafe", categories: ["cafe"], subcategory: null,
    shortDescription: "", description: "", address: null, area: "ลาดพร้าว", soi: null, latitude: null, longitude: null,
    distanceKm: null, walkingMinutes: null, drivingMinutes: null,
    openingHours: { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null }, is24Hours: false,
    priceLevel: null, priceText: null, averagePricePerPerson: null, minPrice: null, maxPrice: null,
    popularMenus: [], recommendedItems: [], tags: [], rating: null, reviewCount: null,
    phone: null, line: null, facebook: null, instagram: null, website: null, googleMapsUrl: null,
    image: null, images: [], paymentMethods: [], delivery: null, deliveryApps: [], dineIn: null, takeaway: null,
    parking: { available: null, type: null, price: null, note: null }, airConditioned: null, wifi: null, powerOutlet: null, toilet: null, petFriendly: null, wheelchairAccessible: null, openLate: null,
    studentFriendly: null, goodForWorking: null, recommended: false, localFavorite: false, verified: false, lastVerified: null, source: ["seed"], notes: null,
    ...overrides,
  };
}

const payload = {
  address: "123 Lat Phrao, Bangkok",
  latitude: 13.82,
  longitude: 100.58,
  rating: 4.6,
  reviewCount: 321,
  openNow: true,
  openingHoursText: ["Monday: 08:00–20:00"],
  phone: "02-000-0000",
  website: "https://example.com",
  googleMapsUrl: "https://maps.google.com/?cid=1",
  priceLevel: "PRICE_LEVEL_MODERATE",
  businessStatus: "OPERATIONAL",
  fetchedAt: "2026-09-12T04:00:00.000Z",
};

describe("Google cloud enrichment", () => {
  it("fills missing fields without overwriting existing local values", () => {
    const merged = mergeGoogleCloudPayload(place({ rating: 4.9, phone: "LOCAL-PHONE" }), "g1", payload);
    expect(merged.googlePlaceId).toBe("g1");
    expect(merged.address).toBe(payload.address);
    expect(merged.latitude).toBe(payload.latitude);
    expect(merged.rating).toBe(4.9);
    expect(merged.phone).toBe("LOCAL-PHONE");
    expect(merged.website).toBe(payload.website);
    expect(merged.source).toContain("google_places_live");
  });

  it("does not put Google name or photo URL into the cloud payload", () => {
    const live: GoogleLiveDetails = {
      googlePlaceId: "g1", name: "Google Name", photoUrl: "https://photo.example/1", ...payload,
    };
    const cached = sanitizeGoogleLiveDetails(live) as Record<string, unknown>;
    expect(cached.name).toBeUndefined();
    expect(cached.photoUrl).toBeUndefined();
    expect(cached.googleMapsUrl).toBe(payload.googleMapsUrl);
  });
});
