import { describe, expect, it } from "vitest";
import { evaluateFieldWrite, normalizeFieldSource, prepareProvenancePatch } from "@/lib/field-provenance";
import type { Place } from "@/types/place";

function place(overrides: Partial<Place> = {}) {
  return {
    id: "p1",
    name: "Verified Local Shop",
    source: ["seed"],
    verified: true,
    phone: "021234567",
    googlePlaceId: null,
    lastVerified: "2026-09-01T00:00:00.000Z",
    ...overrides,
  } as Place;
}

describe("field provenance", () => {
  it("normalizes explicit human review as highest-confidence provenance", () => {
    expect(normalizeFieldSource("google_places_admin:field_review")).toBe("manual_verified");
  });

  it("protects a known verified seed field from lower-priority Google enrichment", () => {
    const decision = evaluateFieldWrite(place(), "phone", "029999999", "google_places_admin");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("protected_higher_confidence");
  });

  it("allows Google to fill a genuinely missing field", () => {
    const decision = evaluateFieldWrite(place({ phone: null }), "phone", "029999999", "google_places_admin");
    expect(decision.allowed).toBe(true);
  });

  it("allows an explicit reviewed field choice and records verified provenance", () => {
    const result = prepareProvenancePatch(place(), { phone: "029999999" }, "google_places_admin:field_review", "2026-09-08T00:00:00.000Z");
    expect(result.blockedFields).toEqual([]);
    expect(result.appliedFields).toContain("phone");
    expect(result.patch.fieldProvenance?.phone.source).toBe("manual_verified");
    expect(result.patch.fieldProvenance?.phone.confidence).toBe("verified");
  });

  it("does not downgrade a populated value to null through an automatic source", () => {
    const result = prepareProvenancePatch(place(), { phone: null }, "approved_import");
    expect(result.appliedFields).toEqual([]);
    expect(result.blockedFields).toContain("phone");
  });
});
