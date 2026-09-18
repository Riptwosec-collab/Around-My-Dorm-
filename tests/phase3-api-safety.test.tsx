import fs from "node:fs";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("@/components/PlacePhoto", () => ({
  PlacePhoto: () => <div data-testid="mock-place-photo" />,
}));

import { PlaceCard } from "@/components/PlaceCard";
import { PlaceDecisionPanel } from "@/components/PlaceDecisionPanel";

const seed = PLACES[0]!;
const place = {
  ...seed,
  id: "phase3-api-target",
  slug: "phase3-api-target",
  name: "Phase 3 API Target",
  latitude: 13.82,
  longitude: 100.59,
  distanceKm: 0.42,
  straightLineDistanceKm: 0.42,
  is24Hours: true,
} as Place;

afterEach(() => cleanup());

beforeEach(() => {
  apiMocks.calculateRoute.mockReset();
  apiMocks.getCachedRoute.mockReset();
  apiMocks.getCachedRoute.mockReturnValue(null);
  apiMocks.searchTransientParking.mockReset();
  apiMocks.calculateRoute.mockResolvedValue({
    mode: "driving",
    distanceMeters: 900,
    durationSeconds: 240,
    calculatedAt: "2026-09-18T02:00:00.000Z",
    provider: "google_routes",
  });
  apiMocks.searchTransientParking.mockResolvedValue([]);
});

describe("Phase 3 explicit API safety", () => {
  it("keeps provider calls out of the app shell source", () => {
    const appSource = fs.readFileSync("components/AroundMyDormApp.tsx", "utf8");
    expect(appSource).not.toContain("calculateRoute(");
    expect(appSource).not.toContain("searchTransientParking(");
  });

  it("renders PlaceCard without route or parking discovery requests", () => {
    render(
      <PlaceCard
        place={place}
        saved={false}
        onSave={() => undefined}
        onDetail={() => undefined}
        onMap={() => undefined}
        language="th"
      />,
    );

    expect(screen.getByText(place.name)).toBeInTheDocument();
    expect(apiMocks.calculateRoute).not.toHaveBeenCalled();
    expect(apiMocks.searchTransientParking).not.toHaveBeenCalled();
  });

  it("opens the decision UI with zero provider requests and calls only after explicit actions", async () => {
    render(<PlaceDecisionPanel place={place} allPlaces={[place]} language="en" />);

    expect(apiMocks.calculateRoute).not.toHaveBeenCalled();
    expect(apiMocks.searchTransientParking).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Drive" }));
    expect(apiMocks.calculateRoute).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Calculate travel time" }));
    await waitFor(() => expect(apiMocks.calculateRoute).toHaveBeenCalledTimes(1));
    expect(apiMocks.calculateRoute).toHaveBeenCalledWith(place, "driving", { force: false });
    expect(apiMocks.searchTransientParking).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Find more parking" }));
    await waitFor(() => expect(apiMocks.searchTransientParking).toHaveBeenCalledTimes(1));
    expect(apiMocks.calculateRoute).toHaveBeenCalledTimes(1);
  });

  it("keeps PlaceDetail as composition only for Phase 3 provider actions", () => {
    const detailSource = fs.readFileSync("components/PlaceDetail.tsx", "utf8");
    expect(detailSource).toContain("<PlaceDecisionPanel");
    expect(detailSource).not.toContain("calculateRoute(");
    expect(detailSource).not.toContain("searchTransientParking(");
  });

  it("passes the canonical place collection from the app shell into PlaceDetail", () => {
    const appSource = fs.readFileSync("components/AroundMyDormApp.tsx", "utf8");
    expect(appSource).toMatch(/<PlaceDetail\s+place=\{detailPlace\}\s+allPlaces=\{allPlaces\}/);
  });
});
