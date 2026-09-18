import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReliabilityWorkQueue } from "@/components/ReliabilityWorkQueue";
import type { ReliabilityTask } from "@/lib/reliability/types";

const tasks: ReliabilityTask[] = [
  {
    kind: "place_field",
    id: "noodle:openingHours",
    revision: "r1",
    placeId: "noodle",
    placeName: "Noodle Place",
    field: "openingHours",
    reasons: ["freshness", "public_report"],
    priority: 80,
    severity: "critical",
    reportIds: ["report-1"],
    freshnessStatus: "stale",
    verificationTimestamp: "2026-08-01T00:00:00Z",
    relatedCoverageGapIds: [],
    suggestedAction: "review_report",
    scoreBreakdown: [{ code: "report_pending", points: 35 }],
    distanceKm: 0.4,
    operationalStatus: "open",
  },
  {
    kind: "place_field",
    id: "cafe:phone",
    revision: "r2",
    placeId: "cafe",
    placeName: "Cafe Place",
    field: "phone",
    reasons: ["freshness"],
    priority: 40,
    severity: "normal",
    reportIds: [],
    freshnessStatus: "unknown",
    verificationTimestamp: null,
    relatedCoverageGapIds: [],
    suggestedAction: "verify",
    scoreBreakdown: [{ code: "freshness_unknown", points: 20 }],
    distanceKm: 0.8,
    operationalStatus: "open",
  },
  {
    kind: "coverage_gap",
    id: "coverage:r1:missing_hours",
    revision: "r3",
    placeId: null,
    placeName: "Low hours coverage",
    field: "coverage",
    reasons: ["coverage_gap"],
    coverageGapId: "r1:missing_hours",
    priority: 30,
    severity: "normal",
    suggestedAction: "review_existing",
    scoreBreakdown: [{ code: "coverage_base", points: 20 }],
    operationalStatus: "open",
  },
];

describe("ReliabilityWorkQueue", () => {
  it("filters by severity/report/field and searches by place name", () => {
    render(<ReliabilityWorkQueue tasks={tasks} language="en" onVerifyTask={vi.fn()} onReviewCoverage={vi.fn()} onSearchCandidates={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Critical" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "High" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opening hours" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Price" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Parking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Phone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Location" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Noodle" } });
    expect(screen.getByText("Noodle Place")).toBeInTheDocument();
    expect(screen.queryByText("Cafe Place")).not.toBeInTheDocument();
    expect(screen.getByText("80/100")).toBeInTheDocument();
  });

  it("exposes explicit verify and coverage actions", () => {
    const onVerifyTask = vi.fn();
    const onReviewCoverage = vi.fn();
    const onSearchCandidates = vi.fn();
    render(<ReliabilityWorkQueue tasks={tasks} language="en" onVerifyTask={onVerifyTask} onReviewCoverage={onReviewCoverage} onSearchCandidates={onSearchCandidates} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Verify" })[0]!);
    expect(onVerifyTask).toHaveBeenCalledWith(expect.objectContaining({ id: "noodle:openingHours" }));
    fireEvent.click(screen.getByRole("button", { name: "Review existing" }));
    expect(onReviewCoverage).toHaveBeenCalledWith(expect.objectContaining({ coverageGapId: "r1:missing_hours" }));
    fireEvent.click(screen.getByRole("button", { name: "Search candidates" }));
    expect(onSearchCandidates).toHaveBeenCalledWith(expect.objectContaining({ coverageGapId: "r1:missing_hours" }));
  });

  it("renders Thai controls", () => {
    render(<ReliabilityWorkQueue tasks={tasks} language="th" onVerifyTask={vi.fn()} onReviewCoverage={vi.fn()} onSearchCandidates={vi.fn()} />);
    expect(screen.getByRole("button", { name: "รายงาน" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "เวลาเปิด" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "ตรวจข้อมูล" }).length).toBeGreaterThan(0);
  });
});
