import type { FreshnessStatus } from "@/lib/place-freshness";

export type ReliabilityField = "openingHours" | "price" | "phone" | "parking" | "location";
export type ReliabilityDomain = ReliabilityField | "reportReview" | "coverage";
export type ReliabilitySeverity = "critical" | "high" | "normal" | "low";
export type ReliabilityTaskStatus = "open" | "in_review" | "snoozed" | "done";
export type ReliabilityReason = "freshness" | "public_report" | "coverage_gap";
export type ReliabilityScorePart = { code: string; points: number };

export type ReliabilityTaskState = {
  taskKey: string;
  taskRevision: string;
  placeId: string | null;
  fieldName: string;
  status: ReliabilityTaskStatus;
  snoozedUntil: string | null;
  assignedTo: string | null;
  lastOpenedAt: string | null;
  note: string | null;
  updatedAt: string;
};

export type ReliabilityTaskStateWrite = {
  taskKey: string;
  taskRevision: string;
  placeId: string | null;
  fieldName: string;
  status: ReliabilityTaskStatus;
  snoozedUntil?: string | null;
  note?: string | null;
};

export type PlaceReliabilityTask = {
  kind: "place_field";
  id: string;
  revision: string;
  placeId: string;
  placeName: string;
  field: ReliabilityField | "reportReview";
  reasons: ReliabilityReason[];
  priority: number;
  severity: ReliabilitySeverity;
  reportIds: string[];
  freshnessStatus: FreshnessStatus | null;
  verificationTimestamp: string | null;
  relatedCoverageGapIds: string[];
  suggestedAction: "verify" | "review_report";
  scoreBreakdown: ReliabilityScorePart[];
  distanceKm: number | null;
  operationalStatus: ReliabilityTaskStatus;
};

export type CoverageReliabilityTask = {
  kind: "coverage_gap";
  id: string;
  revision: string;
  placeId: null;
  placeName: string;
  field: "coverage";
  reasons: ["coverage_gap"];
  coverageGapId: string;
  priority: number;
  severity: ReliabilitySeverity;
  suggestedAction: "review_existing" | "search_candidates";
  scoreBreakdown: ReliabilityScorePart[];
  operationalStatus: ReliabilityTaskStatus;
};

export type ReliabilityTask = PlaceReliabilityTask | CoverageReliabilityTask;
