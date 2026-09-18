import { describe, expect, it } from "vitest";
import { buildFreshnessSummary } from "@/lib/data-quality";

const NOW = new Date("2026-09-17T00:00:00.000Z");

function place(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    fieldProvenance: {},
    openingHoursVerifiedAt: null,
    priceVerifiedAt: null,
    parkingVerifiedAt: null,
    locationVerifiedAt: null,
    ...overrides,
  } as any;
}

describe("buildFreshnessSummary", () => {
  it("calculates independent fresh percentages and actionable ids", () => {
    const summary = buildFreshnessSummary([
      place("fresh", {
        openingHoursVerifiedAt: "2026-09-10T00:00:00.000Z",
        priceVerifiedAt: "2026-09-10T00:00:00.000Z",
        parkingVerifiedAt: "2026-09-10T00:00:00.000Z",
        locationVerifiedAt: "2026-09-10T00:00:00.000Z",
      }),
      place("stale-opening", {
        openingHoursVerifiedAt: "2026-08-01T00:00:00.000Z",
        priceVerifiedAt: "2026-09-10T00:00:00.000Z",
        parkingVerifiedAt: "2026-09-10T00:00:00.000Z",
        locationVerifiedAt: "2026-09-10T00:00:00.000Z",
      }),
      place("unknown-price", {
        openingHoursVerifiedAt: "2026-09-10T00:00:00.000Z",
        parkingVerifiedAt: "2026-07-01T00:00:00.000Z",
        locationVerifiedAt: "2026-01-01T00:00:00.000Z",
      }),
      place("aging", {
        openingHoursVerifiedAt: "2026-08-25T00:00:00.000Z",
        priceVerifiedAt: "2026-08-01T00:00:00.000Z",
        parkingVerifiedAt: "2026-08-01T00:00:00.000Z",
        locationVerifiedAt: "2026-09-10T00:00:00.000Z",
      }),
    ], NOW);

    expect(summary.total).toBe(4);
    expect(summary.opening.freshPercent).toBe(50);
    expect(summary.price.freshPercent).toBe(50);
    expect(summary.parking.freshPercent).toBe(50);
    expect(summary.location.freshPercent).toBe(75);
    expect(summary.opening.staleIds).toEqual(["stale-opening"]);
    expect(summary.price.unknownIds).toEqual(["unknown-price"]);
    expect(summary.parking.staleIds).toEqual(["unknown-price"]);
    expect(summary.location.staleIds).toEqual(["unknown-price"]);
  });

  it("returns zero percentages for an empty dataset", () => {
    const summary = buildFreshnessSummary([], NOW);
    expect(summary.total).toBe(0);
    expect(summary.opening.freshPercent).toBe(0);
    expect(summary.price.freshPercent).toBe(0);
    expect(summary.parking.freshPercent).toBe(0);
    expect(summary.location.freshPercent).toBe(0);
  });
});
