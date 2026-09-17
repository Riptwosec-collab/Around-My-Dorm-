import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import { rankNearbyParking } from "@/lib/discovery/parking-match";
import type { Place, ParkingDetails } from "@/types/place";

const seed = PLACES[0]!;
const target = {
  ...seed,
  id: "target",
  category: "cafe" as const,
  categories: ["cafe" as const],
  latitude: 13.82,
  longitude: 100.59,
} as Place;

function parking(
  id: string,
  latitude: number | null,
  longitude: number | null,
  overrides: Partial<Place> = {},
) {
  const details: ParkingDetails = {
    parkingType: "hourly",
    hourlyPrice: 20,
    dailyPrice: null,
    monthlyPrice: null,
    deposit: null,
    accessHours: "24 hours",
    access24Hours: true,
    coveredParking: false,
    cctv: false,
    securityGuard: false,
    gateAccess: null,
    overnightAllowed: true,
    evCharging: false,
    estimatedCapacity: null,
    availabilityStatus: "unknown",
    availabilityVerifiedAt: null,
    ...overrides.parkingDetails,
  };

  return {
    ...seed,
    id,
    name: id,
    category: "parking" as const,
    categories: ["parking" as const],
    latitude,
    longitude,
    walkingMinutes: null,
    distance: undefined,
    parkingDetails: details,
    ...overrides,
  } as Place;
}

describe("rankNearbyParking", () => {
  it("keeps only parking categories with usable coordinates", () => {
    const nonParking = { ...parking("shop", 13.8202, 100.59), category: "shopping" as const, categories: ["shopping" as const] };
    const missingCoordinates = parking("no-coords", null, null);
    const monthly = parking("monthly", 13.8204, 100.59, { category: "monthly_parking", categories: ["monthly_parking"] });

    const result = rankNearbyParking(target, [nonParking, missingCoordinates, monthly]);

    expect(result.map((item) => item.place.id)).toEqual(["monthly"]);
    expect(result[0]!.distanceKm).toBeGreaterThan(0);
  });

  it("prioritizes proximity, verified availability and useful parking facts deterministically", () => {
    const nearUnknown = parking("near-unknown", 13.8205, 100.59, {
      parkingDetails: { availabilityStatus: "unknown", access24Hours: false } as ParkingDetails,
    });
    const slightlyFarAvailable = parking("available-secure", 13.8207, 100.59, {
      parkingDetails: {
        availabilityStatus: "available",
        access24Hours: true,
        coveredParking: true,
        cctv: true,
        securityGuard: true,
        hourlyPrice: 10,
      } as ParkingDetails,
    });
    const full = parking("full", 13.8203, 100.59, {
      parkingDetails: { availabilityStatus: "full", access24Hours: true } as ParkingDetails,
    });

    const result = rankNearbyParking(target, [nearUnknown, slightlyFarAvailable, full]);

    expect(result[0]!.place.id).toBe("available-secure");
    expect(result.at(-1)!.place.id).toBe("full");
    expect(result[0]!.reasons).toEqual(expect.arrayContaining(["available", "24h", "cctv", "security"]));
  });

  it("preserves known route-derived walking minutes and never invents missing walking minutes", () => {
    const verifiedRoute = parking("known-walk", 13.821, 100.59, {
      walkingMinutes: 6,
      distance: {
        straightLineMeters: null,
        walkingDistanceMeters: 700,
        walkingMinutes: 6,
        motorcycleDistanceMeters: null,
        motorcycleMinutes: null,
        drivingDistanceMeters: null,
        drivingMinutes: null,
      },
    });
    const noRoute = parking("no-walk", 13.8208, 100.59, { walkingMinutes: null, distance: undefined });

    const result = rankNearbyParking(target, [verifiedRoute, noRoute]);
    const known = result.find((item) => item.place.id === "known-walk")!;
    const unknown = result.find((item) => item.place.id === "no-walk")!;

    expect(known.walkingMinutes).toBe(6);
    expect(unknown.walkingMinutes).toBeNull();
    expect(unknown.distanceKm).toBeGreaterThan(0);
  });

  it("honors the limit without mutating input places", () => {
    const places = [
      parking("a", 13.8202, 100.59),
      parking("b", 13.8204, 100.59),
      parking("c", 13.8206, 100.59),
      parking("d", 13.8208, 100.59),
    ];
    const snapshot = JSON.stringify(places);

    const result = rankNearbyParking(target, places, { limit: 3 });

    expect(result).toHaveLength(3);
    expect(JSON.stringify(places)).toBe(snapshot);
  });

  it("returns no ranked result when the target has no coordinates", () => {
    expect(rankNearbyParking({ ...target, latitude: null } as Place, [parking("a", 13.82, 100.59)])).toEqual([]);
  });
});
