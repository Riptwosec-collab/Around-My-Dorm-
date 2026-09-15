import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "components/AroundMyDormApp.tsx"), "utf8");

describe("Food Now app integration", () => {
  it("uses the shared deterministic Food Now engine", () => {
    expect(source).toContain('from "@/lib/discovery/food-now"');
    expect(source).toContain("rankFoodNowOptions(");
  });

  it("does not keep the legacy inline Food Now scoring formula", () => {
    expect(source).not.toContain("const candidates = allPlaces.filter((place) => FOOD_CATEGORIES.has(place.category))");
    expect(source).not.toContain("(isOpen ? .25 : 0) + distance * .20");
  });
});
