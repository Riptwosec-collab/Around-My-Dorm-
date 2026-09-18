import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLACES } from "@/data/places";
import type { Place } from "@/types/place";

const runtimeMocks = vi.hoisted(() => ({
  searchTransientParking: vi.fn(),
}));

vi.mock("@/lib/google-parking-runtime", () => ({
  searchTransientParking: runtimeMocks.searchTransientParking,
}));

import { NearbyParkingPanel } from "@/components/NearbyParkingPanel";

const seed = PLACES[0]!;
const target = {
  ...seed,
  id: "target-place",
  name: "Target Place",
  latitude: 13.82,
  longitude: 100.59,
} as Place;

const localParking = {
  ...seed,
  id: "local-parking",
  slug: "local-parking",
  name: "Local Parking",
  category: "parking" as const,
  categories: ["parking" as const],
  latitude: 13.821,
  longitude: 100.591,
  distance: {
    straightLineMeters: null,
    walkingDistanceMeters: 180,
    walkingMinutes: 3,
    motorcycleDistanceMeters: null,
    motorcycleMinutes: null,
    drivingDistanceMeters: null,
    drivingMinutes: null,
  },
  parkingDetails: {
    parkingType: "hourly" as const,
    hourlyPrice: 20,
    dailyPrice: null,
    monthlyPrice: null,
    deposit: null,
    accessHours: null,
    access24Hours: true,
    coveredParking: true,
    cctv: true,
    securityGuard: true,
    gateAccess: null,
    overnightAllowed: true,
    evCharging: false,
    estimatedCapacity: 30,
    availabilityStatus: "available" as const,
    availabilityVerifiedAt: "2026-09-17T10:00:00.000Z",
  },
} as Place;

const transientCandidate = {
  id: "google_places_admin:google-parking-1",
  candidateKey: "google_places_admin:google-parking-1",
  sourceProvider: "google_places_admin",
  sourceId: "google-parking-1",
  proposedPlace: {
    name: "Google Parking One",
    googlePlaceId: "google-parking-1",
    category: "parking" as const,
    categories: ["parking" as const],
    latitude: 13.822,
    longitude: 100.592,
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=parking",
  },
  possibleMatchIds: [],
  matchScore: 0,
  validationIssues: [],
  completenessScore: 50,
  status: "new" as const,
  createdAt: "2026-09-17T12:00:00.000Z",
  updatedAt: "2026-09-17T12:00:00.000Z",
  reviewedAt: null,
  reviewedBy: null,
};

afterEach(() => cleanup());

describe("NearbyParkingPanel manual Google fallback", () => {
  beforeEach(() => {
    runtimeMocks.searchTransientParking.mockReset();
    runtimeMocks.searchTransientParking.mockResolvedValue([transientCandidate]);
  });

  it("makes zero Google parking requests on render or local-only interactions", () => {
    render(<NearbyParkingPanel target={target} places={[localParking]} language="th" />);

    expect(screen.getByText("Local Parking")).toBeInTheDocument();
    expect(runtimeMocks.searchTransientParking).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "ดูรายละเอียด" }));
    expect(runtimeMocks.searchTransientParking).not.toHaveBeenCalled();
  });

  it("runs one transient search only after the explicit button and labels results as additional", async () => {
    render(<NearbyParkingPanel target={target} places={[localParking]} language="th" />);

    fireEvent.click(screen.getByRole("button", { name: "ค้นหาที่จอดเพิ่ม" }));

    await waitFor(() => expect(runtimeMocks.searchTransientParking).toHaveBeenCalledTimes(1));
    expect(runtimeMocks.searchTransientParking).toHaveBeenCalledWith(target, expect.objectContaining({ language: "th", places: [localParking] }));
    expect(await screen.findByText("ผลค้นหาเพิ่มเติม")).toBeInTheDocument();
    expect(screen.getByText("Google Parking One")).toBeInTheDocument();
    expect(screen.getByText(/ยังไม่บันทึกลงฐานข้อมูล/)).toBeInTheDocument();
  });
});
