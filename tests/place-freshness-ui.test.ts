import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cardSource = readFileSync("components/PlaceCard.tsx", "utf8");
const detailSource = readFileSync("components/PlaceDetail.tsx", "utf8");

describe("field freshness UI wiring", () => {
  it("uses opening-hours freshness as a compact PlaceCard warning", () => {
    expect(cardSource).toContain('from "@/lib/place-freshness"');
    expect(cardSource).toContain('getFieldFreshness(place, "openingHours")');
    expect(cardSource).toContain("openingFreshness.status");
    expect(cardSource).not.toContain('getFieldFreshness(place, "price")');
    expect(cardSource).not.toContain('getFieldFreshness(place, "parking")');
  });

  it("renders independent opening, price, and parking freshness in PlaceDetail", () => {
    expect(detailSource).toContain('from "@/lib/place-freshness"');
    expect(detailSource).toContain('getFieldFreshness(place, "openingHours")');
    expect(detailSource).toContain('getFieldFreshness(place, "price")');
    expect(detailSource).toContain('getFieldFreshness(place, "parking")');
    expect(detailSource).toContain("formatFreshnessLabel(openingFreshness, language)");
    expect(detailSource).toContain("formatFreshnessLabel(priceFreshness, language)");
    expect(detailSource).toContain("formatFreshnessLabel(parkingFreshness, language)");
  });
});
