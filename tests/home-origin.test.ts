import { describe, expect, it } from "vitest";
import { isUsableHomeOrigin } from "@/lib/home-origin";

describe("HOME origin", () => {
  it("rejects unresolved HOME records", () => {
    expect(isUsableHomeOrigin({ googlePlaceId: null, latitude: null, longitude: null, verifiedAt: null } as any)).toBe(false);
  });

  it("rejects invalid coordinates even when an ID exists", () => {
    expect(isUsableHomeOrigin({ googlePlaceId: "ChIJ-home", latitude: 999, longitude: 100.58, verifiedAt: "2026-09-12T00:00:00Z" } as any)).toBe(false);
  });

  it("accepts only a verified origin with finite valid coordinates", () => {
    expect(isUsableHomeOrigin({
      googlePlaceId: "ChIJ-home",
      latitude: 13.82,
      longitude: 100.58,
      verifiedAt: "2026-09-12T00:00:00Z",
    } as any)).toBe(true);
  });
});
