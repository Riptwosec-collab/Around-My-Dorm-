import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import type { GoogleDiscoveryCandidate } from "@/lib/google-live";
import {
  candidateFromGoogle,
  candidateFromImport,
  canPublishCandidate,
  createPlaceCandidate,
  materializeReviewedPlace,
} from "@/lib/maintenance/place-candidates";
import { DORM_CENTER } from "@/lib/place-utils";

const seed = PLACES[0]!;

function canonical(id: string, overrides: Partial<typeof seed> = {}) {
  return {
    ...seed,
    id,
    slug: id,
    name: `Canonical ${id}`,
    latitude: DORM_CENTER.lat,
    longitude: DORM_CENTER.lng,
    googlePlaceId: null,
    sourceId: null,
    ...overrides,
  };
}

function googleResult(overrides: Partial<GoogleDiscoveryCandidate> = {}): GoogleDiscoveryCandidate {
  return {
    googlePlaceId: "g-new",
    name: "New Google Cafe",
    address: "Ladprao 35",
    latitude: DORM_CENTER.lat + 0.006,
    longitude: DORM_CENTER.lng,
    primaryType: "cafe",
    primaryTypeLabel: "Cafe",
    rating: 4.5,
    reviewCount: 10,
    openNow: true,
    googleMapsUrl: "https://maps.google.com/?cid=g-new",
    fetchedAt: "2026-09-14T03:00:00.000Z",
    ...overrides,
  };
}

describe("staged place candidate domain", () => {
  it("adapts Google search results without inventing detail-only fields", () => {
    const candidate = candidateFromGoogle(googleResult(), [], "cafe");

    expect(candidate.sourceProvider).toBe("google_places_admin");
    expect(candidate.sourceId).toBe("g-new");
    expect(candidate.proposedPlace.googlePlaceId).toBe("g-new");
    expect(candidate.proposedPlace.category).toBe("cafe");
    expect(candidate.proposedPlace.phone).toBeUndefined();
    expect(candidate.proposedPlace.image).toBeUndefined();
    expect(candidate.proposedPlace.priceText).toBeUndefined();
    expect(candidate.proposedPlace.openingHours).toBeUndefined();
  });

  it("preserves approved import provenance and proposed category", () => {
    const candidate = candidateFromImport({
      name: "Imported Noodles",
      sourceProvider: "approved_import",
      sourceId: "import-77",
      sourceUrl: "https://source.test/import-77",
      category: "noodle",
      categories: ["noodle"],
      latitude: DORM_CENTER.lat + 0.004,
      longitude: DORM_CENTER.lng,
    }, []);

    expect(candidate.sourceProvider).toBe("approved_import");
    expect(candidate.sourceId).toBe("import-77");
    expect(candidate.proposedPlace.category).toBe("noodle");
    expect(candidate.proposedPlace.source).toContain("approved_import");
    expect(candidate.proposedPlace.sourceUrl).toBe("https://source.test/import-77");
  });

  it("sends possible identity matches to review instead of publishing automatically", () => {
    const places = [canonical("existing", {
      name: "Same Cafe",
      latitude: DORM_CENTER.lat + 0.001,
      longitude: DORM_CENTER.lng,
    })];
    const candidate = createPlaceCandidate({
      places,
      sourceProvider: "approved_import",
      sourceId: null,
      proposedPlace: {
        name: "Same Cafe",
        category: "cafe",
        categories: ["cafe"],
        latitude: DORM_CENTER.lat + 0.0011,
        longitude: DORM_CENTER.lng,
        source: ["approved_import"],
      },
      now: "2026-09-14T03:00:00.000Z",
    });

    expect(candidate.status).toBe("needs_review");
    expect(candidate.possibleMatchIds).toContain("existing");
    expect(candidate.validationIssues.some((issue) => issue.code === "possible_duplicate")).toBe(true);
    expect(canPublishCandidate(candidate).allowed).toBe(false);
  });

  it("blocks invalid coordinates and missing category", () => {
    const candidate = createPlaceCandidate({
      places: [],
      sourceProvider: "approved_import",
      sourceId: "bad-1",
      proposedPlace: {
        name: "Broken Place",
        latitude: 120,
        longitude: 100.58,
        source: ["approved_import"],
      },
      now: "2026-09-14T03:00:00.000Z",
    });

    expect(candidate.validationIssues.some((issue) => issue.code === "invalid_coordinates" && issue.severity === "p0")).toBe(true);
    expect(candidate.validationIssues.some((issue) => issue.code === "missing_category" && issue.severity === "p0")).toBe(true);
    expect(canPublishCandidate(candidate).allowed).toBe(false);
  });

  it("allows a valid unique sourced candidate through the publish gate", () => {
    const candidate = createPlaceCandidate({
      places: [],
      sourceProvider: "approved_import",
      sourceId: "ready-1",
      proposedPlace: {
        name: "Ready Cafe",
        category: "cafe",
        categories: ["cafe"],
        latitude: DORM_CENTER.lat + 0.007,
        longitude: DORM_CENTER.lng,
        source: ["approved_import"],
      },
      now: "2026-09-14T03:00:00.000Z",
    });

    expect(candidate.status).toBe("new");
    expect(canPublishCandidate(candidate)).toEqual({ allowed: true, blockers: [] });
  });

  it("materializes known fields while leaving unknown facts unknown", () => {
    const candidate = candidateFromGoogle(googleResult({ rating: null, reviewCount: null, openNow: null }), [], "cafe");
    const place = materializeReviewedPlace(candidate);

    expect(place.name).toBe("New Google Cafe");
    expect(place.category).toBe("cafe");
    expect(place.source).toContain("google_places_admin");
    expect(place.phone).toBeNull();
    expect(place.image).toBeNull();
    expect(place.priceText).toBeNull();
    expect(place.walkingMinutes).toBeNull();
    expect(place.drivingMinutes).toBeNull();
    expect(place.verified).toBe(false);
  });
});
