import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLACES } from "@/data/places";
import { NearbyParkingPanel } from "@/components/NearbyParkingPanel";
import { PlaceDecisionPanel } from "@/components/PlaceDecisionPanel";
import { PlaceEtaPanel } from "@/components/PlaceEtaPanel";
import { ReportPlaceSheet } from "@/components/ReportPlaceSheet";
import { formatDisplayDistance, formatDisplayPrice } from "@/lib/place-display-format";
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

const seed = PLACES[0]!;
const place = {
  ...seed,
  id: "phase3-localization-target",
  slug: "phase3-localization-target",
  name: "Localization Target",
  latitude: 13.82,
  longitude: 100.59,
  distanceKm: 0.42,
  straightLineDistanceKm: 0.42,
  is24Hours: true,
  priceText: null,
  minPrice: 60,
  maxPrice: 120,
  pricing: {
    type: "range",
    min: 60,
    max: 120,
    fixed: null,
    unit: null,
    currency: "THB",
    displayText: null,
    verifiedAt: "2026-09-17T08:00:00.000Z",
  },
} as Place;

afterEach(() => cleanup());

beforeEach(() => {
  apiMocks.calculateRoute.mockReset();
  apiMocks.getCachedRoute.mockReset();
  apiMocks.getCachedRoute.mockReturnValue(null);
  apiMocks.searchTransientParking.mockReset();
  apiMocks.searchTransientParking.mockResolvedValue([]);
});

describe("Phase 3 TH/EN localization", () => {
  it("formats Phase 3 price and straight-line distance in the selected language", () => {
    expect(formatDisplayDistance(0.42, "th")).toBe("420 ม.");
    expect(formatDisplayDistance(0.42, "en")).toBe("420 m");
    expect(formatDisplayDistance(null, "en")).toBe("Coordinates not verified");

    expect(formatDisplayPrice(place, "th")).toBe("60–120 บาท");
    expect(formatDisplayPrice(place, "en")).toBe("60–120 THB");
  });

  it("renders equivalent English Decision Panel labels without Thai units", () => {
    render(<PlaceDecisionPanel place={place} allPlaces={[place]} language="en" />);

    expect(screen.getByText("Data freshness")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("Straight-line distance")).toBeInTheDocument();
    expect(screen.getByText("60–120 THB")).toBeInTheDocument();
    expect(screen.getByText("420 m")).toBeInTheDocument();
    expect(screen.queryByText(/บาท|ม\.|กม\./)).not.toBeInTheDocument();
  });

  it("provides English ETA mode, calculate, recalculate-capable, and fallback labels", () => {
    render(<PlaceEtaPanel place={place} language="en" />);

    expect(screen.getByRole("button", { name: "Walk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Motorcycle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drive" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calculate travel time" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open directions in Google Maps" })).toBeInTheDocument();
  });

  it("provides equivalent English nearby-parking and manual-search labels", () => {
    render(<NearbyParkingPanel target={place} places={[place]} language="en" />);

    expect(screen.getByText("Parking near this place")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find more parking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View all parking" })).toBeInTheDocument();
  });

  it("provides equivalent English public-report labels and outcomes copy", () => {
    render(<ReportPlaceSheet place={place} onClose={() => undefined} language="en" />);

    expect(screen.getByRole("heading", { name: "Report incorrect data" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place closed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opening hours incorrect" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Additional details (optional)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send report" })).toBeInTheDocument();
  });
});
