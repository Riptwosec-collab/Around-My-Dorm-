import { describe, expect, it } from "vitest";
import { buildDataCompletenessDashboard, dataAgeLabel, scorePlaceDataQuality } from "@/lib/data-quality";
import type { Place } from "@/types/place";

function p(overrides: Partial<Place> = {}) {
  return {
    id: "p", name: "Shop", category: "cafe", categories: ["cafe"], googlePlaceId: null,
    latitude: 13.8, longitude: 100.5, address: "Bangkok", area: "Chatuchak",
    openingHours: { monday: "08:00-18:00", tuesday: null, wednesday: null, thursday: null, friday: null, saturday: null, sunday: null },
    is24Hours: false, phone: "021234567", priceText: "60–120 บาท", minPrice: 60, maxPrice: 120,
    averagePricePerPerson: 90, image: null, images: [], coverImage: null, imageMetadata: [],
    shortDescription: "Cafe", description: "Cafe", parking: { available: null, type: null, price: null, note: null },
    verified: true, lastVerified: "2026-09-01T00:00:00.000Z", lastChecked: "2026-09-01T00:00:00.000Z",
    source: ["seed"], fieldProvenance: {},
    ...overrides,
  } as Place;
}

describe("data quality", () => {
  it("penalizes missing identity/media/provenance fields without external requests", () => {
    const score = scorePlaceDataQuality(p());
    expect(score.score).toBeLessThan(100);
    expect(score.missing).toContain("googlePlaceId");
    expect(score.missing).toContain("photo");
  });
  it("improves when verified photo, Place ID and provenance are present", () => {
    const base = scorePlaceDataQuality(p()).score;
    const better = scorePlaceDataQuality(p({ googlePlaceId: "abc", imageMetadata: [{ url: "", source: "google_places", photoReference: "places/abc/photos/1", verified: true }], fieldProvenance: { phone: { source: "seed", checkedAt: "2026-09-01T00:00:00.000Z", confidence: "high" } } })).score;
    expect(better).toBeGreaterThan(base);
  });
  it("summarizes completeness across the dataset", () => {
    const dashboard = buildDataCompletenessDashboard([p(), p({ id: "p2", googlePlaceId: "x" })]);
    expect(dashboard.missingPlaceId).toBe(1);
    expect(dashboard.average).toBeGreaterThan(0);
  });
  it("formats local freshness labels", () => {
    const now = new Date("2026-09-08T00:00:00.000Z").getTime();
    expect(dataAgeLabel(p({ lastChecked: "2026-09-07T00:00:00.000Z" }), "th", now)).toContain("เมื่อวาน");
  });
});
