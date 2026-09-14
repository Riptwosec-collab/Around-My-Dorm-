import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS } from "@/components/FilterSheet";
import { PLACES } from "@/data/places";
import { passesFilters, recommendationReasons, recommendationScore, smartLocalPicks, sortPlaces } from "@/lib/place-ranking";

const seed = PLACES[0];
const NOW = new Date("2026-09-08T12:00:00+07:00");

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
    const context = { preferredCategories: new Set(["cafe" as const]), now: NOW };
    expect(recommendationScore(strong, context)).toBeGreaterThan(recommendationScore(weak, context));
    expect(sortPlaces([weak, strong], "recommended", context)[0]?.id).toBe("ranking-strong");
    expect(smartLocalPicks([weak, strong], context, 1)[0]?.id).toBe("ranking-strong");
  });

  it("makes open-now and distance primary signals while keeping unknown neutral", () => {
    const base = {
      ...seed,
      category: "cafe" as const,
      categories: ["cafe" as const],
      recommended: false,
      localFavorite: false,
      hiddenGem: false,
      placeType: "chain" as const,
      verified: false,
      dataStatus: "partial" as const,
      rating: null,
      reviewCount: null,
    };
    const openNear = { ...base, id: "open-near", liveOpenNow: true, distanceKm: 0.2 };
    const unknown = { ...base, id: "unknown", liveOpenNow: null, distanceKm: null };
    const closedNear = { ...base, id: "closed-near", liveOpenNow: false, distanceKm: 0.2 };

    expect(recommendationScore(openNear, { now: NOW })).toBeGreaterThan(recommendationScore(unknown, { now: NOW }));
    expect(recommendationScore(unknown, { now: NOW })).toBeGreaterThan(recommendationScore(closedNear, { now: NOW }));
  });

  it("gives preferred category a bounded boost without letting ratings dominate now-fit", () => {
    const preferred = {
      ...seed,
      id: "preferred",
      category: "cafe" as const,
      categories: ["cafe" as const],
      liveOpenNow: true,
      distanceKm: 0.4,
      rating: 4.0,
      reviewCount: 10,
    };
    const highlyRatedClosed = {
      ...seed,
      id: "rated-closed",
      category: "food" as const,
      categories: ["food" as const],
      liveOpenNow: false,
      distanceKm: 0.4,
      rating: 5.0,
      reviewCount: 5000,
    };
    const context = { preferredCategories: new Set(["cafe" as const]), now: NOW };
    expect(recommendationScore(preferred, context)).toBeGreaterThan(recommendationScore(highlyRatedClosed, context));
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
    const reasons = recommendationReasons(place, { preferredCategories: new Set(["cafe" as const]), now: NOW }, "th");
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.length).toBeLessThanOrEqual(3);
  });

  it("keeps existing strict filters intact", () => {
    const unverified = { ...seed, verified: false };
    expect(passesFilters(unverified, { ...EMPTY_FILTERS, verifiedOnly: true }, false)).toBe(false);
  });
});
