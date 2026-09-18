import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const queue = readFileSync("components/PlaceReportAdminQueue.tsx", "utf8");
const dashboard = readFileSync("components/DataQualityDashboard.tsx", "utf8");
const detail = readFileSync("components/PlaceDetail.tsx", "utf8");
const decision = readFileSync("components/PlaceDecisionPanel.tsx", "utf8");

describe("place report admin and public warning UI", () => {
  it("provides admin-only queue states and transitions", () => {
    expect(queue).toContain("loadPlaceReports");
    expect(queue).toContain("transitionPlaceReport");
    for (const status of ["pending", "reviewed", "resolved", "rejected"]) expect(queue).toContain(status);
    expect(queue).toContain("duplicateCount");
    expect(dashboard).toContain("PlaceReportAdminQueue");
  });

  it("loads only aggregate warning RPC data in public detail", () => {
    expect(detail).toContain("loadPlaceReportWarnings(place.id)");
    expect(detail).not.toContain("loadPlaceReports(");
    expect(detail).toContain("กำลังตรวจสอบ");
    expect(detail).toContain("under review");
  });

  it("passes language through the decision panel to the report sheet", () => {
    expect(detail).toContain("<PlaceDecisionPanel");
    expect(decision).toContain("<ReportPlaceSheet place={place}");
    expect(decision).toContain("language={language}");
  });
});
