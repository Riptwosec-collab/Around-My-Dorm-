import { describe, expect, it } from "vitest";
import { mapReportTypeToReliabilityDomain } from "@/lib/reliability/report-domain";
import { scoreReliabilityTask } from "@/lib/reliability/priority";

describe("Phase 4 reliability priority", () => {
  it("maps report types to the approved verification domains", () => {
    expect(mapReportTypeToReliabilityDomain("opening_hours")).toBe("openingHours");
    expect(mapReportTypeToReliabilityDomain("closed")).toBe("openingHours");
    expect(mapReportTypeToReliabilityDomain("price")).toBe("price");
    expect(mapReportTypeToReliabilityDomain("parking")).toBe("parking");
    expect(mapReportTypeToReliabilityDomain("phone")).toBe("phone");
    expect(mapReportTypeToReliabilityDomain("location")).toBe("location");
    expect(mapReportTypeToReliabilityDomain("moved")).toBe("location");
    expect(mapReportTypeToReliabilityDomain("other")).toBe("reportReview");
  });

  it("caps deterministic priority at 100 and preserves score breakdown", () => {
    const result = scoreReliabilityTask({
      reportStatus: "pending",
      freshnessStatus: "stale",
      recommended: true,
      localFavorite: false,
      field: "openingHours",
      highSeverityCoverageGap: true,
      independentIssueCategoryCount: 4,
      coverageOnly: false,
    });

    expect(result.priority).toBe(100);
    expect(result.severity).toBe("critical");
    expect(result.breakdown.map((part) => part.code)).toEqual(expect.arrayContaining([
      "report_pending",
      "freshness_stale",
      "important_place",
      "critical_field",
      "coverage_high",
      "multi_issue",
    ]));
  });

  it("gives standalone coverage work a visible base score", () => {
    const result = scoreReliabilityTask({
      reportStatus: null,
      freshnessStatus: null,
      recommended: false,
      localFavorite: false,
      field: "coverage",
      highSeverityCoverageGap: false,
      independentIssueCategoryCount: 1,
      coverageOnly: true,
    });
    expect(result.priority).toBe(20);
    expect(result.severity).toBe("low");
  });
});
