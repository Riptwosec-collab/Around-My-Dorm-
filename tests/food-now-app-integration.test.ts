import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(join(process.cwd(), "components/AroundMyDormApp.tsx"), "utf8");
const sheetSource = readFileSync(join(process.cwd(), "components/FoodNowSheet.tsx"), "utf8");

describe("Food Now app integration", () => {
  it("uses the shared deterministic Food Now engine", () => {
    expect(appSource).toContain('from "@/lib/discovery/food-now"');
    expect(appSource).toContain("rankFoodNowOptions(");
  });

  it("does not keep the legacy inline Food Now scoring formula", () => {
    expect(appSource).not.toContain("const candidates = allPlaces.filter((place) => FOOD_CATEGORIES.has(place.category))");
    expect(appSource).not.toContain("(isOpen ? .25 : 0) + distance * .20");
  });

  it("keeps Food Now open after submit and stores 3-5 explainable choices instead of auto-opening rank 1", () => {
    expect(appSource).toContain("const [foodNowResults, setFoodNowResults]");
    expect(appSource).toContain("setFoodNowResults(ranked)");
    expect(appSource).not.toContain("if (ranked[0]) openDetail(ranked[0].place)");
    expect(appSource).toContain("results={foodNowResults}");
    expect(appSource).toContain("onOpenPlace={openDetail}");
  });

  it("renders result names and fact-based reason lines with a retry action", () => {
    expect(sheetSource).toContain("results: FoodNowResult[]");
    expect(sheetSource).toContain("result.reasonLine");
    expect(sheetSource).toContain("onOpenPlace(result.place)");
    expect(sheetSource).toMatch(/ลองใหม่|Try again/);
  });
});
