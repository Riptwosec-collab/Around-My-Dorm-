import { discoverGooglePlaces, fetchGoogleLiveDetails, type GoogleDiscoveryCandidate, type GoogleLiveDetails } from "@/lib/google-live";
import type { Place } from "@/types/place";
import { assertGoogleNetworkRequestsUnlocked, hydrateGoogleApiControlSettings } from "@/lib/google-api-control";
import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";
import { readGoogleMemoryCache } from "@/lib/google-memory-cache";
import { classifyGoogleEnrichmentError, writeGoogleEnrichmentDiagnostic } from "@/lib/google-enrichment-diagnostics";

export const GOOGLE_REQUEST_MODE = "manual" as const;
export const DEFAULT_GOOGLE_BATCH_LIMIT = 50;
export const DEFAULT_GOOGLE_DAILY_LIMIT = 300;
export const DEFAULT_GOOGLE_MONTHLY_WARNING = 5000;
export const GOOGLE_BATCH_LIMIT_OPTIONS = [10, 25, 50, 100] as const;


export type GoogleRequestType = "dynamic_map" | "place_details" | "text_search" | "geocoding" | "routes" | "street_view" | "other";
export type GoogleRequestStatus = "success" | "failed" | "cancelled";

export type GoogleRequestEstimate = {
  selectedRecords: number;
  eligibleRecords: number;
  uniquePlaceIds: number;
  duplicatePlaceIds: number;
  cacheHits: number;
  newRequests: number;
  batchRequests: number;
  skippedByLimit: number;
  maxRetryAttempts: number;
  maximumPossibleNetworkAttempts: number;
  requestType: "place_details" | "text_search";
};

export type GoogleRequestLog = {
  id: string;
  timestamp: string;
  requestType: GoogleRequestType;
  placeId?: string;
  placeName?: string;
  googlePlaceId?: string;
  query?: string;
  status: GoogleRequestStatus;
  attempted: number;
  retryCount: number;
  durationMs?: number;
  candidateCount?: number;
};

export type GoogleRequestUsage = {
  session: number;
  today: number;
  month: number;
  manualToday: number;
  manualMonth: number;
  dynamicMapToday: number;
  dynamicMapMonth: number;
  placeDetails: number;
  textSearch: number;
  geocoding: number;
  routes: number;
  streetView: number;
  other: number;
  failedRequests: number;
  retries: number;
  networkAttempts: number;
  lastGoogleRequest: string | null;
  lastManualDataUpdate: string | null;
};

export type GoogleRequestProgress = {
  completed: number;
  remaining: number;
  failed: number;
  networkAttempts: number;
  currentName?: string;
};

export type GoogleRequestFailure = {
  place: Place;
  error: string;
};

export type GoogleRequestBatchResult = {
  logicalRequests: number;
  networkAttempts: number;
  succeeded: number;
  failed: number;
  retries: number;
  cancelled: boolean;
  details: Array<{ place: Place; live: GoogleLiveDetails }>;
  failures: GoogleRequestFailure[];
};

export type GoogleTextSearchResult = {
  logicalRequests: number;
  networkAttempts: number;
  succeeded: number;
  failed: number;
  fromCache: boolean;
  candidates: GoogleDiscoveryCandidate[];
};

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function monthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

let requestLogs: GoogleRequestLog[] = [];
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
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2).padEnd(12, "0").slice(0, 12);
  const log: GoogleRequestLog = { ...entry, id, timestamp: new Date().toISOString() };
  writeLogs([...requestLogs, log]);
  if (log.requestType !== "dynamic_map") incrementSessionAttempts(log.attempted);
  if (process.env.NODE_ENV !== "test") void (async () => {
    const user = await ensureCloudUser();
    await supabase.from("amd_google_request_logs").insert({ id: log.id, user_id: user.id, occurred_at: log.timestamp, request_type: log.requestType, place_id: log.placeId || null, place_name: log.placeName || null, google_place_id: log.googlePlaceId || null, query: log.query || null, status: log.status, attempted: log.attempted, retry_count: log.retryCount, duration_ms: log.durationMs ?? null, candidate_count: log.candidateCount ?? null });
  })().catch(() => undefined);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("amd-google-usage-change", { detail: log }));
  return log;
}
export function getGoogleRequestLogs() { return [...requestLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)); }
export function getGoogleRequestUsage(): GoogleRequestUsage {
  const logs = safeReadLogs(); const now = new Date(); const today = dateKey(now); const month = monthKey(now);
  const attempts = (items: GoogleRequestLog[]) => items.reduce((sum, item) => sum + (item.attempted || 0), 0);
  const byType = (type: GoogleRequestType) => attempts(logs.filter((item) => item.requestType === type));
  const dynamicLogs = logs.filter((item) => item.requestType === "dynamic_map");
  const manualLogs = logs.filter((item) => item.requestType !== "dynamic_map");
  const manualToday = attempts(manualLogs.filter((item) => item.timestamp.startsWith(today)));
  const manualMonth = attempts(manualLogs.filter((item) => item.timestamp.startsWith(month)));
  const lastGoogleRequest = [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.timestamp || null;
  const lastManualDataUpdate = [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).find((item) => item.requestType === "place_details" || item.requestType === "text_search")?.timestamp || null;
  return {
    session: sessionAttempts,
    today: manualToday,
    month: manualMonth,
    manualToday,
    manualMonth,
    dynamicMapToday: attempts(dynamicLogs.filter((item) => item.timestamp.startsWith(today))),
    dynamicMapMonth: attempts(dynamicLogs.filter((item) => item.timestamp.startsWith(month))),
    placeDetails: byType("place_details"),
    textSearch: byType("text_search"),
    geocoding: byType("geocoding"),
    routes: byType("routes"),
    streetView: byType("street_view"),
    other: byType("other"),
    failedRequests: manualLogs.filter((item) => item.status === "failed").length,
    retries: manualLogs.reduce((sum, item) => sum + (item.retryCount || 0), 0),
    networkAttempts: attempts(manualLogs),
    lastGoogleRequest,
    lastManualDataUpdate,
  };
}

export function recordDynamicMapLoad() {
  return logGoogleRequest({ requestType: "dynamic_map", status: "success", attempted: 1, retryCount: 0 });
}

function readCacheEntry<T>(key: string): T | null { return readGoogleMemoryCache<T>(key); }
export function resetGoogleRequestMemoryForTests() { requestLogs = []; sessionAttempts = 0; logsHydrated = false; logsHydratePromise = null; }

export function getCachedGooglePlaceDetails(googlePlaceId: string) {
  return readCacheEntry<GoogleLiveDetails>(`detail:${googlePlaceId}`);
}

export function hasGooglePlaceDetailsCache(googlePlaceId: string) {
  return Boolean(getCachedGooglePlaceDetails(googlePlaceId));
}

export function googleTextSearchCacheKey(input: { query: string; center: { lat: number; lng: number }; radiusMeters: number; language?: "th" | "en" }) {
  const normalized = input.query.trim().toLowerCase();
  return `search:${normalized}:${input.center.lat.toFixed(4)}:${input.center.lng.toFixed(4)}:${input.radiusMeters}:${input.language || "th"}`;
}

export function hasGoogleTextSearchCache(input: { query: string; center: { lat: number; lng: number }; radiusMeters: number; language?: "th" | "en" }) {
  return Boolean(readCacheEntry<GoogleDiscoveryCandidate[]>(googleTextSearchCacheKey(input)));
}

export function estimatePlaceDetailRequests(places: Place[], safetyLimit = DEFAULT_GOOGLE_BATCH_LIMIT): GoogleRequestEstimate {
  const selectedRecords = places.length;
  const eligible = places.filter((place) => Boolean(place.googlePlaceId));
  const byId = new Map<string, Place>();
  for (const place of eligible) {
    const id = place.googlePlaceId as string;
    if (!byId.has(id)) byId.set(id, place);
  }
  const unique = [...byId.values()];
  const cacheHits = unique.filter((place) => hasGooglePlaceDetailsCache(place.googlePlaceId as string)).length;
  const newRequests = Math.max(0, unique.length - cacheHits);
  const batchRequests = Math.min(newRequests, Math.max(1, safetyLimit));
  return {
    selectedRecords,
    eligibleRecords: eligible.length,
    uniquePlaceIds: unique.length,
    duplicatePlaceIds: Math.max(0, eligible.length - unique.length),
    cacheHits,
    newRequests,
    batchRequests,
    skippedByLimit: Math.max(0, newRequests - batchRequests),
    maxRetryAttempts: 0,
    maximumPossibleNetworkAttempts: batchRequests,
    requestType: "place_details",
  };
}

export function previewGoogleRequestBatch(places: Place[], safetyLimit = DEFAULT_GOOGLE_BATCH_LIMIT) {
  const seen = new Set<string>();
  const queued: Place[] = [];
  const cached: Place[] = [];
  const ineligible: Place[] = [];
  for (const place of places) {
    const id = place.googlePlaceId;
    if (!id) { ineligible.push(place); continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    if (hasGooglePlaceDetailsCache(id)) cached.push(place);
    else queued.push(place);
  }
  return {
    queued: queued.slice(0, Math.max(1, safetyLimit)),
    queuedBeyondLimit: queued.slice(Math.max(1, safetyLimit)),
    cached,
    ineligible,
  };
}

export function estimateGoogleTextSearchRequests(input: { query: string; center: { lat: number; lng: number }; radiusMeters: number; language?: "th" | "en" }): GoogleRequestEstimate {
  const hasQuery = Boolean(input.query.trim());
  const cached = hasQuery && hasGoogleTextSearchCache(input);
  const newRequests = hasQuery && !cached ? 1 : 0;
  return {
    selectedRecords: hasQuery ? 1 : 0,
    eligibleRecords: hasQuery ? 1 : 0,
    uniquePlaceIds: 0,
    duplicatePlaceIds: 0,
    cacheHits: cached ? 1 : 0,
    newRequests,
    batchRequests: newRequests,
    skippedByLimit: 0,
    maxRetryAttempts: 0,
    maximumPossibleNetworkAttempts: newRequests,
    requestType: "text_search",
  };
}

export async function runGoogleRequestBatch(input: {
  apiKey: string;
  places: Place[];
  safetyLimit?: number;
  dailyLimit?: number;
  isCancelled?: () => boolean;
  onProgress?: (progress: GoogleRequestProgress) => void;
}): Promise<GoogleRequestBatchResult> {
  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");
  await Promise.all([hydrateGoogleApiControlSettings(), hydrateGoogleRequestLogs()]);
  const safetyLimit = input.safetyLimit ?? DEFAULT_GOOGLE_BATCH_LIMIT;
  const dailyLimit = input.dailyLimit ?? DEFAULT_GOOGLE_DAILY_LIMIT;
  const usage = getGoogleRequestUsage();
  const preview = previewGoogleRequestBatch(input.places, safetyLimit);
  const remainingDaily = Math.max(0, dailyLimit - usage.today);
  const queue = preview.queued.slice(0, remainingDaily);
  const logicalRequests = queue.length;
  if (logicalRequests > 0) assertGoogleNetworkRequestsUnlocked();
  const details: Array<{ place: Place; live: GoogleLiveDetails }> = [];
  const failures: GoogleRequestFailure[] = [];
  let completed = 0;
  let networkAttempts = 0;
  let cancelled = false;

  const publish = (currentName?: string) => input.onProgress?.({ completed, remaining: Math.max(0, logicalRequests - completed), failed: failures.length, networkAttempts, currentName });
  publish();

  for (let offset = 0; offset < queue.length; offset += 3) {
    if (input.isCancelled?.()) { cancelled = true; break; }
    const batch = queue.slice(offset, offset + 3);
    await Promise.all(batch.map(async (place) => {
      if (input.isCancelled?.()) return;
      const started = nowMs();
      networkAttempts += 1;
      publish(place.name);
      try {
        const live = await fetchGoogleLiveDetails(input.apiKey, place.googlePlaceId as string);
        details.push({ place, live });
        logGoogleRequest({ requestType: "place_details", placeId: place.id, placeName: place.name, googlePlaceId: place.googlePlaceId || undefined, status: "success", attempted: 1, retryCount: 0, durationMs: Math.round(nowMs() - started) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Google request failed";
        failures.push({ place, error: message });
        logGoogleRequest({ requestType: "place_details", placeId: place.id, placeName: place.name, googlePlaceId: place.googlePlaceId || undefined, status: "failed", attempted: 1, retryCount: 0, durationMs: Math.round(nowMs() - started) });
      } finally {
        completed += 1;
        publish(place.name);
      }
    }));
  }

  if (input.isCancelled?.() && completed < logicalRequests) cancelled = true;
  return { logicalRequests, networkAttempts, succeeded: details.length, failed: failures.length, retries: 0, cancelled, details, failures };
}

export async function runGoogleSinglePlaceDetails(input: { apiKey: string; place: Place; dailyLimit?: number }) {
  if (!input.place.googlePlaceId) throw new Error("Google Place ID is required");
  const cached = getCachedGooglePlaceDetails(input.place.googlePlaceId);
  if (cached) return { live: cached, networkAttempts: 0, fromCache: true };
  const result = await runGoogleRequestBatch({ apiKey: input.apiKey, places: [input.place], safetyLimit: 1, dailyLimit: input.dailyLimit });
  const live = result.details[0]?.live;
  if (!live) throw new Error(result.failures[0]?.error || "Google Place Details request failed");
  return { live, networkAttempts: result.networkAttempts, fromCache: false };
}

export async function retryFailedGoogleRequests(input: {
  apiKey: string;
  failures: GoogleRequestFailure[];
  safetyLimit?: number;
  dailyLimit?: number;
  isCancelled?: () => boolean;
  onProgress?: (progress: GoogleRequestProgress) => void;
}): Promise<GoogleRequestBatchResult> {
  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");
  await Promise.all([hydrateGoogleApiControlSettings(), hydrateGoogleRequestLogs()]);
  const safetyLimit = input.safetyLimit ?? DEFAULT_GOOGLE_BATCH_LIMIT;
  const dailyLimit = input.dailyLimit ?? DEFAULT_GOOGLE_DAILY_LIMIT;
  const remainingDaily = Math.max(0, dailyLimit - getGoogleRequestUsage().today);
  const queue = input.failures.slice(0, Math.min(safetyLimit, remainingDaily));
  if (queue.length > 0) assertGoogleNetworkRequestsUnlocked();
  const details: Array<{ place: Place; live: GoogleLiveDetails }> = [];
  const failures: GoogleRequestFailure[] = [];
  let completed = 0;
  let networkAttempts = 0;
  let cancelled = false;
  const publish = (currentName?: string) => input.onProgress?.({ completed, remaining: Math.max(0, queue.length - completed), failed: failures.length, networkAttempts, currentName });
  publish();

  for (let offset = 0; offset < queue.length; offset += 3) {
    if (input.isCancelled?.()) { cancelled = true; break; }
    const batch = queue.slice(offset, offset + 3);
    await Promise.all(batch.map(async ({ place }) => {
      if (input.isCancelled?.()) return;
      const started = nowMs();
      networkAttempts += 1;
      publish(place.name);
      try {
        const live = await fetchGoogleLiveDetails(input.apiKey, place.googlePlaceId as string, 0);
        details.push({ place, live });
        logGoogleRequest({ requestType: "place_details", placeId: place.id, placeName: place.name, googlePlaceId: place.googlePlaceId || undefined, status: "success", attempted: 1, retryCount: 1, durationMs: Math.round(nowMs() - started) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Google retry failed";
        failures.push({ place, error: message });
        logGoogleRequest({ requestType: "place_details", placeId: place.id, placeName: place.name, googlePlaceId: place.googlePlaceId || undefined, status: "failed", attempted: 1, retryCount: 1, durationMs: Math.round(nowMs() - started) });
      } finally {
        completed += 1;
        publish(place.name);
      }
    }));
  }
  if (input.isCancelled?.() && completed < queue.length) cancelled = true;
  return { logicalRequests: queue.length, networkAttempts, succeeded: details.length, failed: failures.length, retries: networkAttempts, cancelled, details, failures };
}

export async function runGoogleTextSearchRequest(input: {
  apiKey: string;
  query: string;
  center: { lat: number; lng: number };
  radiusMeters: number;
  language?: "th" | "en";
  maxResults?: number;
  dailyLimit?: number;
}): Promise<GoogleTextSearchResult> {
  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");
  await Promise.all([hydrateGoogleApiControlSettings(), hydrateGoogleRequestLogs()]);
  const requestInput = { query: input.query, center: input.center, radiusMeters: input.radiusMeters, language: input.language };
  const fromCache = hasGoogleTextSearchCache(requestInput);
  const usage = getGoogleRequestUsage();
  const dailyLimit = input.dailyLimit ?? DEFAULT_GOOGLE_DAILY_LIMIT;
  if (!fromCache && usage.today >= dailyLimit) throw new Error("Daily manual Google request limit reached");
  if (!fromCache) assertGoogleNetworkRequestsUnlocked();
  const started = nowMs();
  try {
    const candidates = await discoverGooglePlaces(input.apiKey, { query: input.query, center: input.center, radiusMeters: input.radiusMeters, language: input.language, maxResults: input.maxResults });
    if (!fromCache) logGoogleRequest({ requestType: "text_search", query: input.query, status: "success", attempted: 1, retryCount: 0, durationMs: Math.round(nowMs() - started), candidateCount: candidates.length });
    return { logicalRequests: 1, networkAttempts: fromCache ? 0 : 1, succeeded: 1, failed: 0, fromCache, candidates };
  } catch (error) {
    if (!fromCache) logGoogleRequest({ requestType: "text_search", query: input.query, status: "failed", attempted: 1, retryCount: 0, durationMs: Math.round(nowMs() - started) });
    throw error;
  }
}

/**
 * Shared maintenance wrappers used by the explicit Google -> Supabase bulk
 * action. These deliberately avoid Supabase Auth/control hydration because the
 * shared cache is app-owned, but they remain behind this single request layer.
 */
type SharedGoogleDiagnosticContext = {
  runId: string;
  placeId?: string;
  placeName?: string;
};

export async function runSharedGoogleTextSearch(input: {
  apiKey: string;
  query: string;
  center: { lat: number; lng: number };
  radiusMeters: number;
  language?: "th" | "en";
  maxResults?: number;
  diagnostic?: SharedGoogleDiagnosticContext;
}) {
  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");
  const started = nowMs();
  try {
    return await discoverGooglePlaces(input.apiKey, {
      query: input.query,
      center: input.center,
      radiusMeters: input.radiusMeters,
      language: input.language,
      maxResults: input.maxResults,
    });
  } catch (error) {
    if (input.diagnostic) {
      await writeGoogleEnrichmentDiagnostic({
        runId: input.diagnostic.runId,
        stage: "text_search_failed",
        placeId: input.diagnostic.placeId,
        placeName: input.diagnostic.placeName,
        ok: false,
        error,
        meta: {
          code: classifyGoogleEnrichmentError(error),
          durationMs: Math.round(nowMs() - started),
          radiusMeters: input.radiusMeters,
          language: input.language || "th",
        },
      });
    }
    throw error;
  }
}

export async function runSharedGooglePlaceDetails(input: {
  apiKey: string;
  googlePlaceId: string;
  diagnostic?: SharedGoogleDiagnosticContext;
}) {
  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");
  const started = nowMs();
  try {
    return await fetchGoogleLiveDetails(input.apiKey, input.googlePlaceId);
  } catch (error) {
    if (input.diagnostic) {
      await writeGoogleEnrichmentDiagnostic({
        runId: input.diagnostic.runId,
        stage: "place_details_failed",
        placeId: input.diagnostic.placeId,
        placeName: input.diagnostic.placeName,
        ok: false,
        error,
        meta: {
          code: classifyGoogleEnrichmentError(error),
          durationMs: Math.round(nowMs() - started),
          googlePlaceId: input.googlePlaceId,
        },
      });
    }
    throw error;
  }
}

