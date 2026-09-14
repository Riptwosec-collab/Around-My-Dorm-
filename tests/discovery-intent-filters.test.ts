import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS } from "@/components/FilterSheet";
import {
  detectDiscoveryConflicts,
  effectiveIntentCategories,
  mergeIntentFilters,
} from "@/lib/discovery/intent-filters";
import { parseDiscoveryQuery } from "@/lib/discovery/query-intent";

describe("discovery intent filter merge", () => {
  it("uses the stricter budget ceiling", () => {
    const explicit = { ...EMPTY_FILTERS, maxPrice: 100 };
    const intent = parseDiscoveryQuery("ไม่เกิน 80");
    expect(mergeIntentFilters(explicit, intent).maxPrice).toBe(80);
  });

  it("keeps a stricter explicit budget ceiling", () => {
    const explicit = { ...EMPTY_FILTERS, maxPrice: 60 };
    const intent = parseDiscoveryQuery("ไม่เกิน 100");
    expect(mergeIntentFilters(explicit, intent).maxPrice).toBe(60);
  });

  it("ORs strict boolean constraints without turning Unknown into false facts", () => {
    const merged = mergeIntentFilters(
      { ...EMPTY_FILTERS, parking: true },
      parseDiscoveryQuery("เปิดอยู่"),
    );
    expect(merged.parking).toBe(true);
    expect(merged.onlyOpen).toBe(true);
  });

  it("uses the stricter walking ceiling and preserves explicit area/price levels", () => {
    const explicit = {
      ...EMPTY_FILTERS,
      maxWalkingMinutes: 8,
      area: "ลาดพร้าว 41",
      priceLevels: [1, 2],
    };
    const merged = mergeIntentFilters(explicit, parseDiscoveryQuery("กาแฟเดินถึง"));
    expect(merged.maxWalkingMinutes).toBe(8);
    expect(merged.area).toBe("ลาดพร้าว 41");
    expect(merged.priceLevels).toEqual([1, 2]);
  });

  it("reports an explicit category conflict instead of silently changing the user's category", () => {
    expect(detectDiscoveryConflicts("cafe", EMPTY_FILTERS, parseDiscoveryQuery("ก๋วยเตี๋ยว")))
      .toEqual([{ type: "category", messageKey: "category_conflict" }]);
  });

  it("keeps a compatible explicit category and applies query categories only when category is all", () => {
    expect(effectiveIntentCategories("cafe", parseDiscoveryQuery("กาแฟเปิดอยู่"))).toEqual(["cafe"]);
    expect(effectiveIntentCategories("all", parseDiscoveryQuery("กาแฟเปิดอยู่"))).toEqual(["cafe"]);
    expect(effectiveIntentCategories("all", parseDiscoveryQuery("เปิดอยู่"))).toBeNull();
  });

  it("does not report fake budget/walking conflicts for compatible upper-bound constraints", () => {
    const explicit = { ...EMPTY_FILTERS, maxPrice: 60, maxWalkingMinutes: 8 };
    const intent = parseDiscoveryQuery("ไม่เกิน 100 เดินถึง");
    expect(detectDiscoveryConflicts("all", explicit, intent)).toEqual([]);
  });
});
