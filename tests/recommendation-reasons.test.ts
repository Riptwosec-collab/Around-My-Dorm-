import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import { buildRecommendationReasonLine } from "@/lib/discovery/recommendation-reasons";
import type { Place, Pricing } from "@/types/place";

const seed = PLACES[0]!;
const NOW = new Date("2026-09-08T12:00:00+07:00");

function rangePricing(min: number, max: number): Pricing {
  return {
    type: "range",
    min,
    max,
    fixed: null,
    unit: null,
    currency: "THB",
    displayText: `฿${min}–${max}`,
    verifiedAt: null,
  };
}

function place(overrides: Partial<Place> = {}): Place {
  return {
    ...seed,
    id: "reason-line",
    slug: "reason-line",
    name: "Reason Line",
    category: "cafe",
    categories: ["cafe"],
    ...overrides,
  };
}

describe("buildRecommendationReasonLine", () => {
  it("formats only known recommendation facts in stable priority order", () => {
    expect(buildRecommendationReasonLine(place({
      liveOpenNow: true,
      distanceKm: 0.42,
      pricing: rangePricing(50, 80),
      placeType: "local",
      localFavorite: true,
    }), { now: NOW }, "th")).toBe("เปิดอยู่ • 420 ม. • ฿50–80 • LOCAL");
  });

  it("omits unknown status, distance and price rather than fabricating fallbacks", () => {
    expect(buildRecommendationReasonLine(place({
      liveOpenNow: null,
      distanceKm: null,
      pricing: undefined,
      minPrice: null,
      maxPrice: null,
      priceText: null,
      priceLevel: null,
      placeType: "chain",
      localFavorite: false,
      hiddenGem: false,
      verified: false,
    }), { now: NOW }, "th")).toBe("");
  });

  it("supports English copy from the same known facts", () => {
    expect(buildRecommendationReasonLine(place({
      liveOpenNow: true,
      distanceKm: 1.2,
      pricing: rangePricing(90, 120),
      placeType: "independent",
    }), { now: NOW }, "en")).toBe("Open now • 1.2 km • ฿90–120 • LOCAL");
  });
});
