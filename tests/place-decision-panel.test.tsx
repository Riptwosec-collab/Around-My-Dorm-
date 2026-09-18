import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLACES } from "@/data/places";
import type { Place } from "@/types/place";

const apiMocks = vi.hoisted(() => ({
  calculateRoute: vi.fn(),
  getCachedRoute: vi.fn(() => null),
  searchTransientParking: vi.fn(),
}));

vi.mock("@/lib/routes/runtime-routes", () => ({
  calculateRoute: apiMocks.calculateRoute,
  getCachedRoute: apiMocks.getCachedRoute,
}));

vi.mock("@/lib/google-parking-runtime", () => ({
  searchTransientParking: apiMocks.searchTransientParking,
}));

import { PlaceDecisionPanel } from "@/components/PlaceDecisionPanel";

const seed = PLACES[0]!;
const place = {
  ...seed,
  id: "decision-target",
  name: "Decision Target",
  latitude: 13.82,
  longitude: 100.59,
  distanceKm: 0.42,
  straightLineDistanceKm: 0.42,
  is24Hours: true,
  openingHoursVerifiedAt: "2026-09-17T08:00:00.000Z",
  priceVerifiedAt: "2026-09-17T08:00:00.000Z",
  parkingVerifiedAt: "2026-09-17T08:00:00.000Z",
  minPrice: 60,
  maxPrice: 120,
} as Place;

const parking = {
  ...seed,
  id: "decision-parking",
  slug: "decision-parking",
  name: "Decision Parking",
  category: "parking" as const,
  categories: ["parking" as const],
  latitude: 13.821,
  longitude: 100.591,
  parkingDetails: {
    parkingType: "hourly" as const,
    hourlyPrice: 20,
    dailyPrice: null,
    monthlyPrice: null,
    deposit: null,
    accessHours: null,
    access24Hours: true,
    coveredParking: false,
    cctv: true,
    securityGuard: false,
    gateAccess: null,
    overnightAllowed: true,
    evCharging: false,
    estimatedCapacity: 20,
    availabilityStatus: "available" as const,
    availabilityVerifiedAt: "2026-09-17T08:00:00.000Z",
  },
} as Place;

afterEach(() => cleanup());

describe("PlaceDecisionPanel", () => {
  beforeEach(() => {
    apiMocks.calculateRoute.mockReset();
    apiMocks.getCachedRoute.mockReturnValue(null);
    apiMocks.searchTransientParking.mockReset();
  });

  it("composes decision signals without background route or parking requests", () => {
    render(<PlaceDecisionPanel place={place} allPlaces={[place, parking]} language="th" />);

    expect(screen.getByTestId("place-decision-panel")).toBeInTheDocument();
    expect(screen.getByText(/เปิด 24 ชั่วโมง|เปิดตลอด 24 ชั่วโมง/)).toBeInTheDocument();
    expect(screen.getByText("ความสดของข้อมูล")).toBeInTheDocument();
    expect(screen.getAllByText("ราคา")).toHaveLength(2);
    expect(screen.getByText("ระยะเส้นตรง")).toBeInTheDocument();
    expect(screen.getByTestId("place-eta-panel")).toBeInTheDocument();
    expect(screen.getByText("Decision Parking")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "รายงานข้อมูลผิด" })).toBeInTheDocument();
    expect(apiMocks.calculateRoute).not.toHaveBeenCalled();
    expect(apiMocks.searchTransientParking).not.toHaveBeenCalled();
  });

  it("supports equivalent English decision labels", () => {
    render(<PlaceDecisionPanel place={place} allPlaces={[place, parking]} language="en" />);

    expect(screen.getByText("Data freshness")).toBeInTheDocument();
    expect(screen.getAllByText("Price")).toHaveLength(2);
    expect(screen.getByText("Straight-line distance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Report incorrect data" })).toBeInTheDocument();
  });
});
