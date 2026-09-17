import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLACES } from "@/data/places";
import type { Place } from "@/types/place";

const requestMocks = vi.hoisted(() => ({
  runGoogleTextSearchRequest: vi.fn(),
}));

vi.mock("@/lib/google-request-manager", () => ({
  runGoogleTextSearchRequest: requestMocks.runGoogleTextSearchRequest,
}));

import { searchTransientParking } from "@/lib/google-parking-runtime";

const seed = PLACES[0]!;
const target = {
  ...seed,
  id: "target-place",
  name: "Target Place",
  latitude: 13.82,
  longitude: 100.59,
} as Place;

const googleParking = {
  googlePlaceId: "google-parking-1",
  name: "Google Parking One",
  address: "Lat Phrao, Bangkok",
  latitude: 13.821,
  longitude: 100.591,
  primaryType: "parking",
  primaryTypeLabel: "Parking",
  rating: 4.4,
  reviewCount: 120,
  openNow: true,
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=parking",
  fetchedAt: "2026-09-17T12:00:00.000Z",
};

describe("transient Google parking search", () => {
  beforeEach(() => {
    requestMocks.runGoogleTextSearchRequest.mockReset();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");
  });

  it("runs one explicit parking text search around the target and returns review candidates", async () => {
    requestMocks.runGoogleTextSearchRequest.mockResolvedValue({
      logicalRequests: 1,
      networkAttempts: 1,
      succeeded: 1,
      failed: 0,
      fromCache: false,
      candidates: [googleParking],
    });

    const result = await searchTransientParking(target, { language: "th", places: [] });

    expect(requestMocks.runGoogleTextSearchRequest).toHaveBeenCalledTimes(1);
    expect(requestMocks.runGoogleTextSearchRequest).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "test-key",
      query: "ที่จอดรถ",
      center: { lat: 13.82, lng: 100.59 },
      radiusMeters: 1000,
      maxResults: 8,
    }));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sourceProvider: "google_places_admin",
      sourceId: "google-parking-1",
      status: expect.any(String),
      proposedPlace: {
        name: "Google Parking One",
        googlePlaceId: "google-parking-1",
        category: "parking",
        categories: ["parking"],
      },
    });
  });

  it("fails before any Google request when target coordinates are missing", async () => {
    const missing = { ...target, latitude: null } as Place;

    await expect(searchTransientParking(missing, { places: [] })).rejects.toThrow(/coordinates/i);
    expect(requestMocks.runGoogleTextSearchRequest).not.toHaveBeenCalled();
  });

  it("fails before any Google request when the API key is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");

    await expect(searchTransientParking(target, { places: [] })).rejects.toThrow(/API key/i);
    expect(requestMocks.runGoogleTextSearchRequest).not.toHaveBeenCalled();
  });
});
