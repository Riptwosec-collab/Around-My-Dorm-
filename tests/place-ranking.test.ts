import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS } from "@/components/FilterSheet";
import { PLACES } from "@/data/places";
import { passesFilters, recommendationReasons, recommendationScore, smartLocalPicks, sortPlaces } from "@/lib/place-ranking";

const seed = PLACES[0];

describe("smart local recommendation engine", () => {
  it("prefers a nearby, open, verified local place that matches user interests", () => {
    const strong = {
      ...seed,
      id: "ranking-strong",
      category: "cafe" as const,
      categories: ["cafe" as const],
      distanceKm: 0.2,
      placeType: "local" as const,
      localFavorite: true,
      verified: true,
      dataStatus: "verified" as const,
      liveOpenNow: true,
      rating: 4.8,
      reviewCount: 250,
    };
    const weak = {
      ...seed,
      id: "ranking-weak",
      category: "food" as const,
      categories: ["food" as const],
      distanceKm: 2.8,
      placeType: "chain" as const,
      localFavorite: false,
      verified: false,
      dataStatus: "unverified" as const,
      liveOpenNow: false,
      rating: 3.7,
      reviewCount: 5,
    };
    const context = { preferredCategories: new Set(["cafe" as const]), now: new Date("2026-09-08T12:00:00+07:00") };
    expect(recommendationScore(strong, context)).toBeGreaterThan(recommendationScore(weak, context));
    expect(sortPlaces([weak, strong], "recommended", context)[0]?.id).toBe("ranking-strong");
    expect(smartLocalPicks([weak, strong], context, 1)[0]?.id).toBe("ranking-strong");
  });

  it("explains recommendations with concise reasons", () => {
    const place = {
      ...seed,
      id: "reason-place",
      category: "cafe" as const,
      categories: ["cafe" as const],
      distanceKm: 0.3,
      placeType: "local" as const,
      localFavorite: true,
      verified: true,
      liveOpenNow: true,
    };
    const reasons = recommendationReasons(place, { preferredCategories: new Set(["cafe" as const]) }, "th");
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.length).toBeLessThanOrEqual(3);
  });

  it("keeps existing strict filters intact", () => {
    const unverified = { ...seed, verified: false };
    expect(passesFilters(unverified, { ...EMPTY_FILTERS, verifiedOnly: true }, false)).toBe(false);
  });
});
