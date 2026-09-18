import { describe, expect, it } from "vitest";
import { formatFreshnessLabel, getFieldFreshness } from "@/lib/place-freshness";

const NOW = new Date("2026-09-17T00:00:00.000Z");

function place(overrides: Record<string, unknown> = {}) {
  return {
    fieldProvenance: {},
    openingHoursVerifiedAt: null,
    priceVerifiedAt: null,
    parkingVerifiedAt: null,
    phoneVerifiedAt: null,
    locationVerifiedAt: null,
    imageVerifiedAt: null,
    ...overrides,
  } as any;
}

describe("getFieldFreshness", () => {
  it("marks opening hours day 14 fresh, day 15 aging, and day 31 stale", () => {
    expect(getFieldFreshness(place({ openingHoursVerifiedAt: "2026-09-03T00:00:00.000Z" }), "openingHours", NOW).status).toBe("fresh");
    expect(getFieldFreshness(place({ openingHoursVerifiedAt: "2026-09-02T00:00:00.000Z" }), "openingHours", NOW).status).toBe("aging");
    expect(getFieldFreshness(place({ openingHoursVerifiedAt: "2026-08-17T00:00:00.000Z" }), "openingHours", NOW).status).toBe("stale");
  });

  it("uses 30/60 day boundaries for price and parking", () => {
    expect(getFieldFreshness(place({ priceVerifiedAt: "2026-08-18T00:00:00.000Z" }), "price", NOW).status).toBe("fresh");
    expect(getFieldFreshness(place({ priceVerifiedAt: "2026-08-17T00:00:00.000Z" }), "price", NOW).status).toBe("aging");
    expect(getFieldFreshness(place({ priceVerifiedAt: "2026-07-19T00:00:00.000Z" }), "price", NOW).status).toBe("aging");
    expect(getFieldFreshness(place({ priceVerifiedAt: "2026-07-18T00:00:00.000Z" }), "price", NOW).status).toBe("stale");

    expect(getFieldFreshness(place({ parkingVerifiedAt: "2026-08-18T00:00:00.000Z" }), "parking", NOW).status).toBe("fresh");
    expect(getFieldFreshness(place({ parkingVerifiedAt: "2026-07-18T00:00:00.000Z" }), "parking", NOW).status).toBe("stale");
  });

  it("uses field-specific single-threshold freshness for contact, location, and image", () => {
    expect(getFieldFreshness(place({ phoneVerifiedAt: "2026-06-19T00:00:00.000Z" }), "contact", NOW).status).toBe("fresh");
    expect(getFieldFreshness(place({ phoneVerifiedAt: "2026-06-18T00:00:00.000Z" }), "contact", NOW).status).toBe("stale");
    expect(getFieldFreshness(place({ locationVerifiedAt: "2026-03-21T00:00:00.000Z" }), "location", NOW).status).toBe("fresh");
    expect(getFieldFreshness(place({ locationVerifiedAt: "2026-03-20T00:00:00.000Z" }), "location", NOW).status).toBe("stale");
    expect(getFieldFreshness(place({ imageVerifiedAt: "2026-03-20T00:00:00.000Z" }), "image", NOW).status).toBe("stale");
  });

  it("prefers matching field provenance over the field timestamp", () => {
    const result = getFieldFreshness(place({
      openingHoursVerifiedAt: "2026-09-16T00:00:00.000Z",
      fieldProvenance: {
        openingHours: {
          source: "manual_verified",
          checkedAt: "2026-08-01T00:00:00.000Z",
          verifiedAt: "2026-08-01T00:00:00.000Z",
          confidence: "verified",
        },
      },
    }), "openingHours", NOW);

    expect(result.status).toBe("stale");
    expect(result.verifiedAt).toBe("2026-08-01T00:00:00.000Z");
  });

  it("falls back to provenance checkedAt when verifiedAt is absent", () => {
    const result = getFieldFreshness(place({
      priceVerifiedAt: "2026-09-16T00:00:00.000Z",
      fieldProvenance: {
        price: {
          source: "official",
          checkedAt: "2026-07-01T00:00:00.000Z",
          confidence: "high",
        },
      },
    }), "price", NOW);

    expect(result.verifiedAt).toBe("2026-07-01T00:00:00.000Z");
    expect(result.status).toBe("stale");
  });

  it("returns unknown for missing or invalid timestamps", () => {
    expect(getFieldFreshness(place(), "price", NOW)).toEqual({ status: "unknown", ageDays: null, verifiedAt: null });
    expect(getFieldFreshness(place({ priceVerifiedAt: "not-a-date" }), "price", NOW)).toEqual({ status: "unknown", ageDays: null, verifiedAt: null });
  });

  it("clamps future verification timestamps to age zero", () => {
    const result = getFieldFreshness(place({ openingHoursVerifiedAt: "2026-09-18T00:00:00.000Z" }), "openingHours", NOW);
    expect(result.status).toBe("fresh");
    expect(result.ageDays).toBe(0);
  });
});

describe("formatFreshnessLabel", () => {
  it("formats Thai and English labels", () => {
    const result = { status: "aging", ageDays: 18, verifiedAt: "2026-08-30T00:00:00.000Z" } as const;
    expect(formatFreshnessLabel(result, "th")).toContain("18");
    expect(formatFreshnessLabel(result, "en")).toContain("18");
  });

  it("formats unknown without inventing an age", () => {
    const result = { status: "unknown", ageDays: null, verifiedAt: null } as const;
    expect(formatFreshnessLabel(result, "th")).toBe("ยังไม่เคยยืนยัน");
    expect(formatFreshnessLabel(result, "en")).toBe("Not verified yet");
  });
});
