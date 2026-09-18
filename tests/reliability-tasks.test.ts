import { describe, expect, it } from "vitest";
import { buildReliabilityTasks } from "@/lib/reliability/tasks";
import type { PlaceReportRow } from "@/lib/cloud/place-reports";
import type { CoverageGap } from "@/lib/coverage/coverage";

const NOW = new Date("2026-09-18T09:00:00.000Z");

function place(overrides: Record<string, unknown> = {}) {
  return {
    id: "place-1",
    name: "Noodle Place",
    category: "noodle",
    categories: ["noodle"],
    recommended: true,
    localFavorite: false,
    latitude: 13.8197,
    longitude: 100.5847,
    openingHoursVerifiedAt: "2026-08-01T00:00:00.000Z",
    priceVerifiedAt: "2026-09-10T00:00:00.000Z",
    parkingVerifiedAt: "2026-09-10T00:00:00.000Z",
    phoneVerifiedAt: "2026-09-10T00:00:00.000Z",
    locationVerifiedAt: "2026-09-10T00:00:00.000Z",
    fieldProvenance: {},
    ...overrides,
  } as any;
}

function report(overrides: Partial<PlaceReportRow> = {}): PlaceReportRow {
  return {
    id: "report-1",
    placeId: "place-1",
    reportType: "opening_hours",
    message: "Hours changed",
    status: "pending",
    duplicateCount: 0,
    createdAt: "2026-09-18T08:00:00.000Z",
    reviewedAt: null,
    resolvedAt: null,
    reviewedBy: null,
    resolutionNote: null,
    ...overrides,
  };
}

const gap: CoverageGap = {
  id: "r1:missing_hours",
  code: "missing_hours",
  ringId: "r1",
  category: null,
  count: 3,
  total: 10,
  severity: "high",
  message: "0–500 m has low opening-hours coverage.",
};

describe("buildReliabilityTasks", () => {
  it("merges stale freshness and unresolved report into one place-field task", () => {
    const tasks = buildReliabilityTasks({
      places: [place()],
      reports: [report()],
      coverageGaps: [gap],
      operationalState: [],
      now: NOW,
    });
    const task = tasks.find((item) => item.kind === "place_field" && item.id === "place-1:openingHours");
    expect(task).toBeTruthy();
    if (!task || task.kind !== "place_field") return;
    expect(task.reportIds).toEqual(["report-1"]);
    expect(task.freshnessStatus).toBe("stale");
    expect(task.priority).toBeLessThanOrEqual(100);
    expect(task.relatedCoverageGapIds).toContain("r1:missing_hours");
  });

  it("changes revision when report status changes", () => {
    const first = buildReliabilityTasks({ places: [place()], reports: [report()], coverageGaps: [], operationalState: [], now: NOW });
    const second = buildReliabilityTasks({ places: [place()], reports: [report({ status: "reviewed" })], coverageGaps: [], operationalState: [], now: NOW });
    const a = first.find((item) => item.kind === "place_field" && item.id === "place-1:openingHours");
    const b = second.find((item) => item.kind === "place_field" && item.id === "place-1:openingHours");
    expect(a?.revision).not.toBe(b?.revision);
  });

  it("applies snooze only to the matching revision and only until snoozed_until", () => {
    const initial = buildReliabilityTasks({ places: [place()], reports: [report()], coverageGaps: [], operationalState: [], now: NOW });
    const task = initial.find((item) => item.kind === "place_field" && item.id === "place-1:openingHours");
    expect(task).toBeTruthy();
    if (!task) return;

    const state = [{
      taskKey: task.id,
      taskRevision: task.revision,
      placeId: "place-1",
      fieldName: "openingHours",
      status: "snoozed",
      snoozedUntil: "2026-09-20T09:00:00.000Z",
      assignedTo: null,
      lastOpenedAt: null,
      note: null,
      updatedAt: "2026-09-18T09:01:00.000Z",
    }] as any;

    expect(buildReliabilityTasks({ places: [place()], reports: [report()], coverageGaps: [], operationalState: state, now: NOW }).some((item) => item.id === task.id)).toBe(false);
    expect(buildReliabilityTasks({ places: [place()], reports: [report({ status: "reviewed" })], coverageGaps: [], operationalState: state, now: NOW }).some((item) => item.id === task.id)).toBe(true);
    expect(buildReliabilityTasks({ places: [place()], reports: [report()], coverageGaps: [], operationalState: state, now: new Date("2026-09-21T09:00:00.000Z") }).some((item) => item.id === task.id)).toBe(true);
  });

  it("creates a standalone coverage task without a place id", () => {
    const tasks = buildReliabilityTasks({ places: [place()], reports: [], coverageGaps: [gap], operationalState: [], now: NOW });
    const coverage = tasks.find((item) => item.kind === "coverage_gap");
    expect(coverage?.placeId).toBeNull();
    expect(coverage?.coverageGapId).toBe("r1:missing_hours");
  });
});
