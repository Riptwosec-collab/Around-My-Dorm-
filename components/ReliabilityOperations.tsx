"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReliabilitySummary } from "@/components/ReliabilitySummary";
import { ReliabilityWorkQueue } from "@/components/ReliabilityWorkQueue";
import { loadPlaceReports, type PlaceReportRow } from "@/lib/cloud/place-reports";
import { loadReliabilityTaskState, saveReliabilityTaskState } from "@/lib/cloud/reliability";
import { buildCoverageReport, type CoverageGap } from "@/lib/coverage/coverage";
import { buildReliabilityTasks } from "@/lib/reliability/tasks";
import type { CoverageReliabilityTask, PlaceReliabilityTask, ReliabilityTaskState } from "@/lib/reliability/types";
import type { Place } from "@/types/place";

export function ReliabilityOperations({
  places,
  language,
  onReload: _onReload,
  onSearchCoverageGap,
}: {
  places: Place[];
  language: "th" | "en";
  onReload: () => void;
  onSearchCoverageGap: (gap: CoverageGap) => void;
}) {
  const [reports, setReports] = useState<PlaceReportRow[]>([]);
  const [taskState, setTaskState] = useState<ReliabilityTaskState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<PlaceReliabilityTask | null>(null);
  const [selectedCoverageGapId, setSelectedCoverageGapId] = useState<string | null>(null);

  const coverageReport = useMemo(() => buildCoverageReport(places), [places]);
  const tasks = useMemo(() => buildReliabilityTasks({
    places,
    reports,
    coverageGaps: coverageReport.gaps,
    operationalState: taskState,
  }), [places, reports, coverageReport.gaps, taskState]);

  const refreshAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [nextReports, nextTaskState] = await Promise.all([
        loadPlaceReports(),
        loadReliabilityTaskState(),
      ]);
      setReports(nextReports);
      setTaskState(nextTaskState);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reliability data unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refreshAdminData(); }, [refreshAdminData]);

  async function openPlaceTask(task: PlaceReliabilityTask) {
    setSelectedTask(task);
    setSelectedCoverageGapId(null);
    try {
      const state = await saveReliabilityTaskState({
        taskKey: task.id,
        taskRevision: task.revision,
        placeId: task.placeId,
        fieldName: task.field,
        status: "in_review",
      });
      setTaskState((current) => [state, ...current.filter((item) => item.taskKey !== state.taskKey)]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to mark task in review");
    }
  }

  async function reviewCoverageTask(task: CoverageReliabilityTask) {
    setSelectedTask(null);
    setSelectedCoverageGapId(task.coverageGapId);
    try {
      const state = await saveReliabilityTaskState({
        taskKey: task.id,
        taskRevision: task.revision,
        placeId: null,
        fieldName: "coverage",
        status: "in_review",
      });
      setTaskState((current) => [state, ...current.filter((item) => item.taskKey !== state.taskKey)]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to mark coverage task in review");
    }
  }

  function searchCoverageTask(task: CoverageReliabilityTask) {
    const gap = coverageReport.gaps.find((item) => item.id === task.coverageGapId);
    if (gap) onSearchCoverageGap(gap);
  }

  return (
    <div data-testid="reliability-operations" data-selected-task={selectedTask?.id ?? ""} data-selected-coverage-gap={selectedCoverageGapId ?? ""}>
      <ReliabilitySummary tasks={tasks} language={language} />
      {loading && <p className="mt-3 text-center text-[9px] text-white/40">{language === "en" ? "Loading reliability work…" : "กำลังโหลดคิวตรวจข้อมูล…"}</p>}
      {error && <p className="mt-3 rounded-xl border border-rose-300/12 bg-rose-300/[0.05] p-3 text-[9px] text-rose-100">{error}</p>}
      <ReliabilityWorkQueue
        tasks={tasks}
        language={language}
        onVerifyTask={(task) => void openPlaceTask(task)}
        onReviewCoverage={(task) => void reviewCoverageTask(task)}
        onSearchCandidates={searchCoverageTask}
      />
    </div>
  );
}
