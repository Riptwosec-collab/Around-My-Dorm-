import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import {
  rankCandidateMatches,
  resolveCandidateMatch,
  scoreCandidateAgainstPlace,
} from "@/lib/maintenance/candidate-matching";

const seed = PLACES[0]!;

function place(id: string, overrides: Partial<typeof seed> = {}) {
  return {
    ...seed,
    id,
    slug: id,
    name: `Shop ${id}`,
    latitude: 13.82,
    longitude: 100.58,
    googlePlaceId: null,
    sourceId: null,
    address: null,
    phone: null,
    website: null,
    ...overrides,
  };
}

describe("candidate identity matching", () => {
  it("gives an exact provider or Google identity the strongest signal", () => {
    const sourceMatch = scoreCandidateAgainstPlace(
      place("source", { sourceId: "provider-123" }),
      { name: "Different name", sourceId: "provider-123" },
    );
    const googleMatch = scoreCandidateAgainstPlace(
      place("google", { googlePlaceId: "g-123" }),
      { name: "Different name", googlePlaceId: "g-123" },
    );

    expect(sourceMatch.score).toBeGreaterThanOrEqual(100);
    expect(googleMatch.score).toBeGreaterThanOrEqual(100);
  });

  it("combines exact normalized name and nearby coordinates", () => {
    const match = scoreCandidateAgainstPlace(
      place("near", { name: "ร้านกาแฟ ABC", latitude: 13.82, longitude: 100.58 }),
      { name: "ร้านกาแฟ ABC", latitude: 13.8202, longitude: 100.5802 },
    );

    expect(match.score).toBeGreaterThanOrEqual(85);
  });

  it("penalizes a same-name candidate that is far away", () => {
    const match = scoreCandidateAgainstPlace(
      place("far", { name: "ABC Cafe", latitude: 13.82, longitude: 100.58 }),
      { name: "ABC Cafe", latitude: 13.92, longitude: 100.68 },
    );

    expect(match.score).toBeLessThan(65);
    expect(resolveCandidateMatch([place("far", { name: "ABC Cafe" })], {
      name: "ABC Cafe",
      latitude: 14.2,
      longitude: 101.2,
    }).matchedPlaceId).toBeNull();
  });

  it("marks close top-two matches as ambiguous instead of choosing one", () => {
    const places = [
      place("a", { name: "Cafe Same", latitude: 13.82, longitude: 100.58 }),
      place("b", { name: "Cafe Same", latitude: 13.8201, longitude: 100.5801 }),
    ];
    const result = resolveCandidateMatch(places, {
      name: "Cafe Same",
      latitude: 13.82005,
      longitude: 100.58005,
    });

    expect(result.matchedPlaceId).toBeNull();
    expect(result.ambiguous).toBe(true);
    expect(result.possibleMatchIds).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("ranks strongest identity evidence first", () => {
    const ranked = rankCandidateMatches(
      [
        place("weak", { name: "Coffee Other" }),
        place("strong", { googlePlaceId: "g-strong" }),
      ],
      { name: "Somewhere", googlePlaceId: "g-strong" },
    );

    expect(ranked[0]?.placeId).toBe("strong");
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? -Infinity);
  });
});
