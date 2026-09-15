import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";

export type GooglePhotoCloudResultCode = "photo_loaded" | "no_photo" | "failed";

export type GooglePhotoCloudMetadataRow = {
  place_id: string | null;
  google_place_id: string | null;
  occurred_at: string;
  status: "success" | "failed" | string;
  result_code: GooglePhotoCloudResultCode | null;
};

export type GooglePhotoRestoreTarget = {
  placeId: string;
  googlePlaceId: string;
};

export type GooglePhotoCloudMetadataSummary = {
  savedPlaceIds: string[];
  restoreTargets: GooglePhotoRestoreTarget[];
  savedCount: number;
  noPhotoCount: number;
  failedCount: number;
  lastSavedAt: string | null;
};

const EMPTY_SUMMARY: GooglePhotoCloudMetadataSummary = {
  savedPlaceIds: [],
  restoreTargets: [],
  savedCount: 0,
  noPhotoCount: 0,
  failedCount: 0,
  lastSavedAt: null,
};

export function summarizeGooglePhotoCloudMetadata(
  rows: GooglePhotoCloudMetadataRow[],
): GooglePhotoCloudMetadataSummary {
  if (rows.length === 0) return EMPTY_SUMMARY;

  const latestByPlace = new Map<string, GooglePhotoCloudMetadataRow>();
  let lastSavedAt: string | null = null;

  for (const row of rows) {
    if (!lastSavedAt || row.occurred_at > lastSavedAt) lastSavedAt = row.occurred_at;
    if (!row.place_id) continue;
    const current = latestByPlace.get(row.place_id);
    if (!current || row.occurred_at > current.occurred_at) {
      latestByPlace.set(row.place_id, row);
    }
  }

  const savedPlaceIds: string[] = [];
  const restoreTargets: GooglePhotoRestoreTarget[] = [];
  let noPhotoCount = 0;
  let failedCount = 0;

  for (const [placeId, row] of latestByPlace) {
    if (row.status === "success" && row.result_code === "photo_loaded") {
      savedPlaceIds.push(placeId);
      if (row.google_place_id) {
        restoreTargets.push({ placeId, googlePlaceId: row.google_place_id });
      }
      continue;
    }
    if (row.status === "success" && row.result_code === "no_photo") {
      noPhotoCount += 1;
      continue;
    }
    if (row.status === "failed" || row.result_code === "failed") {
      failedCount += 1;
    }
  }

  savedPlaceIds.sort();
  restoreTargets.sort((a, b) => a.placeId.localeCompare(b.placeId));

  return {
    savedPlaceIds,
    restoreTargets,
    savedCount: savedPlaceIds.length,
    noPhotoCount,
    failedCount,
    lastSavedAt,
  };
}

export async function loadGooglePhotoCloudMetadata(limit = 500) {
  if (process.env.NODE_ENV === "test") return EMPTY_SUMMARY;
  await ensureCloudUser();
  const { data, error } = await supabase
    .from("amd_google_request_logs")
    .select("place_id,google_place_id,occurred_at,status,result_code")
    .eq("request_type", "place_photo")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return summarizeGooglePhotoCloudMetadata((data || []) as GooglePhotoCloudMetadataRow[]);
}
