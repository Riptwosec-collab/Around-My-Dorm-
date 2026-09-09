import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";

export type GoogleApiControlSettings = {
  locked: boolean;
  batchLimit: 10 | 25 | 50 | 100;
  dailyWarningLimit: number;
  monthlyWarningLimit: number;
};
export type UsageWarningLevel = 0 | 75 | 90 | 100;
export const GOOGLE_API_BATCH_OPTIONS = [10, 25, 50, 100] as const;
// Fail closed until the cloud safety policy has been hydrated.
export const DEFAULT_GOOGLE_API_CONTROL: GoogleApiControlSettings = { locked: true, batchLimit: 50, dailyWarningLimit: 200, monthlyWarningLimit: 2000 };

let currentSettings: GoogleApiControlSettings = { ...DEFAULT_GOOGLE_API_CONTROL };
let hydrated = false;
let hydratePromise: Promise<GoogleApiControlSettings> | null = null;

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
  return { locked: record.locked !== false, batchLimit: allowedBatch(record.batchLimit), dailyWarningLimit: positiveInteger(record.dailyWarningLimit, 200, 1, 100000), monthlyWarningLimit: positiveInteger(record.monthlyWarningLimit, 2000, 1, 1000000) };
}

export function getGoogleApiControlSettings() { return currentSettings; }

export async function hydrateGoogleApiControlSettings(force = false) {
  if (process.env.NODE_ENV === "test") { hydrated = true; return currentSettings; }
  if (hydrated && !force) return currentSettings;
  if (hydratePromise && !force) return hydratePromise;
  hydratePromise = (async () => {
    const user = await ensureCloudUser();
    const { data, error } = await supabase.from("amd_google_api_control").select("locked,batch_limit,daily_warning_limit,monthly_warning_limit").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (data) {
      currentSettings = sanitizeGoogleApiControlSettings({ locked: data.locked, batchLimit: data.batch_limit, dailyWarningLimit: data.daily_warning_limit, monthlyWarningLimit: data.monthly_warning_limit });
    } else {
      const inserted = await supabase.from("amd_google_api_control").insert({ user_id: user.id, locked: currentSettings.locked, batch_limit: currentSettings.batchLimit, daily_warning_limit: currentSettings.dailyWarningLimit, monthly_warning_limit: currentSettings.monthlyWarningLimit });
      if (inserted.error) throw inserted.error;
    }
    hydrated = true;
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("amd-google-api-control-change", { detail: currentSettings }));
    return currentSettings;
  })().finally(() => { hydratePromise = null; });
  return hydratePromise;
}

async function persistGoogleApiControl(settings: GoogleApiControlSettings) {
  const user = await ensureCloudUser();
  const { error } = await supabase.from("amd_google_api_control").upsert({ user_id: user.id, locked: settings.locked, batch_limit: settings.batchLimit, daily_warning_limit: settings.dailyWarningLimit, monthly_warning_limit: settings.monthlyWarningLimit, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

export function saveGoogleApiControlSettings(patch: Partial<GoogleApiControlSettings>) {
  currentSettings = sanitizeGoogleApiControlSettings({ ...currentSettings, ...patch });
  hydrated = true;
  if (process.env.NODE_ENV !== "test") void persistGoogleApiControl(currentSettings).catch(() => undefined);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("amd-google-api-control-change", { detail: currentSettings }));
  return currentSettings;
}
export function googleApiRequestsLocked() { return currentSettings.locked; }
export function assertGoogleNetworkRequestsUnlocked() { if (currentSettings.locked) throw new Error("Google API requests are locked by the cloud safety control"); }
export function requestUsageWarning(used: number, limit: number) {
  const safeLimit = Math.max(1, limit); const percent = Math.max(0, Math.round((Math.max(0, used) / safeLimit) * 100));
  const level: UsageWarningLevel = percent >= 100 ? 100 : percent >= 90 ? 90 : percent >= 75 ? 75 : 0;
  return { used: Math.max(0, used), limit: safeLimit, percent, level };
}
export function resetGoogleApiControlMemoryForTests() { currentSettings = { ...DEFAULT_GOOGLE_API_CONTROL }; hydrated = false; hydratePromise = null; }
