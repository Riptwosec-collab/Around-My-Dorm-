import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";
import type {
  CandidateValidationIssue,
  PlaceCandidate,
  PlaceCandidateStatus,
} from "@/lib/maintenance/place-candidates";

const TABLE = "amd_place_candidates";
const STATUSES = new Set<PlaceCandidateStatus>([
  "new",
  "needs_review",
  "approved",
  "rejected",
  "merged",
]);
const ISSUE_CODES = new Set<CandidateValidationIssue["code"]>([
  "missing_name",
  "missing_category",
  "invalid_coordinates",
  "possible_duplicate",
  "source_conflict",
]);
const ISSUE_PRIORITIES = new Set<CandidateValidationIssue["severity"]>(["p0", "p1", "p2", "p3"]);

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function validationIssues(value: unknown): CandidateValidationIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const issue = item as Partial<CandidateValidationIssue>;
    if (
      !issue.code ||
      !ISSUE_CODES.has(issue.code) ||
      !issue.severity ||
      !ISSUE_PRIORITIES.has(issue.severity) ||
      typeof issue.message !== "string"
    ) return [];
    return [{ code: issue.code, severity: issue.severity, message: issue.message }];
  });
}

function mapRow(row: any): PlaceCandidate | null {
  const payload = row?.payload;
  if (!payload || typeof payload !== "object" || typeof payload.name !== "string") return null;
  if (typeof row.id !== "string" || typeof row.candidate_key !== "string") return null;
  if (typeof row.source_provider !== "string" || !STATUSES.has(row.status)) return null;

  return {
    id: row.id,
    candidateKey: row.candidate_key,
    sourceProvider: row.source_provider,
    sourceId: typeof row.source_id === "string" ? row.source_id : null,
    proposedPlace: payload,
    possibleMatchIds: stringArray(row.possible_match_ids),
    matchScore: Number.isFinite(Number(row.match_score)) ? Number(row.match_score) : 0,
    validationIssues: validationIssues(row.validation_issues),
    completenessScore: Number.isFinite(Number(row.completeness_score)) ? Number(row.completeness_score) : 0,
    status: row.status,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
    reviewedBy: typeof row.reviewed_by === "string" ? row.reviewed_by : null,
  };
}

function toRow(userId: string, candidate: PlaceCandidate) {
  return {
    user_id: userId,
    candidate_key: candidate.candidateKey,
    source_provider: candidate.sourceProvider,
    source_id: candidate.sourceId,
    status: candidate.status,
    payload: candidate.proposedPlace,
    possible_match_ids: candidate.possibleMatchIds,
    match_score: candidate.matchScore,
    validation_issues: candidate.validationIssues,
    completeness_score: candidate.completenessScore,
    reviewed_at: candidate.reviewedAt,
    reviewed_by: candidate.reviewedBy,
    updated_at: candidate.updatedAt,
  };
}

export async function loadPlaceCandidates(status?: PlaceCandidateStatus[]): Promise<PlaceCandidate[]> {
  const user = await ensureCloudUser();
  let query = supabase
    .from(TABLE)
    .select("id,candidate_key,source_provider,source_id,status,payload,possible_match_ids,match_score,validation_issues,completeness_score,reviewed_at,reviewed_by,created_at,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (status?.length) query = query.in("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapRow).filter((item): item is PlaceCandidate => item !== null);
}

export async function upsertPlaceCandidate(candidate: PlaceCandidate): Promise<PlaceCandidate> {
  const user = await ensureCloudUser();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(toRow(user.id, { ...candidate, updatedAt: now }), { onConflict: "user_id,candidate_key" })
    .select("id,candidate_key,source_provider,source_id,status,payload,possible_match_ids,match_score,validation_issues,completeness_score,reviewed_at,reviewed_by,created_at,updated_at")
    .single();
  if (error) throw error;
  const mapped = mapRow(data);
  if (!mapped) throw new Error("Malformed staged candidate returned from cloud storage");
  return mapped;
}

export async function upsertPlaceCandidates(candidates: PlaceCandidate[]): Promise<PlaceCandidate[]> {
  if (!candidates.length) return [];
  const user = await ensureCloudUser();
  const now = new Date().toISOString();
  const rows = candidates.map((candidate) => toRow(user.id, { ...candidate, updatedAt: now }));
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: "user_id,candidate_key" })
    .select("id,candidate_key,source_provider,source_id,status,payload,possible_match_ids,match_score,validation_issues,completeness_score,reviewed_at,reviewed_by,created_at,updated_at");
  if (error) throw error;
  return (data ?? []).map(mapRow).filter((item): item is PlaceCandidate => item !== null);
}

export async function updatePlaceCandidateDecision(
  candidateId: string,
  input: { status: PlaceCandidateStatus; reviewedBy?: string | null; reviewedAt?: string | null },
): Promise<void> {
  if (!STATUSES.has(input.status)) throw new Error("Unsupported candidate status");
  const user = await ensureCloudUser();
  const reviewedAt = input.reviewedAt ?? new Date().toISOString();
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: input.status,
      reviewed_at: reviewedAt,
      reviewed_by: input.reviewedBy ?? null,
      updated_at: reviewedAt,
    })
    .eq("user_id", user.id)
    .eq("id", candidateId);
  if (error) throw error;
}

export async function deletePlaceCandidate(candidateId: string): Promise<void> {
  const user = await ensureCloudUser();
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", user.id)
    .eq("id", candidateId);
  if (error) throw error;
}
