import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cardSource = readFileSync("components/PlaceCard.tsx", "utf8");
const detailSource = readFileSync("components/PlaceDetail.tsx", "utf8");
const decisionSource = readFileSync("components/PlaceDecisionPanel.tsx", "utf8");

describe("field freshness UI wiring", () => {
  it("uses opening-hours freshness as a compact PlaceCard warning", () => {
    expect(cardSource).toContain('from "@/lib/place-freshness"');
    expect(cardSource).toContain('getFieldFreshness(place, "openingHours")');
    expect(cardSource).toContain("openingFreshness.status");
    expect(cardSource).not.toContain('getFieldFreshness(place, "price")');
    expect(cardSource).not.toContain('getFieldFreshness(place, "parking")');
  });

  it("renders independent opening, price, and parking freshness in the detail decision panel", () => {
    expect(detailSource).toContain('from "@/components/PlaceDecisionPanel"');
    expect(detailSource).toContain("<PlaceDecisionPanel");
    expect(decisionSource).toContain('from "@/lib/place-freshness"');
    expect(decisionSource).toContain('getFieldFreshness(place, "openingHours")');
    expect(decisionSource).toContain('getFieldFreshness(place, "price")');
    expect(decisionSource).toContain('getFieldFreshness(place, "parking")');
    expect(decisionSource).toContain("formatFreshnessLabel(openingFreshness, language)");
    expect(decisionSource).toContain("formatFreshnessLabel(priceFreshness, language)");
    expect(decisionSource).toContain("formatFreshnessLabel(parkingFreshness, language)");
  });
});
