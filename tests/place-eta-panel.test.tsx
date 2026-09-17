import fs from "node:fs";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLACES } from "@/data/places";

const { calculateRoute } = vi.hoisted(() => ({
  calculateRoute: vi.fn(),
}));
vi.mock("@/lib/routes/runtime-routes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/routes/runtime-routes")>("@/lib/routes/runtime-routes");
  return { ...actual, calculateRoute };
});

import { PlaceEtaPanel } from "@/components/PlaceEtaPanel";

const place = { ...PLACES[0], id: "eta-place", latitude: 13.82, longitude: 100.59 };

afterEach(() => cleanup());

beforeEach(() => {
  calculateRoute.mockReset();
  calculateRoute.mockResolvedValue({
    mode: "walking",
    distanceMeters: 850,
    durationSeconds: 420,
    calculatedAt: "2026-09-17T12:00:00.000Z",
    provider: "google_routes",
  });
});

describe("PlaceEtaPanel", () => {
  it("does not calculate on render or mode selection", () => {
    render(<PlaceEtaPanel place={place} language="th" />);
    expect(calculateRoute).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "มอไซค์" }));
    expect(calculateRoute).not.toHaveBeenCalled();
  });

  it("calculates only after explicit click for the selected mode", async () => {
    calculateRoute.mockResolvedValueOnce({
      mode: "motorcycle",
      distanceMeters: 900,
      durationSeconds: 180,
      calculatedAt: "2026-09-17T12:00:00.000Z",
      provider: "google_routes",
    });
    render(<PlaceEtaPanel place={place} language="th" />);

    fireEvent.click(screen.getByRole("button", { name: "มอไซค์" }));
    fireEvent.click(screen.getByRole("button", { name: "คำนวณเวลาเดินทาง" }));

    await waitFor(() => expect(calculateRoute).toHaveBeenCalledTimes(1));
    expect(calculateRoute).toHaveBeenCalledWith(place, "motorcycle", { force: false });
    expect(await screen.findByText("3 นาที")).toBeInTheDocument();
    expect(screen.getByText("900 ม.")).toBeInTheDocument();
  });

  it("switches mode without a request and calculates the next mode explicitly", async () => {
    render(<PlaceEtaPanel place={place} language="en" />);

    fireEvent.click(screen.getByRole("button", { name: "Walk" }));
    fireEvent.click(screen.getByRole("button", { name: "Calculate travel time" }));
    await waitFor(() => expect(calculateRoute).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Drive" }));
    expect(calculateRoute).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Calculate travel time" }));
    await waitFor(() => expect(calculateRoute).toHaveBeenCalledTimes(2));
    expect(calculateRoute.mock.calls[1][1]).toBe("driving");
  });

  it("uses force only for explicit recalculate", async () => {
    render(<PlaceEtaPanel place={place} language="th" />);
    fireEvent.click(screen.getByRole("button", { name: "คำนวณเวลาเดินทาง" }));
    await screen.findByText("7 นาที");

    fireEvent.click(screen.getByRole("button", { name: "คำนวณใหม่" }));
    await waitFor(() => expect(calculateRoute).toHaveBeenCalledTimes(2));
    expect(calculateRoute.mock.calls[0][2]).toEqual({ force: false });
    expect(calculateRoute.mock.calls[1][2]).toEqual({ force: true });
  });

  it("shows API locked and no-route errors without fabricated ETA", async () => {
    calculateRoute.mockRejectedValueOnce(Object.assign(new Error("locked"), { code: "api_locked" }));
    render(<PlaceEtaPanel place={place} language="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Calculate travel time" }));
    expect(await screen.findByText(/API requests are locked/i)).toBeInTheDocument();
    expect(screen.queryByText(/min$/i)).not.toBeInTheDocument();
  });

  it("is mounted in PlaceDetail and route logic stays out of AroundMyDormApp", () => {
    const detailSource = fs.readFileSync("components/PlaceDetail.tsx", "utf8");
    const appSource = fs.readFileSync("components/AroundMyDormApp.tsx", "utf8");
    expect(detailSource).toContain('import { PlaceEtaPanel } from "@/components/PlaceEtaPanel";');
    expect(detailSource).toContain("<PlaceEtaPanel");
    expect(appSource).not.toContain("calculateRoute(");
  });
});
