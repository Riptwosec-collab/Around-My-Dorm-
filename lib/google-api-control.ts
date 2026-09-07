export type GoogleApiControlSettings = {
  locked: boolean;
  batchLimit: 10 | 25 | 50 | 100;
  dailyWarningLimit: number;
  monthlyWarningLimit: number;
};

export type UsageWarningLevel = 0 | 75 | 90 | 100;

export const GOOGLE_API_CONTROL_KEY = "around-dorm-google-api-control-v1";
export const GOOGLE_API_BATCH_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_GOOGLE_API_CONTROL: GoogleApiControlSettings = {
  locked: false,
  batchLimit: 50,
  dailyWarningLimit: 200,
  monthlyWarningLimit: 2000,
};

function allowedBatch(value: unknown): GoogleApiControlSettings["batchLimit"] {
  const parsed = Number(value);
  return (GOOGLE_API_BATCH_OPTIONS as readonly number[]).includes(parsed) ? parsed as GoogleApiControlSettings["batchLimit"] : DEFAULT_GOOGLE_API_CONTROL.batchLimit;
}

function positiveInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed >= min ? Math.min(parsed, max) : fallback;
}

export function sanitizeGoogleApiControlSettings(value: unknown): GoogleApiControlSettings {
  const record = value && typeof value === "object" ? value as Partial<GoogleApiControlSettings> : {};
  return {
    locked: record.locked === true,
    batchLimit: allowedBatch(record.batchLimit),
    dailyWarningLimit: positiveInteger(record.dailyWarningLimit, DEFAULT_GOOGLE_API_CONTROL.dailyWarningLimit, 1, 100000),
    monthlyWarningLimit: positiveInteger(record.monthlyWarningLimit, DEFAULT_GOOGLE_API_CONTROL.monthlyWarningLimit, 1, 1000000),
  };
}

export function getGoogleApiControlSettings(): GoogleApiControlSettings {
  if (typeof localStorage === "undefined") return DEFAULT_GOOGLE_API_CONTROL;
  try {
    return sanitizeGoogleApiControlSettings(JSON.parse(localStorage.getItem(GOOGLE_API_CONTROL_KEY) || "null"));
  } catch {
    return DEFAULT_GOOGLE_API_CONTROL;
  }
}

export function saveGoogleApiControlSettings(patch: Partial<GoogleApiControlSettings>) {
  const next = sanitizeGoogleApiControlSettings({ ...getGoogleApiControlSettings(), ...patch });
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(GOOGLE_API_CONTROL_KEY, JSON.stringify(next)); } catch {}
  }
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new CustomEvent("amd-google-api-control-change", { detail: next })); } catch {}
  }
  return next;
}

export function googleApiRequestsLocked() {
  return getGoogleApiControlSettings().locked;
}

export function assertGoogleNetworkRequestsUnlocked() {
  if (googleApiRequestsLocked()) throw new Error("Google API requests are locked by the local safety control");
}

export function requestUsageWarning(used: number, limit: number) {
  const safeLimit = Math.max(1, limit);
  const percent = Math.max(0, Math.round((Math.max(0, used) / safeLimit) * 100));
  const level: UsageWarningLevel = percent >= 100 ? 100 : percent >= 90 ? 90 : percent >= 75 ? 75 : 0;
  return { used: Math.max(0, used), limit: safeLimit, percent, level };
}
