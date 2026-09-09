from pathlib import Path

ROOT = Path('.')

def write(path: str, content: str):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding='utf-8')

def replace(path: str, old: str, new: str):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:140]!r}')
    p.write_text(text.replace(old, new), encoding='utf-8')

write('lib/google-memory-cache.ts', r'''type CacheEnvelope<T> = { expiresAt: number; value: T };
const cache = new Map<string, CacheEnvelope<unknown>>();

export function readGoogleMemoryCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEnvelope<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.value;
}

export function writeGoogleMemoryCache<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

export function clearGoogleMemoryCache() { cache.clear(); }
''')

write('lib/google-api-control.ts', r'''import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";

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
''')

# Google live cache is memory-only, never Web Storage.
p = ROOT / 'lib/google-live.ts'
text = p.read_text(encoding='utf-8')
text = text.replace('import { loadGoogleMaps } from "@/lib/google-maps";\n', 'import { loadGoogleMaps } from "@/lib/google-maps";\nimport { readGoogleMemoryCache, writeGoogleMemoryCache } from "@/lib/google-memory-cache";\n')
start = text.index('type CacheEnvelope<T>')
end = text.index('function literalLocation')
text = text[:start] + '''function readCache<T>(key: string): T | null { return readGoogleMemoryCache<T>(key); }\nfunction writeCache<T>(key: string, value: T, ttlMs: number) { writeGoogleMemoryCache(key, value, ttlMs); }\n\n''' + text[end:]
p.write_text(text, encoding='utf-8')

# Request manager: cloud request logs, memory-only transient cache/session counters, hydrate safety before every external call.
p = ROOT / 'lib/google-request-manager.ts'
text = p.read_text(encoding='utf-8')
text = text.replace('import { assertGoogleNetworkRequestsUnlocked } from "@/lib/google-api-control";', 'import { assertGoogleNetworkRequestsUnlocked, hydrateGoogleApiControlSettings } from "@/lib/google-api-control";\nimport { ensureCloudUser, supabase } from "@/lib/cloud/supabase";\nimport { readGoogleMemoryCache } from "@/lib/google-memory-cache";')
text = text.replace('const LIVE_CACHE_PREFIX = "amd-google-live-v1:";\nconst LOG_KEY = "around-dorm-google-request-log-v1";\nconst SESSION_ATTEMPTS_KEY = "around-dorm-google-session-attempts-v1";\n', '')
old_start = text.index('function safeReadLogs()')
old_end = text.index('export function getCachedGooglePlaceDetails')
new_block = r'''let requestLogs: GoogleRequestLog[] = [];
let sessionAttempts = 0;
let logsHydrated = false;
let logsHydratePromise: Promise<GoogleRequestLog[]> | null = null;

function safeReadLogs() { return requestLogs; }
function writeLogs(logs: GoogleRequestLog[]) { requestLogs = logs.slice(-800); }
function incrementSessionAttempts(amount: number) { if (amount > 0) sessionAttempts += amount; }

export async function hydrateGoogleRequestLogs(force = false) {
  if (process.env.NODE_ENV === "test") { logsHydrated = true; return requestLogs; }
  if (logsHydrated && !force) return requestLogs;
  if (logsHydratePromise && !force) return logsHydratePromise;
  logsHydratePromise = (async () => {
    const user = await ensureCloudUser();
    const { data, error } = await supabase.from("amd_google_request_logs").select("id,occurred_at,request_type,place_id,place_name,google_place_id,query,status,attempted,retry_count,duration_ms,candidate_count").eq("user_id", user.id).order("occurred_at", { ascending: false }).limit(800);
    if (error) throw error;
    requestLogs = (data || []).map((row: any) => ({ id: row.id, timestamp: row.occurred_at, requestType: row.request_type, placeId: row.place_id || undefined, placeName: row.place_name || undefined, googlePlaceId: row.google_place_id || undefined, query: row.query || undefined, status: row.status, attempted: row.attempted || 0, retryCount: row.retry_count || 0, durationMs: row.duration_ms ?? undefined, candidateCount: row.candidate_count ?? undefined }));
    logsHydrated = true;
    return requestLogs;
  })().finally(() => { logsHydratePromise = null; });
  return logsHydratePromise;
}

export function logGoogleRequest(entry: Omit<GoogleRequestLog, "id" | "timestamp">) {
  const log: GoogleRequestLog = { ...entry, id: `greq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: new Date().toISOString() };
  writeLogs([...requestLogs, log]); incrementSessionAttempts(log.attempted);
  if (process.env.NODE_ENV !== "test") void (async () => {
    const user = await ensureCloudUser();
    await supabase.from("amd_google_request_logs").insert({ id: log.id, user_id: user.id, occurred_at: log.timestamp, request_type: log.requestType, place_id: log.placeId || null, place_name: log.placeName || null, google_place_id: log.googlePlaceId || null, query: log.query || null, status: log.status, attempted: log.attempted, retry_count: log.retryCount, duration_ms: log.durationMs ?? null, candidate_count: log.candidateCount ?? null });
  })().catch(() => undefined);
  return log;
}
export function getGoogleRequestLogs() { return [...requestLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)); }
export function getGoogleRequestUsage(): GoogleRequestUsage {
  const logs = safeReadLogs(); const now = new Date(); const today = dateKey(now); const month = monthKey(now);
  const attempts = (items: GoogleRequestLog[]) => items.reduce((sum, item) => sum + (item.attempted || 0), 0);
  const byType = (type: GoogleRequestType) => attempts(logs.filter((item) => item.requestType === type));
  return { session: sessionAttempts, today: attempts(logs.filter((item) => item.timestamp.startsWith(today))), month: attempts(logs.filter((item) => item.timestamp.startsWith(month))), placeDetails: byType("place_details"), textSearch: byType("text_search"), other: byType("other"), failedRequests: logs.filter((item) => item.status === "failed").length, retries: logs.reduce((sum, item) => sum + (item.retryCount || 0), 0), networkAttempts: attempts(logs) };
}
function readCacheEntry<T>(key: string): T | null { return readGoogleMemoryCache<T>(key); }
export function resetGoogleRequestMemoryForTests() { requestLogs = []; sessionAttempts = 0; logsHydrated = false; logsHydratePromise = null; }

'''
text = text[:old_start] + new_block + text[old_end:]
text = text.replace('  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");\n  const safetyLimit', '  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");\n  await Promise.all([hydrateGoogleApiControlSettings(), hydrateGoogleRequestLogs()]);\n  const safetyLimit', 1)
# Retry function occurrence.
pos = text.index('export async function retryFailedGoogleRequests')
segment = text[pos:]
segment = segment.replace('  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");\n  const safetyLimit', '  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");\n  await Promise.all([hydrateGoogleApiControlSettings(), hydrateGoogleRequestLogs()]);\n  const safetyLimit', 1)
text = text[:pos] + segment
# Text search occurrence.
pos = text.index('export async function runGoogleTextSearchRequest')
segment = text[pos:]
segment = segment.replace('  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");\n  const requestInput', '  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");\n  await Promise.all([hydrateGoogleApiControlSettings(), hydrateGoogleRequestLogs()]);\n  const requestInput', 1)
text = text[:pos] + segment
p.write_text(text, encoding='utf-8')

# Hydrate control/log UI after mount.
p = ROOT / 'components/GoogleMaintenancePanel.tsx'
text = p.read_text(encoding='utf-8')
text = text.replace('import { useMemo, useRef, useState } from "react";', 'import { useEffect, useMemo, useRef, useState } from "react";')
text = text.replace('  getGoogleRequestLogs,\n', '  getGoogleRequestLogs,\n  hydrateGoogleRequestLogs,\n')
text = text.replace('import { getGoogleApiControlSettings, requestUsageWarning, saveGoogleApiControlSettings } from "@/lib/google-api-control";', 'import { getGoogleApiControlSettings, hydrateGoogleApiControlSettings, requestUsageWarning, saveGoogleApiControlSettings } from "@/lib/google-api-control";')
needle = '  const runningRef = useRef(false);\n'
insert = '''  const runningRef = useRef(false);\n\n  useEffect(() => {\n    void Promise.all([hydrateGoogleApiControlSettings(), hydrateGoogleRequestLogs()]).then(([control]) => { setApiControl(control); setUsageVersion((value) => value + 1); }).catch(() => undefined);\n  }, []);\n'''
if needle not in text: raise SystemExit('Maintenance ref marker missing')
text = text.replace(needle, insert)
p.write_text(text, encoding='utf-8')

# Place ID manager hydrate cloud control too.
p = ROOT / 'components/GooglePlaceIdManager.tsx'
text = p.read_text(encoding='utf-8')
text = text.replace('import { getGoogleApiControlSettings } from "@/lib/google-api-control";', 'import { getGoogleApiControlSettings, hydrateGoogleApiControlSettings } from "@/lib/google-api-control";')
text = text.replace('    void loadGooglePlaceMatchRecords().then(() => setThreshold(loadMatchConfidenceThreshold(DEFAULT_MATCH_CONFIDENCE_THRESHOLD))).catch(() => undefined);', '    void Promise.all([loadGooglePlaceMatchRecords(), hydrateGoogleApiControlSettings()]).then(([, control]) => { setThreshold(loadMatchConfidenceThreshold(DEFAULT_MATCH_CONFIDENCE_THRESHOLD)); setApiLocked(control.locked); }).catch(() => undefined);')
p.write_text(text, encoding='utf-8')

# Tests: module memory reset and cloud-only persistence assertions.
p = ROOT / 'tests/google-api-control.test.ts'
text = p.read_text(encoding='utf-8')
text = text.replace('import { DEFAULT_GOOGLE_API_CONTROL, getGoogleApiControlSettings, requestUsageWarning, saveGoogleApiControlSettings, sanitizeGoogleApiControlSettings } from "@/lib/google-api-control";', 'import { DEFAULT_GOOGLE_API_CONTROL, getGoogleApiControlSettings, requestUsageWarning, resetGoogleApiControlMemoryForTests, saveGoogleApiControlSettings, sanitizeGoogleApiControlSettings } from "@/lib/google-api-control";')
text = text.replace('import { getGoogleRequestUsage } from "@/lib/google-request-manager";', 'import { getGoogleRequestUsage, logGoogleRequest, resetGoogleRequestMemoryForTests } from "@/lib/google-request-manager";')
text = text.replace('    localStorage.clear();\n    sessionStorage.clear();', '    resetGoogleApiControlMemoryForTests();\n    resetGoogleRequestMemoryForTests();')
text = text.replace('    expect(getGoogleApiControlSettings()).toEqual({ locked: false, batchLimit: 25, dailyWarningLimit: 150, monthlyWarningLimit: 1500 });', '    expect(getGoogleApiControlSettings()).toEqual({ locked: true, batchLimit: 25, dailyWarningLimit: 150, monthlyWarningLimit: 1500 });')
text = text.replace('  it("derives failed, retry and network counters from local logs", () => {\n    const now = new Date().toISOString();\n    localStorage.setItem("around-dorm-google-request-log-v1", JSON.stringify([\n      { id: "a", timestamp: now, requestType: "place_details", status: "success", attempted: 1, retryCount: 0 },\n      { id: "b", timestamp: now, requestType: "text_search", status: "failed", attempted: 1, retryCount: 0 },\n      { id: "c", timestamp: now, requestType: "place_details", status: "failed", attempted: 1, retryCount: 1 },\n    ]));', '  it("derives failed, retry and network counters from cloud-log memory", () => {\n    logGoogleRequest({ requestType: "place_details", status: "success", attempted: 1, retryCount: 0 });\n    logGoogleRequest({ requestType: "text_search", status: "failed", attempted: 1, retryCount: 0 });\n    logGoogleRequest({ requestType: "place_details", status: "failed", attempted: 1, retryCount: 1 });')
p.write_text(text, encoding='utf-8')

p = ROOT / 'tests/google-api-lock.test.ts'
text = p.read_text(encoding='utf-8')
text = text.replace('import { getGoogleApiControlSettings, saveGoogleApiControlSettings } from "@/lib/google-api-control";', 'import { getGoogleApiControlSettings, resetGoogleApiControlMemoryForTests, saveGoogleApiControlSettings } from "@/lib/google-api-control";')
text = text.replace('import { runGoogleRequestBatch, runGoogleTextSearchRequest } from "@/lib/google-request-manager";', 'import { resetGoogleRequestMemoryForTests, runGoogleRequestBatch, runGoogleTextSearchRequest } from "@/lib/google-request-manager";')
text = text.replace('    localStorage.clear();\n    sessionStorage.clear();', '    resetGoogleApiControlMemoryForTests();\n    resetGoogleRequestMemoryForTests();')
p.write_text(text, encoding='utf-8')

write('tests/cloud-only-google-control.test.ts', r'''import { describe, expect, it } from "vitest";
import fs from "node:fs";
describe("cloud-only Google control persistence", () => {
  it("keeps Google control, request logs and live cache out of Web Storage", () => {
    for (const file of ["lib/google-api-control.ts", "lib/google-request-manager.ts", "lib/google-live.ts"]) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).not.toContain("localStorage");
      expect(source, file).not.toContain("sessionStorage");
    }
  });
  it("fails closed before cloud safety policy hydration", () => {
    const source = fs.readFileSync("lib/google-api-control.ts", "utf8");
    expect(source).toContain("locked: true");
    expect(source).toContain("amd_google_api_control");
    expect(fs.readFileSync("lib/google-request-manager.ts", "utf8")).toContain("amd_google_request_logs");
  });
});
''')

print('Cloud-only Google control migration staged.')
