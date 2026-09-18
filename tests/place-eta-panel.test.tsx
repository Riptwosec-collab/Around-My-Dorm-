import fs from "node:fs";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLACES } from "@/data/places";
import type { Place } from "@/types/place";

const routeMocks = vi.hoisted(() => ({
  calculateRoute: vi.fn(),
  getCachedRoute: vi.fn(() => null),
}));

vi.mock("@/lib/routes/runtime-routes", () => ({
  calculateRoute: routeMocks.calculateRoute,
  getCachedRoute: routeMocks.getCachedRoute,
}));

import { PlaceEtaPanel } from "@/components/PlaceEtaPanel";

const seed = PLACES[0]!;
const place = {
  ...seed,
  id: "eta-target",
  name: "ETA Target",
  latitude: 13.82,
  longitude: 100.59,
} as Place;

afterEach(() => cleanup());

beforeEach(() => {
  routeMocks.calculateRoute.mockReset();
  routeMocks.getCachedRoute.mockReset();
  routeMocks.getCachedRoute.mockReturnValue(null);
});

describe("PlaceEtaPanel", () => {
  it("makes zero route requests on render and mode selection", () => {
    render(<PlaceEtaPanel place={place} language="th" />);
    expect(routeMocks.calculateRoute).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "รถ" }));
    expect(routeMocks.calculateRoute).not.toHaveBeenCalled();
  });

  it("requests only the explicitly selected mode", async () => {
    routeMocks.calculateRoute.mockResolvedValue({
      mode: "driving",
      distanceMeters: 4200,
      durationSeconds: 900,
      calculatedAt: "2026-09-17T09:00:00.000Z",
      provider: "google_routes",
    });

    render(<PlaceEtaPanel place={place} language="th" />);
    fireEvent.click(screen.getByRole("button", { name: "รถ" }));
    fireEvent.click(screen.getByRole("button", { name: "คำนวณเวลาเดินทาง" }));

    await waitFor(() => expect(routeMocks.calculateRoute).toHaveBeenCalledTimes(1));
    expect(routeMocks.calculateRoute).toHaveBeenCalledWith(place, "driving", { force: false });
    expect(await screen.findByText(/15 นาที/)).toBeInTheDocument();
  });

  it("does not invent ETA when provider returns no route", async () => {
    routeMocks.calculateRoute.mockRejectedValue(Object.assign(new Error("No route"), { code: "no_route" }));
    render(<PlaceEtaPanel place={place} language="th" />);
    fireEvent.click(screen.getByRole("button", { name: "คำนวณเวลาเดินทาง" }));

    expect(await screen.findByText(/ไม่พบเส้นทาง/)).toBeInTheDocument();
    expect(screen.queryByText(/ประมาณ.*นาที/)).not.toBeInTheDocument();
  });

  it("offers an explicit recalculate action after success", async () => {
    routeMocks.calculateRoute.mockResolvedValue({
      mode: "walking",
      distanceMeters: 750,
      durationSeconds: 600,
      calculatedAt: "2026-09-17T09:00:00.000Z",
      provider: "google_routes",
    });
    render(<PlaceEtaPanel place={place} language="th" />);
    fireEvent.click(screen.getByRole("button", { name: "คำนวณเวลาเดินทาง" }));
    expect(await screen.findByRole("button", { name: "คำนวณใหม่" })).toBeInTheDocument();
  });

  it("composes ETA through the decision panel instead of the app shell", () => {
    const detailSource = fs.readFileSync("components/PlaceDetail.tsx", "utf8");
    const decisionSource = fs.readFileSync("components/PlaceDecisionPanel.tsx", "utf8");
    const appSource = fs.readFileSync("components/AroundMyDormApp.tsx", "utf8");
    expect(detailSource).toContain('import { PlaceDecisionPanel } from "@/components/PlaceDecisionPanel";');
    expect(detailSource).toContain("<PlaceDecisionPanel");
    expect(decisionSource).toContain('import { PlaceEtaPanel } from "@/components/PlaceEtaPanel";');
    expect(decisionSource).toContain("<PlaceEtaPanel");
    expect(appSource).not.toContain("calculateRoute(");
  });
});
