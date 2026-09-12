import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";
export type GooglePlaceMatchDecision = "linked" | "rejected" | "review";
export type GooglePlaceMatchRecord = { id: string; localPlaceId: string; googlePlaceId: string; candidateName: string; decision: GooglePlaceMatchDecision; confidence: number; distanceMeters: number | null; chainSafetyPassed: boolean; createdAt: string };
let recordsCache: GooglePlaceMatchRecord[] = [];
let thresholdCache = 75;

export async function loadGooglePlaceMatchRecords() {
  const user = await ensureCloudUser();
  const [matches, control] = await Promise.all([
    supabase.from("amd_google_place_matches").select("place_id,google_place_id,status,confidence,candidate,candidate_expires_at,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }),
    supabase.from("amd_google_api_control").select("match_confidence_threshold").eq("user_id", user.id).maybeSingle(),
  ]);
  if (matches.error) throw matches.error;
  if (control.error) throw control.error;
  thresholdCache = control.data?.match_confidence_threshold || 75;
  recordsCache = (matches.data || []).filter((row: any) => row.google_place_id).map((row: any) => { const candidateFresh = !row.candidate_expires_at || new Date(row.candidate_expires_at).getTime() > Date.now(); const candidate = candidateFresh ? row.candidate : null; return { id: `${row.place_id}:${row.google_place_id}`, localPlaceId: row.place_id, googlePlaceId: row.google_place_id, candidateName: candidate?.name || "", decision: row.status === "rejected" ? "rejected" : row.status === "linked" ? "linked" : "review", confidence: row.confidence || 0, distanceMeters: candidate?.distanceMeters ?? null, chainSafetyPassed: candidate?.chainSafetyPassed !== false, createdAt: row.updated_at }; });
  return recordsCache;
}

export async function saveGooglePlaceMatchRecord(record: Omit<GooglePlaceMatchRecord, "id" | "createdAt">) {
  const user = await ensureCloudUser();
  const now = new Date().toISOString();
  const candidate = record.decision === "review" ? { name: record.candidateName, distanceMeters: record.distanceMeters, chainSafetyPassed: record.chainSafetyPassed } : null;
  const candidateExpiresAt = record.decision === "review" ? new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString() : null;
  const { error } = await supabase.from("amd_google_place_matches").upsert({ user_id: user.id, place_id: record.localPlaceId, google_place_id: record.googlePlaceId, status: record.decision, confidence: record.confidence, candidate, candidate_expires_at: candidateExpiresAt, reviewed_at: now, updated_at: now }, { onConflict: "user_id,place_id" });
  if (error) throw error;
  await loadGooglePlaceMatchRecords();
}

export function rejectedGooglePlaceIds(localPlaceId: string) { return new Set(recordsCache.filter((record) => record.localPlaceId === localPlaceId && record.decision === "rejected").map((record) => record.googlePlaceId)); }
export function loadMatchConfidenceThreshold(defaultValue = 75) { return thresholdCache || defaultValue; }
export async function saveMatchConfidenceThreshold(value: number) {
  const user = await ensureCloudUser(); thresholdCache = Math.max(50, Math.min(95, Math.round(value)));
  const { error } = await supabase.from("amd_google_api_control").upsert({ user_id: user.id, match_confidence_threshold: thresholdCache, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}
