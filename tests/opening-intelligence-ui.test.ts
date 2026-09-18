import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cardSource = readFileSync("components/PlaceCard.tsx", "utf8");
const detailSource = readFileSync("components/PlaceDetail.tsx", "utf8");
const decisionSource = readFileSync("components/PlaceDecisionPanel.tsx", "utf8");

describe("opening intelligence UI", () => {
  it("uses the shared opening formatter on cards", () => {
    expect(cardSource).toContain('from "@/lib/opening-intelligence"');
    expect(cardSource).toContain("buildOpeningIntelligence(status");
    expect(cardSource).toContain("openingIntelligence.primary");
    expect(cardSource).toContain("openingIntelligence.secondary");
  });

  it("uses the shared formatter in detail decision UI while keeping freshness independent", () => {
    expect(detailSource).toContain('from "@/components/PlaceDecisionPanel"');
    expect(decisionSource).toContain('from "@/lib/opening-intelligence"');
    expect(decisionSource).toContain("buildOpeningIntelligence(openStatus");
    expect(decisionSource).toContain("opening.primary");
    expect(decisionSource).toContain('getFieldFreshness(place, "openingHours")');
  });

  it("does not trigger route calculation from opening rendering", () => {
    expect(cardSource).not.toContain("fetchGooglePlace");
    expect(decisionSource).not.toContain("calculateRoute(");
  });
});
