import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import { buildDataHealthSummary } from "@/lib/place-data/data-health";

const seed = PLACES[0]!;

function place(id: string, overrides = {}) {
  return {
    ...seed,
    id,
    slug: id,
    name: `Shop ${id}`,
    latitude: 13.82,
    longitude: 100.58,
    category: "cafe" as const,
    categories: ["cafe" as const],
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${id}`,
    dataStatus: "verified" as const,
    verified: true,
    lastChecked: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("data health diagnostics", () => {
  it("counts usable coverage and explicit data states", () => {
    const summary = buildDataHealthSummary([
      place("a"),
      place("b", { dataStatus: "partial", verified: false, googleMapsUrl: null }),
    ], new Date("2026-09-13T00:00:00.000Z").getTime());

    expect(summary.total).toBe(2);
    expect(summary.status.verified).toBe(1);
    expect(summary.status.partial).toBe(1);
    expect(summary.withCoordinates).toBe(2);
    expect(summary.withMapsLink).toBe(1);
  });

  it("reports identity, coordinate, category and price problems without mutating data", () => {
    const source = [
      place("same", { slug: "dup", googlePlaceId: "g-dup" }),
      place("same", {
        slug: "dup",
        googlePlaceId: "g-dup",
        latitude: 120,
        category: "cafe" as const,
        categories: ["food" as const],
        minPrice: 200,
        maxPrice: 100,
      }),
    ];

    const summary = buildDataHealthSummary(source, new Date("2026-09-13T00:00:00.000Z").getTime());
    const codes = new Set(summary.issues.map((issue) => issue.code));

    expect(codes).toContain("duplicate_id");
    expect(codes).toContain("duplicate_slug");
    expect(codes).toContain("duplicate_google_place_id");
    expect(codes).toContain("invalid_coordinates");
    expect(codes).toContain("category_mismatch");
    expect(codes).toContain("invalid_price_range");
    expect(source[1]?.latitude).toBe(120);
  });

  it("flags nearby same-name businesses as review candidates but does not merge them", () => {
    const summary = buildDataHealthSummary([
      place("x", { name: "ร้านกาแฟ ABC", latitude: 13.82000, longitude: 100.58000 }),
      place("y", { name: "ร้านกาแฟ ABC", latitude: 13.82035, longitude: 100.58025 }),
    ]);

    expect(summary.issues.some((issue) => issue.code === "possible_duplicate_business")).toBe(true);
    expect(summary.total).toBe(2);
  });
});
