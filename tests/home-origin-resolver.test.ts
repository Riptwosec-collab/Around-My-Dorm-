import { describe, expect, it } from "vitest";
import { assessHomeOriginCandidate, shouldAutoRecommendHomeOrigin } from "@/lib/home-origin-resolver";
import type { GoogleDiscoveryCandidate } from "@/lib/google-live";

function candidate(input: Partial<GoogleDiscoveryCandidate>): GoogleDiscoveryCandidate {
  return {
    googlePlaceId: "ChIJ-home",
    name: "บ้านสุภาอพาร์ทเม้นต์",
    address: "รัชดาภิเษก 36 จันทรเกษม จตุจักร กรุงเทพมหานคร",
    latitude: 13.82,
    longitude: 100.58,
    primaryType: "lodging",
    primaryTypeLabel: "Apartment",
    rating: null,
    reviewCount: null,
    openNow: null,
    googleMapsUrl: "https://maps.google.com/?cid=home",
    fetchedAt: "2026-09-12T00:00:00Z",
    ...input,
  };
}

describe("HOME origin resolver", () => {
  it("scores the exact Thai HOME name very highly", () => {
    const result = assessHomeOriginCandidate(candidate({}));
    expect(result.nameScore).toBeGreaterThanOrEqual(0.95);
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it("does not auto-recommend a similarly named place without Bangkok/address evidence", () => {
    const result = assessHomeOriginCandidate(candidate({ address: "เชียงใหม่ ประเทศไทย" }));
    expect(shouldAutoRecommendHomeOrigin(result, null)).toBe(false);
  });

  it("requires a meaningful margin over the second candidate", () => {
    const first = assessHomeOriginCandidate(candidate({}));
    const second = { ...first, score: first.score - 2 };
    expect(shouldAutoRecommendHomeOrigin(first, second)).toBe(false);
  });
});
