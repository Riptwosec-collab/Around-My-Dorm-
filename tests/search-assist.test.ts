import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS } from "@/components/FilterSheet";
import { parseDiscoveryQuery } from "@/lib/discovery/query-intent";
import {
  addSearchHistoryEntry,
  applyDiscoveryRelaxation,
  buildRelaxationOptions,
  buildSearchSuggestions,
} from "@/lib/discovery/search-assist";

describe("local search assist", () => {
  it("keeps a normalized, de-duplicated, bounded in-memory history", () => {
    let history: string[] = [];
    history = addSearchHistoryEntry(history, "  คาเฟ่ภายใน 1 กม.  ", 3);
    history = addSearchHistoryEntry(history, "ข้าวไม่เกิน 100 เปิดอยู่", 3);
    history = addSearchHistoryEntry(history, "คาเฟ่ภายใน 1 กม.", 3);
    history = addSearchHistoryEntry(history, "ที่จอดรายเดือน", 3);
    history = addSearchHistoryEntry(history, "ร้าน Local เปิดดึก", 3);

    expect(history).toEqual([
      "ร้าน Local เปิดดึก",
      "ที่จอดรายเดือน",
      "คาเฟ่ภายใน 1 กม.",
    ]);
    expect(addSearchHistoryEntry(history, "   ", 3)).toEqual(history);
  });

  it("returns deterministic local suggestions with matching history first", () => {
    const history = ["คาเฟ่ภายใน 1 กม.", "ข้าวไม่เกิน 100 เปิดอยู่"];
    const suggestions = buildSearchSuggestions("คา", history, "th", 4);

    expect(suggestions[0]).toBe("คาเฟ่ภายใน 1 กม.");
    expect(suggestions.length).toBeLessThanOrEqual(4);
    expect(new Set(suggestions).size).toBe(suggestions.length);
  });

  it("only offers relaxations when zero results remain and never mutates constraints automatically", () => {
    const filters = { ...EMPTY_FILTERS, maxPrice: 80, onlyOpen: true, localOnly: true };
    const intent = parseDiscoveryQuery("ข้าวไม่เกิน 100 เปิดอยู่");
    const original = JSON.stringify({ category: "cafe", filters, intent });

    expect(buildRelaxationOptions({
      resultCount: 2,
      category: "cafe",
      filters,
      intent,
      language: "th",
    })).toEqual([]);

    const options = buildRelaxationOptions({
      resultCount: 0,
      category: "cafe",
      filters,
      intent,
      language: "th",
    });

    expect(options.map((option) => option.id)).toEqual(expect.arrayContaining([
      "clear_category",
      "relax_budget",
      "include_closed",
      "include_chains",
    ]));
    expect(JSON.stringify({ category: "cafe", filters, intent })).toBe(original);
  });

  it("applies exactly the relaxation the user explicitly chooses", () => {
    const state = {
      category: "cafe" as const,
      filters: { ...EMPTY_FILTERS, maxPrice: 80, onlyOpen: true, localOnly: true },
      intent: parseDiscoveryQuery("ข้าวไม่เกิน 100 เปิดอยู่"),
    };

    const relaxed = applyDiscoveryRelaxation(state, "relax_budget");

    expect(relaxed.category).toBe("cafe");
    expect(relaxed.filters.maxPrice).toBeNull();
    expect(relaxed.filters.onlyOpen).toBe(true);
    expect(relaxed.filters.localOnly).toBe(true);
    expect(relaxed.intent.filterPatch.maxPrice).toBeUndefined();
    expect(state.filters.maxPrice).toBe(80);
  });
});
