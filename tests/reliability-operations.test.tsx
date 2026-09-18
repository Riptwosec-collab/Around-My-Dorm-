import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLACES } from "@/data/places";

const mocks = vi.hoisted(() => ({
  loadPlaceReports: vi.fn(),
  loadReliabilityTaskState: vi.fn(),
  saveReliabilityTaskState: vi.fn(),
  buildCoverageReport: vi.fn(),
  buildReliabilityTasks: vi.fn(),
}));

vi.mock("@/lib/cloud/place-reports", () => ({ loadPlaceReports: mocks.loadPlaceReports }));
vi.mock("@/lib/cloud/reliability", () => ({
  loadReliabilityTaskState: mocks.loadReliabilityTaskState,
  saveReliabilityTaskState: mocks.saveReliabilityTaskState,
}));
vi.mock("@/lib/coverage/coverage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/coverage/coverage")>();
  return { ...actual, buildCoverageReport: mocks.buildCoverageReport };
});
vi.mock("@/lib/reliability/tasks", () => ({ buildReliabilityTasks: mocks.buildReliabilityTasks }));

import { ReliabilityOperations } from "@/components/ReliabilityOperations";

describe("ReliabilityOperations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadPlaceReports.mockResolvedValue([]);
    mocks.loadReliabilityTaskState.mockResolvedValue([]);
    mocks.buildCoverageReport.mockReturnValue({ totalPlaces: 1, rings: [], gaps: [] });
    mocks.buildReliabilityTasks.mockReturnValue([]);
  });

  it("loads reports and operational state once, then derives tasks from local coverage", async () => {
    const onReload = vi.fn();
    render(<ReliabilityOperations places={[PLACES[0]!]} language="en" onReload={onReload} onSearchCoverageGap={vi.fn()} />);

    await waitFor(() => expect(mocks.loadPlaceReports).toHaveBeenCalledTimes(1));
    expect(mocks.loadReliabilityTaskState).toHaveBeenCalledTimes(1);
    expect(mocks.buildCoverageReport).toHaveBeenCalledWith([PLACES[0]!]);
    expect(mocks.buildReliabilityTasks).toHaveBeenCalledWith(expect.objectContaining({
      places: [PLACES[0]!],
      reports: [],
      coverageGaps: [],
      operationalState: [],
    }));
    expect(onReload).not.toHaveBeenCalled();
    expect(screen.getByTestId("reliability-operations")).toBeInTheDocument();
  });

  it("shows a neutral load error without inventing tasks", async () => {
    mocks.loadPlaceReports.mockRejectedValueOnce(new Error("admin reports unavailable"));
    render(<ReliabilityOperations places={[PLACES[0]!]} language="th" onReload={vi.fn()} onSearchCoverageGap={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/admin reports unavailable/i)).toBeInTheDocument());
  });
});
