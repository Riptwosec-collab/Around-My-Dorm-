import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import { createPlaceCandidate } from "@/lib/maintenance/place-candidates";
import { buildReviewQueue, filterReviewQueue } from "@/lib/maintenance/review-queue";
import { DORM_CENTER } from "@/lib/place-utils";
import type { PlaceUpdateDiff } from "@/lib/place-update-engine";

const seed = PLACES[0]!;
const NOW = new Date("2026-09-14T04:00:00.000Z").getTime();

function place(id: string, overrides: Partial<typeof seed> = {}) {
  return {
    ...seed,
    id,
    slug: id,
    name: `Place ${id}`,
    category: "cafe" as const,
    categories: ["cafe" as const],
    latitude: DORM_CENTER.lat + 0.001,
    longitude: DORM_CENTER.lng,
    googleMapsUrl: "https://maps.google.com/example",
    image: "https://img.test/example.jpg",
    images: ["https://img.test/example.jpg"],
    openingHoursText: "08:00-20:00",
    minPrice: 50,
    maxPrice: 100,
    verified: true,
    dataStatus: "verified" as const,
    lastChecked: "2026-09-10T00:00:00.000Z",
    source: ["manual"],
    ...overrides,
  };
}

describe("unified review queue", () => {
  it("groups place reasons once and sorts p0 before p1, p2, and p3", () => {
    const queue = buildReviewQueue({
      places: [
        place("p0", { latitude: 120, longitude: 100.58 }),
        place("p1", { category: "cafe", categories: ["food"] }),
        place("p2", { googleMapsUrl: null, lastChecked: "2026-01-01T00:00:00.000Z" }),
        place("p3", { image: null, coverImage: null, images: [], imageMetadata: [], minPrice: null, maxPrice: null, priceText: null, averagePricePerPerson: null, pricing: undefined }),
      ],
      candidates: [],
      now: NOW,
    });

    expect(queue.map((item) => item.priority)).toEqual(["p0", "p1", "p2", "p3"]);
    const stale = queue.find((item) => item.entityId === "p2")!;
    expect(stale.reasons).toEqual(expect.arrayContaining(["missing_maps", "stale_record"]));
    expect(queue.filter((item) => item.entityId === "p2")).toHaveLength(1);
  });

  it("adds a unique new candidate and keeps possible duplicates at p1", () => {
    const existing = place("existing", { name: "Same Cafe" });
    const fresh = createPlaceCandidate({
      places: [],
      sourceProvider: "approved_import",
      sourceId: "fresh-1",
      proposedPlace: {
        name: "Fresh Noodles",
        category: "noodle",
        categories: ["noodle"],
        latitude: DORM_CENTER.lat + 0.008,
        longitude: DORM_CENTER.lng,
        source: ["approved_import"],
      },
      now: "2026-09-14T03:00:00.000Z",
    });
    const duplicate = createPlaceCandidate({
      places: [existing],
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
      now: "2026-09-14T03:10:00.000Z",
    });

    const queue = buildReviewQueue({ places: [existing], candidates: [fresh, duplicate], now: NOW });
    const freshItem = queue.find((item) => item.entityId === fresh.id)!;
    const duplicateItem = queue.find((item) => item.entityId === duplicate.id)!;

    expect(freshItem.reasons).toContain("new_place");
    expect(duplicateItem.priority).toBe("p1");
    expect(duplicateItem.reasons).toContain("possible_duplicate");
  });

  it("promotes high-risk pending field changes to p1 review work", () => {
    const change: PlaceUpdateDiff = {
      id: "change-1",
      placeId: "existing",
      placeName: "Existing",
      source: "approved_import",
      detectedAt: "2026-09-13T00:00:00.000Z",
      risk: "high",
      fields: [{ field: "googlePlaceId", previousValue: "g-old", incomingValue: "g-new", risk: "high" }],
    };

    const queue = buildReviewQueue({ places: [], candidates: [], pendingChanges: [change], now: NOW });
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ kind: "change", entityId: "change-1", priority: "p1" });
    expect(queue[0]?.reasons).toContain("high_risk_change");
  });

  it("skips terminal candidates and supports deterministic filters", () => {
    const candidate = createPlaceCandidate({
      places: [],
      sourceProvider: "approved_import",
      sourceId: "candidate-1",
      proposedPlace: {
        name: "Candidate Cafe",
        category: "cafe",
        categories: ["cafe"],
        latitude: DORM_CENTER.lat + 0.001,
        longitude: DORM_CENTER.lng,
        source: ["approved_import"],
      },
      now: "2026-09-14T03:00:00.000Z",
    });
    const approved = { ...candidate, id: "approved-id", candidateKey: "approved-key", status: "approved" as const };
    const queue = buildReviewQueue({ places: [], candidates: [candidate, approved], now: NOW });

    expect(queue.some((item) => item.entityId === approved.id)).toBe(false);
    expect(filterReviewQueue(queue, { priorities: ["p3"] })).toHaveLength(1);
    expect(filterReviewQueue(queue, { category: "cafe", source: "approved_import", ringId: "r1" })).toHaveLength(1);
    expect(filterReviewQueue(queue, { reasons: ["possible_duplicate"] })).toHaveLength(0);
  });
});
