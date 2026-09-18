import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLACES } from "@/data/places";
import type { Place } from "@/types/place";

const parkingMocks = vi.hoisted(() => ({
  searchTransientParking: vi.fn(),
}));

vi.mock("@/lib/google-parking-runtime", () => ({
  searchTransientParking: parkingMocks.searchTransientParking,
}));

import { NearbyParkingPanel } from "@/components/NearbyParkingPanel";

const seed = PLACES[0]!;
const target = {
  ...seed,
  id: "manual-parking-target",
  name: "Manual Parking Target",
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
  latitude: 13.8205,
  longitude: 100.5905,
  parkingDetails: {
    parkingType: "hourly" as const,
    hourlyPrice: 20,
    dailyPrice: null,
    monthlyPrice: null,
    deposit: null,
    accessHours: "24 hours",
    access24Hours: true,
    coveredParking: false,
    cctv: true,
    securityGuard: true,
    gateAccess: null,
    overnightAllowed: true,
    evCharging: false,
    estimatedCapacity: 20,
    availabilityStatus: "available" as const,
    availabilityVerifiedAt: "2026-09-17T08:00:00.000Z",
  },
} as Place;

afterEach(() => cleanup());

beforeEach(() => {
  parkingMocks.searchTransientParking.mockReset();
  parkingMocks.searchTransientParking.mockResolvedValue([
    {
      googlePlaceId: "google-parking-1",
      name: "Google Parking Candidate",
      address: "Bangkok",
      latitude: 13.821,
      longitude: 100.591,
      rating: 4.4,
      userRatingCount: 24,
      openNow: true,
      googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=13.821,100.591",
    },
    {
      googlePlaceId: "google-parking-2",
      name: "Google Parking Candidate 2",
      address: "Bangkok",
      latitude: 13.822,
      longitude: 100.592,
      rating: null,
      userRatingCount: null,
      openNow: null,
      googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=13.822,100.592",
    },
  ]);
});

describe("manual Google parking fallback", () => {
  it("does not search Google when parking panel renders", () => {
    render(<NearbyParkingPanel target={target} places={[localParking]} language="th" />);
    expect(screen.getByText("Local Parking")).toBeInTheDocument();
    expect(parkingMocks.searchTransientParking).not.toHaveBeenCalled();
  });

  it("searches Google only after explicit user action", async () => {
    render(<NearbyParkingPanel target={target} places={[localParking]} language="th" />);

    fireEvent.click(screen.getByRole("button", { name: "ค้นหาที่จอดเพิ่ม" }));

    await waitFor(() => expect(parkingMocks.searchTransientParking).toHaveBeenCalledTimes(1));
    expect(parkingMocks.searchTransientParking).toHaveBeenCalledWith(target);
    expect(await screen.findByText("Google Parking Candidate")).toBeInTheDocument();
    expect(await screen.findByText("Google Parking Candidate 2")).toBeInTheDocument();
    expect(screen.getAllByText(/ยังไม่บันทึกลงฐานข้อมูล/)).toHaveLength(2);
  });

  it("keeps Google fallback results transient and exposes map actions", async () => {
    render(<NearbyParkingPanel target={target} places={[localParking]} language="en" />);

    fireEvent.click(screen.getByRole("button", { name: "Find more parking" }));

    expect(await screen.findByText("Google Parking Candidate")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open in Google Maps" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /save|บันทึก/i })).not.toBeInTheDocument();
  });
});
