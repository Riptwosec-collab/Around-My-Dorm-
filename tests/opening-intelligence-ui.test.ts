import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cardSource = readFileSync("components/PlaceCard.tsx", "utf8");
const detailSource = readFileSync("components/PlaceDetail.tsx", "utf8");

describe("opening intelligence UI", () => {
  it("uses the shared opening formatter on cards", () => {
    expect(cardSource).toContain('from "@/lib/opening-intelligence"');
    expect(cardSource).toContain("buildOpeningIntelligence(status");
    expect(cardSource).toContain("openingIntelligence.primary");
    expect(cardSource).toContain("openingIntelligence.secondary");
  });

  it("uses the shared formatter in detail while keeping freshness independent", () => {
    expect(detailSource).toContain('from "@/lib/opening-intelligence"');
    expect(detailSource).toContain("buildOpeningIntelligence(status");
    expect(detailSource).toContain("openingIntelligence.primary");
    expect(detailSource).toContain("openingFreshness.status");
  });

  it("does not wire opening rendering to Google request functions", () => {
    expect(cardSource).not.toContain("fetchGooglePlace");
    expect(detailSource).not.toContain("calculateRoute(");
  });
});
