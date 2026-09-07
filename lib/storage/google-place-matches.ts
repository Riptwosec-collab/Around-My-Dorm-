export type GooglePlaceMatchDecision = "linked" | "rejected" | "review";

export type GooglePlaceMatchRecord = {
  id: string;
  localPlaceId: string;
  googlePlaceId: string;
  candidateName: string;
  decision: GooglePlaceMatchDecision;
  confidence: number;
  distanceMeters: number | null;
  chainSafetyPassed: boolean;
  createdAt: string;
};

const KEY = "around-dorm-google-place-matches-v1";
const THRESHOLD_KEY = "around-dorm-google-place-match-threshold-v1";

function read(): GooglePlaceMatchRecord[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]") as GooglePlaceMatchRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadGooglePlaceMatchRecords() {
  return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveGooglePlaceMatchRecord(record: Omit<GooglePlaceMatchRecord, "id" | "createdAt">) {
  if (typeof localStorage === "undefined") return;
  const next: GooglePlaceMatchRecord = { ...record, id: `gmatch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify([next, ...read()].slice(0, 500)));
}

export function rejectedGooglePlaceIds(localPlaceId: string) {
  return new Set(read().filter((record) => record.localPlaceId === localPlaceId && record.decision === "rejected").map((record) => record.googlePlaceId));
}

export function loadMatchConfidenceThreshold(defaultValue = 75) {
  if (typeof localStorage === "undefined") return defaultValue;
  const value = Number(localStorage.getItem(THRESHOLD_KEY));
  return Number.isFinite(value) && value >= 50 && value <= 95 ? value : defaultValue;
}

export function saveMatchConfidenceThreshold(value: number) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(THRESHOLD_KEY, String(Math.max(50, Math.min(95, Math.round(value)))));
}
