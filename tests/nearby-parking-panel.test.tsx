import fs from "node:fs";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import type { Place, ParkingDetails } from "@/types/place";
import { NearbyParkingPanel } from "@/components/NearbyParkingPanel";

const seed = PLACES[0]!;
const target = { ...seed, id: "target", latitude: 13.82, longitude: 100.59 } as Place;

function parking(id: string, lat: number, details: Partial<ParkingDetails> = {}, walkingMinutes: number | null = null) {
  return {
    ...seed,
    id,
    name: id,
    category: "parking" as const,
    categories: ["parking" as const],
    latitude: lat,
    longitude: 100.59,
    walkingMinutes,
    distance: walkingMinutes == null ? undefined : {
      straightLineMeters: null,
      walkingDistanceMeters: 500,
      walkingMinutes,
      motorcycleDistanceMeters: null,
      motorcycleMinutes: null,
      drivingDistanceMeters: null,
      drivingMinutes: null,
    },
    parkingDetails: {
      parkingType: "hourly",
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
      estimatedCapacity: null,
      availabilityStatus: "unknown",
      availabilityVerifiedAt: null,
      ...details,
    },
  } as Place;
}

afterEach(() => cleanup());

describe("NearbyParkingPanel", () => {
  it("renders at most three local canonical parking matches", () => {
    const places = [
      parking("Parking A", 13.8202, { availabilityStatus: "available" }),
      parking("Parking B", 13.8204),
      parking("Parking C", 13.8206),
      parking("Parking D", 13.8208),
    ];
    render(<NearbyParkingPanel target={target} places={places} language="en" />);

    expect(screen.getAllByTestId("parking-match")).toHaveLength(3);
    expect(screen.getByText("Parking A")).toBeInTheDocument();
    expect(screen.queryByText("Parking D")).not.toBeInTheDocument();
    expect(screen.getByText(/20 THB\/hr/)).toBeInTheDocument();
  });

  it("does not turn straight-line distance into walking time", () => {
    render(<NearbyParkingPanel target={target} places={[parking("No Route", 13.8203)]} language="en" />);
    expect(screen.getByText("Availability not verified")).toBeInTheDocument();
    expect(screen.queryByText(/Walk \d+ min/)).not.toBeInTheDocument();
  });

  it("shows known route-derived walking minutes and local actions", () => {
    render(<NearbyParkingPanel target={target} places={[parking("Known Route", 13.8203, { availabilityStatus: "available" }, 4)]} language="th" />);
    expect(screen.getByText("เดิน 4 นาที")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "นำทาง" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ดูรายละเอียด" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ดูที่จอดทั้งหมด" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ค้นหาที่จอดเพิ่ม" })).toBeInTheDocument();
  });

  it("keeps matching out of AroundMyDormApp and mounts the panel in PlaceDetail", () => {
    const detailSource = fs.readFileSync("components/PlaceDetail.tsx", "utf8");
    const appSource = fs.readFileSync("components/AroundMyDormApp.tsx", "utf8");
    expect(detailSource).toContain('import { NearbyParkingPanel } from "@/components/NearbyParkingPanel";');
    expect(detailSource).toContain("<NearbyParkingPanel");
    expect(appSource).not.toContain("rankNearbyParking(");
  });
});
