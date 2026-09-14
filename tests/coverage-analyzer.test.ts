import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import { buildCoverageReport } from "@/lib/coverage/coverage";
import { DORM_CENTER } from "@/lib/place-utils";

const seed = PLACES[0]!;

const place = (
  id: string,
  latitude: number | null,
  longitude: number | null,
  overrides: Partial<typeof seed> = {},
) => ({
  ...seed,
  id,
  slug: id,
  name: id,
  category: "cafe" as const,
  categories: ["cafe" as const],
  latitude,
  longitude,
  verified: true,
  dataStatus: "verified" as const,
  lastChecked: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

describe("coverage analyzer", () => {
  it("assigns a place to exactly one distance ring", () => {
    const report = buildCoverageReport([
      place("near", DORM_CENTER.lat + 0.001, DORM_CENTER.lng),
      place("far", DORM_CENTER.lat + 0.012, DORM_CENTER.lng),
    ]);

    expect(report.rings.find((ring) => ring.ring.id === "r1")?.placeIds).toContain("near");
    expect(report.rings.flatMap((ring) => ring.placeIds).filter((id) => id === "near")).toHaveLength(1);
  });

  it("keeps coordinate-less places in global total but outside distance rings", () => {
    const report = buildCoverageReport([place("unknown-location", null, null)]);

    expect(report.totalPlaces).toBe(1);
    expect(report.rings.flatMap((ring) => ring.placeIds)).not.toContain("unknown-location");
  });

  it("computes completeness percentages without provider calls", () => {
    const report = buildCoverageReport([
      place("a", DORM_CENTER.lat + 0.001, DORM_CENTER.lng, {
        image: null,
        coverImage: null,
        images: [],
        imageMetadata: [],
        googleMapsUrl: null,
      }),
      place("b", DORM_CENTER.lat + 0.0015, DORM_CENTER.lng),
    ]);

    const r1 = report.rings.find((ring) => ring.ring.id === "r1")!;
    expect(r1.total).toBe(2);
    expect(r1.coordinateCoverage).toBe(100);
    expect(r1.mapsCoverage).toBeGreaterThanOrEqual(0);
    expect(r1.mapsCoverage).toBeLessThanOrEqual(100);
  });

  it("emits actionable low-category gaps without fabricating places", () => {
    const report = buildCoverageReport([
      place("only-cafe", DORM_CENTER.lat + 0.001, DORM_CENTER.lng),
    ]);

    expect(
      report.gaps.some(
        (gap) => gap.code === "low_category_count" && gap.ringId === "r1" && gap.category === "food",
      ),
    ).toBe(true);
  });
});
