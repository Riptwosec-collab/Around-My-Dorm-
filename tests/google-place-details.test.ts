import { describe, expect, it } from "vitest";
import { mergeGoogleCloudPayload, sanitizeGoogleLiveDetails } from "@/lib/google-cloud-enrichment";
import type { GoogleLiveDetails } from "@/lib/google-live";
import type { Place } from "@/types/place";

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: "p-rich", googlePlaceId: null, name: "Curated Shop", nameEn: null, slug: "curated-shop", category: "food", categories: ["food"], subcategory: "manual-category",
    shortDescription: "", description: "", address: null, area: "จันทรเกษม", soi: null, latitude: null, longitude: null,
    distanceKm: null, walkingMinutes: null, drivingMinutes: null,
    openingHours: { monday: null, tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null }, is24Hours: false,
    priceLevel: null, priceText: "50–80 บาท", averagePricePerPerson: null, minPrice: 50, maxPrice: 80,
    popularMenus: [], recommendedItems: [], tags: [], rating: null, reviewCount: null,
    phone: "02-111-2222", line: null, facebook: null, instagram: null, website: null, googleMapsUrl: null,
    image: "https://owned.example/cover.jpg", images: ["https://owned.example/cover.jpg"], paymentMethods: [], delivery: null, deliveryApps: [], dineIn: null, takeaway: null,
    parking: { available: true, type: "manual", price: "20 บาท", note: "จอดข้างร้านหลัง 18:00" }, airConditioned: null, wifi: null, powerOutlet: null, toilet: null, petFriendly: null, wheelchairAccessible: null, openLate: null,
    studentFriendly: null, goodForWorking: null, recommended: false, localFavorite: true, hiddenGem: true, verified: false, lastVerified: null, source: ["manual_verified"], notes: "manual note",
    ...overrides,
  };
}

const live: GoogleLiveDetails = {
  googlePlaceId: "g-rich",
  name: "Google Shop",
  address: "Google verified address",
  shortAddress: "Ratchada 36",
  latitude: 13.82,
  longitude: 100.58,
  rating: 4.7,
  reviewCount: 567,
  openNow: true,
  openingHoursText: ["Monday: 08:00–22:00"],
  phone: "02-999-9999",
  internationalPhone: "+66 2 999 9999",
  website: "https://shop.example",
  googleMapsUrl: "https://maps.google.com/?cid=rich",
  photoUrl: "https://google-photo.example/transient",
  priceLevel: "PRICE_LEVEL_MODERATE",
  businessStatus: "OPERATIONAL",
  types: ["restaurant", "food"],
  primaryType: "restaurant",
  hasDelivery: true,
  hasDineIn: true,
  hasTakeout: true,
  isReservable: false,
  hasCurbsidePickup: null,
  accessibility: { wheelchairAccessibleEntrance: true, wheelchairAccessibleParking: null, wheelchairAccessibleRestroom: true, wheelchairAccessibleSeating: true },
  parkingOptions: { freeParkingLot: true, paidParkingLot: false, freeStreetParking: null, paidStreetParking: null, freeGarageParking: null, paidGarageParking: null, valetParking: false },
  paymentOptions: { cashOnly: false, creditCards: true, debitCards: true, nfc: true },
  fetchedAt: "2026-09-12T08:00:00Z",
};

describe("rich Google Place details", () => {
  it("preserves curated values while filling missing verified fields", () => {
    const merged = mergeGoogleCloudPayload(place(), "g-rich", sanitizeGoogleLiveDetails(live));
    expect(merged.priceText).toBe("50–80 บาท");
    expect(merged.parking.note).toBe("จอดข้างร้านหลัง 18:00");
    expect(merged.hiddenGem).toBe(true);
    expect(merged.localFavorite).toBe(true);
    expect(merged.phone).toBe("02-111-2222");
    expect(merged.image).toBe("https://owned.example/cover.jpg");
    expect(merged.address).toBe("Google verified address");
    expect(merged.delivery).toBe(true);
    expect(merged.dineIn).toBe(true);
    expect(merged.takeaway).toBe(true);
    expect(merged.wheelchairAccessible).toBe(true);
    expect(merged.googleDetails?.internationalPhone).toBe("+66 2 999 9999");
    expect(merged.googleDetails?.types).toContain("restaurant");
  });

  it("never persists the transient Google photo URL", () => {
    const cached = sanitizeGoogleLiveDetails(live) as Record<string, unknown>;
    expect(cached.photoUrl).toBeUndefined();
    expect(JSON.stringify(cached)).not.toContain("google-photo.example");
  });
});
