import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "components/AroundMyDormApp.tsx"), "utf8");

describe("Search Assist app integration", () => {
  it("parses natural search once and passes the active intent into discovery", () => {
    expect(source).toContain('from "@/lib/discovery/query-intent"');
    expect(source).toContain("parseDiscoveryQuery(debouncedQuery)");
    expect(source).toContain("queryIntent,");
    expect(source).toContain("queryIntent.suggestedSortMode ?? sortMode");
  });

  it("keeps bounded in-memory search history and deterministic local suggestions", () => {
    expect(source).toContain("const [searchHistory, setSearchHistory]");
    expect(source).toContain("buildSearchSuggestions(");
    expect(source).toContain("addSearchHistoryEntry(");
    expect(source).toContain("onSearchSuggestion");
  });

  it("renders parsed intent chips and explicit zero-result relaxations", () => {
    expect(source).toContain("<SearchAssistPanel");
    expect(source).toContain("recognizedLabels={queryIntent.recognizedLabels}");
    expect(source).toContain("buildRelaxationOptions(");
    expect(source).toContain("applyDiscoveryRelaxation(");
    expect(source).toContain("onRelaxSearch");
  });

  it("does not automatically relax a natural-language constraint", () => {
    expect(source).not.toContain("if (!visiblePlaces.length) setFilters");
    expect(source).not.toContain("if (!visiblePlaces.length) setQueryIntentOverride");
  });
});
