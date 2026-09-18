import type { PlaceReportRow } from "@/lib/cloud/place-reports";
import { COVERAGE_RINGS, type CoverageGap, type CoverageRingId } from "@/lib/coverage/coverage";
import { getFieldFreshness, type FreshnessField } from "@/lib/place-freshness";
import { DORM_CENTER, haversineKm } from "@/lib/place-utils";
import { mapReportTypeToReliabilityDomain } from "@/lib/reliability/report-domain";
import { scoreReliabilityTask } from "@/lib/reliability/priority";
import type {
  CoverageReliabilityTask,
  PlaceReliabilityTask,
  ReliabilityField,
  ReliabilityTask,
  ReliabilityTaskState,
} from "@/lib/reliability/types";
import type { Place } from "@/types/place";

const FIELDS: ReliabilityField[] = ["openingHours", "price", "phone", "parking", "location"];
const FRESHNESS_FIELD: Record<ReliabilityField, FreshnessField> = {
  openingHours: "openingHours",
  price: "price",
  phone: "contact",
  parking: "parking",
  location: "location",
};

const COVERAGE_FIELD: Partial<Record<CoverageGap["code"], ReliabilityField>> = {
  missing_hours: "openingHours",
  missing_price: "price",
  missing_maps: "location",
};

export type BuildReliabilityTasksInput = {
  places: Place[];
  reports: PlaceReportRow[];
  coverageGaps: CoverageGap[];
  operationalState: ReliabilityTaskState[];
  now?: Date;
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableList(values: string[]) {
  return [...values].sort().join("|");
}

export function buildPlaceTaskRevision(input: {
  verificationTimestamp: string | null;
  reports: PlaceReportRow[];
  coverageGapIds: string[];
}) {
  const reportKey = input.reports
    .map((report) => `${report.id}:${report.status}:${report.duplicateCount}`)
    .sort()
    .join("|");
  return stableHash(`${input.verificationTimestamp ?? "unknown"}::${reportKey}::${stableList(input.coverageGapIds)}`);
}

export function buildCoverageTaskRevision(gap: CoverageGap) {
  return stableHash(`${gap.id}:${gap.severity}:${gap.count}:${gap.total}`);
}

function ringForPlace(place: Place): CoverageRingId | null {
  if (place.latitude == null || place.longitude == null || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return null;
  const meters = haversineKm(DORM_CENTER, { lat: place.latitude, lng: place.longitude }) * 1000;
  const ring = COVERAGE_RINGS.find((candidate) => {
    if (meters < candidate.minMeters) return false;
    return candidate.id === "r5" ? meters <= candidate.maxMeters : meters < candidate.maxMeters;
  });
  return ring?.id ?? null;
}

function relevantCoverageGaps(place: Place, field: ReliabilityField, gaps: CoverageGap[]) {
  const ringId = ringForPlace(place);
  if (!ringId) return [];
  return gaps.filter((gap) => {
    if (gap.ringId !== ringId) return false;
    if (gap.category && gap.category !== place.category) return false;
    return COVERAGE_FIELD[gap.code] === field;
  });
}

function unresolvedReports(reports: PlaceReportRow[]) {
  return reports.filter((report) => report.status === "pending" || report.status === "reviewed");
}

function operationalStatusFor(task: { id: string; revision: string }, states: ReliabilityTaskState[], now: Date) {
  const state = states.find((candidate) => candidate.taskKey === task.id && candidate.taskRevision === task.revision);
  if (!state) return { hidden: false, status: "open" as const };
  if (state.status === "done") return { hidden: true, status: "done" as const };
  if (state.status === "snoozed") {
    const until = state.snoozedUntil ? new Date(state.snoozedUntil).getTime() : Number.POSITIVE_INFINITY;
    if (Number.isFinite(until) && until <= now.getTime()) return { hidden: false, status: "open" as const };
    return { hidden: true, status: "snoozed" as const };
  }
  return { hidden: false, status: state.status };
}

function reportStatusFor(reports: PlaceReportRow[]) {
  if (reports.some((report) => report.status === "pending")) return "pending" as const;
  if (reports.some((report) => report.status === "reviewed")) return "reviewed" as const;
  return null;
}

function issueBreadth(placeId: string, reports: PlaceReportRow[], place: Place, now: Date) {
  const domains = new Set<string>();
  for (const field of FIELDS) {
    if (getFieldFreshness(place, FRESHNESS_FIELD[field], now).status !== "fresh") domains.add(field);
  }
  for (const report of unresolvedReports(reports).filter((item) => item.placeId === placeId)) domains.add(mapReportTypeToReliabilityDomain(report.reportType));
  return Math.max(1, domains.size);
}

function placeTasks(input: BuildReliabilityTasksInput, now: Date): PlaceReliabilityTask[] {
  const openReports = unresolvedReports(input.reports);
  const result: PlaceReliabilityTask[] = [];

  for (const place of input.places) {
    const reportsForPlace = openReports.filter((report) => report.placeId === place.id);
    const breadth = issueBreadth(place.id, openReports, place, now);

    for (const field of FIELDS) {
      const freshness = getFieldFreshness(place, FRESHNESS_FIELD[field], now);
      const fieldReports = reportsForPlace.filter((report) => mapReportTypeToReliabilityDomain(report.reportType) === field);
      const gaps = relevantCoverageGaps(place, field, input.coverageGaps);
      if (freshness.status === "fresh" && fieldReports.length === 0 && gaps.length === 0) continue;

      const reasons = Array.from(new Set([
        ...(freshness.status === "fresh" ? [] : ["freshness" as const]),
        ...(fieldReports.length ? ["public_report" as const] : []),
        ...(gaps.length ? ["coverage_gap" as const] : []),
      ]));
      const revision = buildPlaceTaskRevision({
        verificationTimestamp: freshness.verifiedAt,
        reports: fieldReports,
        coverageGapIds: gaps.map((gap) => gap.id),
      });
      const score = scoreReliabilityTask({
        reportStatus: reportStatusFor(fieldReports),
        freshnessStatus: freshness.status,
        recommended: Boolean(place.recommended),
        localFavorite: Boolean(place.localFavorite),
        field,
        highSeverityCoverageGap: gaps.some((gap) => gap.severity === "high"),
        independentIssueCategoryCount: breadth,
        coverageOnly: false,
      });
      const id = `${place.id}:${field}`;
      const operation = operationalStatusFor({ id, revision }, input.operationalState, now);
      if (operation.hidden) continue;

      result.push({
        kind: "place_field",
        id,
        revision,
        placeId: place.id,
        placeName: place.name,
        field,
        reasons,
        priority: score.priority,
        severity: score.severity,
        reportIds: fieldReports.map((report) => report.id).sort(),
        freshnessStatus: freshness.status,
        verificationTimestamp: freshness.verifiedAt,
        relatedCoverageGapIds: gaps.map((gap) => gap.id).sort(),
        suggestedAction: fieldReports.length ? "review_report" : "verify",
        scoreBreakdown: score.breakdown,
        distanceKm: place.straightLineDistanceKm ?? place.distanceKm ?? null,
        operationalStatus: operation.status,
      });
    }

    const otherReports = reportsForPlace.filter((report) => mapReportTypeToReliabilityDomain(report.reportType) === "reportReview");
    if (otherReports.length) {
      const revision = buildPlaceTaskRevision({ verificationTimestamp: null, reports: otherReports, coverageGapIds: [] });
      const score = scoreReliabilityTask({
        reportStatus: reportStatusFor(otherReports),
        freshnessStatus: null,
        recommended: Boolean(place.recommended),
        localFavorite: Boolean(place.localFavorite),
        field: "reportReview",
        highSeverityCoverageGap: false,
        independentIssueCategoryCount: breadth,
        coverageOnly: false,
      });
      const id = `${place.id}:reportReview`;
      const operation = operationalStatusFor({ id, revision }, input.operationalState, now);
      if (!operation.hidden) {
        result.push({
          kind: "place_field",
          id,
          revision,
          placeId: place.id,
          placeName: place.name,
          field: "reportReview",
          reasons: ["public_report"],
          priority: score.priority,
          severity: score.severity,
          reportIds: otherReports.map((report) => report.id).sort(),
          freshnessStatus: null,
          verificationTimestamp: null,
          relatedCoverageGapIds: [],
          suggestedAction: "review_report",
          scoreBreakdown: score.breakdown,
          distanceKm: place.straightLineDistanceKm ?? place.distanceKm ?? null,
          operationalStatus: operation.status,
        });
      }
    }
  }

  return result;
}

function coverageTasks(input: BuildReliabilityTasksInput, now: Date): CoverageReliabilityTask[] {
  return input.coverageGaps.flatMap((gap) => {
    const revision = buildCoverageTaskRevision(gap);
    const id = `coverage:${gap.id}`;
    const operation = operationalStatusFor({ id, revision }, input.operationalState, now);
    if (operation.hidden) return [];
    const score = scoreReliabilityTask({
      reportStatus: null,
      freshnessStatus: null,
      recommended: false,
      localFavorite: false,
      field: "coverage",
      highSeverityCoverageGap: gap.severity === "high",
      independentIssueCategoryCount: 1,
      coverageOnly: true,
    });
    return [{
      kind: "coverage_gap" as const,
      id,
      revision,
      placeId: null,
      placeName: gap.message,
      field: "coverage" as const,
      reasons: ["coverage_gap" as const],
      coverageGapId: gap.id,
      priority: score.priority,
      severity: score.severity,
      suggestedAction: gap.code === "low_category_count" ? "search_candidates" as const : "review_existing" as const,
      scoreBreakdown: score.breakdown,
      operationalStatus: operation.status,
    }];
  });
}

function timestampOrder(task: ReliabilityTask) {
  if (task.kind === "coverage_gap") return Number.POSITIVE_INFINITY;
  if (!task.verificationTimestamp) return Number.NEGATIVE_INFINITY;
  const time = new Date(task.verificationTimestamp).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

export function buildReliabilityTasks(input: BuildReliabilityTasksInput): ReliabilityTask[] {
  const now = input.now ?? new Date();
  const tasks: ReliabilityTask[] = [...placeTasks(input, now), ...coverageTasks(input, now)];
  return tasks.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    const aHasReport = a.kind === "place_field" && a.reportIds.length > 0 ? 1 : 0;
    const bHasReport = b.kind === "place_field" && b.reportIds.length > 0 ? 1 : 0;
    if (aHasReport !== bHasReport) return bHasReport - aHasReport;
    const aTime = timestampOrder(a);
    const bTime = timestampOrder(b);
    if (aTime !== bTime) return aTime - bTime;
    const aDistance = a.kind === "place_field" ? a.distanceKm ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
    const bDistance = b.kind === "place_field" ? b.distanceKm ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
    if (aDistance !== bDistance) return aDistance - bDistance;
    return a.placeName.localeCompare(b.placeName, "th");
  });
}
