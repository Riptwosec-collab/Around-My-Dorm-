import type { PlaceCandidate } from "@/lib/maintenance/place-candidates";

export function resolveCandidateAsSeparate(
  candidate: PlaceCandidate,
  reviewedBy: string | null,
  reviewedAt = new Date().toISOString(),
): PlaceCandidate {
  const validationIssues = candidate.validationIssues.filter((issue) => issue.code !== "possible_duplicate");
  const hasBlockingReview = validationIssues.some((issue) => issue.severity === "p0" || issue.severity === "p1");
  return {
    ...candidate,
    possibleMatchIds: [],
    validationIssues,
    status: hasBlockingReview ? "needs_review" : "new",
    reviewedBy,
    reviewedAt,
    updatedAt: reviewedAt,
  };
}
