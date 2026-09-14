import fs from "node:fs";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PLACES } from "@/data/places";
import { CoverageDashboard } from "@/components/CoverageDashboard";
import { DORM_CENTER } from "@/lib/place-utils";

const seed = PLACES[0]!;

function place(id: string, latitude: number, overrides: Partial<typeof seed> = {}) {
  return {
    ...seed,
    id,
    slug: id,
    name: `Place ${id}`,
    category: "cafe" as const,
    categories: ["cafe" as const],
    latitude,
    longitude: DORM_CENTER.lng,
    verified: true,
    dataStatus: "verified" as const,
    lastChecked: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("CoverageDashboard V2", () => {
  it("renders ring coverage and keeps gap actions explicit/local", () => {
    const onReviewGap = vi.fn();
    const onSearchGap = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(React.createElement(CoverageDashboard, {
      places: [
        place("r1", DORM_CENTER.lat + 0.001),
        place("r2", DORM_CENTER.lat + 0.006),
      ],
      language: "th",
      onReviewGap,
      onSearchGap,
    }));

    expect(screen.getByTestId("coverage-dashboard")).toBeInTheDocument();
    expect(screen.getByText("0–500 m")).toBeInTheDocument();
    expect(screen.getByText("500 m–1 km")).toBeInTheDocument();
    expect(screen.getAllByText(/พิกัด|Coordinates/i).length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    const searchButton = screen.getAllByRole("button", { name: /ค้นหา Candidate|Search candidates/i })[0]!;
    fireEvent.click(searchButton);
    expect(onSearchGap).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });

  it("is mounted only inside the existing Data Management admin surface", () => {
    const source = fs.readFileSync("components/DataManagement.tsx", "utf8");
    expect(source).toContain('import { CoverageDashboard } from "@/components/CoverageDashboard";');
    expect(source).toContain("<CoverageDashboard");
    expect(source.indexOf("<CoverageDashboard")).toBeGreaterThan(source.indexOf("adminAccess.admin"));
  });
});
