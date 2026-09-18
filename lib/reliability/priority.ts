import type { FreshnessStatus } from "@/lib/place-freshness";
import type { PlaceReportStatus } from "@/lib/cloud/place-reports";
import type { ReliabilityDomain, ReliabilityScorePart, ReliabilitySeverity } from "@/lib/reliability/types";

export type ScoreReliabilityTaskInput = {
  reportStatus: Extract<PlaceReportStatus, "pending" | "reviewed"> | null;
  freshnessStatus: FreshnessStatus | null;
  recommended: boolean;
  localFavorite: boolean;
  field: ReliabilityDomain;
  highSeverityCoverageGap: boolean;
  independentIssueCategoryCount: number;
  coverageOnly: boolean;
};

export function scoreReliabilityTask(input: ScoreReliabilityTaskInput): {
  priority: number;
  severity: ReliabilitySeverity;
  breakdown: ReliabilityScorePart[];
} {
  const breakdown: ReliabilityScorePart[] = [];
  const add = (code: string, points: number) => breakdown.push({ code, points });

  if (input.coverageOnly) add("coverage_base", 20);
  if (input.reportStatus === "pending") add("report_pending", 35);
  if (input.reportStatus === "reviewed") add("report_reviewed", 25);
  if (input.freshnessStatus === "stale") add("freshness_stale", 25);
  if (input.freshnessStatus === "unknown") add("freshness_unknown", 20);
  if (input.freshnessStatus === "aging") add("freshness_aging", 10);
  if (input.recommended || input.localFavorite) add("important_place", 10);
  if (input.field === "openingHours" || input.field === "location") add("critical_field", 10);
  if (input.field === "price" || input.field === "parking") add("commercial_field", 7);
  if (input.field === "phone") add("phone_field", 4);
  if (input.highSeverityCoverageGap) add("coverage_high", 10);

  const breadth = Math.min(15, Math.max(0, input.independentIssueCategoryCount - 1) * 5);
  if (breadth) add("multi_issue", breadth);

  const priority = Math.min(100, breakdown.reduce((sum, part) => sum + part.points, 0));
  const severity: ReliabilitySeverity = priority >= 75
    ? "critical"
    : priority >= 50
      ? "high"
      : priority >= 25
        ? "normal"
        : "low";

  return { priority, severity, breakdown };
}
