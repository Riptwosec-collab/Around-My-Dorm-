import { discoverGooglePlaces, fetchGoogleLiveDetails, type GoogleDiscoveryCandidate, type GoogleLiveDetails } from "@/lib/google-live";
import type { Place } from "@/types/place";

export const GOOGLE_REQUEST_MODE = "manual" as const;
export const DEFAULT_GOOGLE_BATCH_LIMIT = 50;
export const DEFAULT_GOOGLE_DAILY_LIMIT = 300;
export const DEFAULT_GOOGLE_MONTHLY_WARNING = 5000;
export const GOOGLE_BATCH_LIMIT_OPTIONS = [10, 25, 50, 100] as const;

const LIVE_CACHE_PREFIX = "amd-google-live-v1:";
const LOG_KEY = "around-dorm-google-request-log-v1";
const SESSION_ATTEMPTS_KEY = "around-dorm-google-session-attempts-v1";

export type GoogleRequestType = "place_details" | "text_search" | "other";
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
  placeDetails: number;
  textSearch: number;
  other: number;
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

function browserNow() {
  return new Date();
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function monthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function safeReadLogs(): GoogleRequestLog[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LOG_KEY) || "[]") as GoogleRequestLog[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLogs(logs: GoogleRequestLog[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(-800)));
  } catch {}
}

function incrementSessionAttempts(amount: number) {
  if (typeof sessionStorage === "undefined" || amount <= 0) return;
  try {
    const previous = Number(sessionStorage.getItem(SESSION_ATTEMPTS_KEY) || "0") || 0;
    sessionStorage.setItem(SESSION_ATTEMPTS_KEY, String(previous + amount));
  } catch {}
}

export function logGoogleRequest(entry: Omit<GoogleRequestLog, "id" | "timestamp">) {
  const log: GoogleRequestLog = {
    ...entry,
    id: `greq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
  const logs = safeReadLogs();
  logs.push(log);
  writeLogs(logs);
  incrementSessionAttempts(log.attempted);
  return log;
}

export function getGoogleRequestLogs() {
  return safeReadLogs().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getGoogleRequestUsage(): GoogleRequestUsage {
  const logs = safeReadLogs();
  const now = browserNow();
  const today = dateKey(now);
  const month = monthKey(now);
  const attempts = (items: GoogleRequestLog[]) => items.reduce((sum, item) => sum + (item.attempted || 0), 0);
  const byType = (type: GoogleRequestType) => attempts(logs.filter((item) => item.requestType === type));
  let session = 0;
  if (typeof sessionStorage !== "undefined") {
    try { session = Number(sessionStorage.getItem(SESSION_ATTEMPTS_KEY) || "0") || 0; } catch {}
  }
  return {
    session,
    today: attempts(logs.filter((item) => item.timestamp.startsWith(today))),
    month: attempts(logs.filter((item) => item.timestamp.startsWith(month))),
    placeDetails: byType("place_details"),
    textSearch: byType("text_search"),
    other: byType("other"),
  };
}

function readCacheEntry<T>(key: string): T | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const entry = JSON.parse(sessionStorage.getItem(LIVE_CACHE_PREFIX + key) || "null") as { expiresAt?: number; value?: T } | null;
    if (!entry || typeof entry.expiresAt !== "number" || Date.now() > entry.expiresAt) return null;
    return entry.value ?? null;
  } catch {
    return null;
  }
}

export function hasGooglePlaceDetailsCache(googlePlaceId: string) {
  return Boolean(readCacheEntry<GoogleLiveDetails>(`detail:${googlePlaceId}`));
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
    if (!id) {
      ineligible.push(place);
      continue;
    }
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
  const safetyLimit = input.safetyLimit ?? DEFAULT_GOOGLE_BATCH_LIMIT;
  const dailyLimit = input.dailyLimit ?? DEFAULT_GOOGLE_DAILY_LIMIT;
  const usage = getGoogleRequestUsage();
  const preview = previewGoogleRequestBatch(input.places, safetyLimit);
  const remainingDaily = Math.max(0, dailyLimit - usage.today);
  const queue = preview.queued.slice(0, remainingDaily);
  const logicalRequests = queue.length;
  const details: Array<{ place: Place; live: GoogleLiveDetails }> = [];
  const failures: GoogleRequestFailure[] = [];
  let completed = 0;
  let networkAttempts = 0;
  let cancelled = false;

  const publish = (currentName?: string) => input.onProgress?.({
    completed,
    remaining: Math.max(0, logicalRequests - completed),
    failed: failures.length,
    networkAttempts,
    currentName,
  });
  publish();

  for (let offset = 0; offset < queue.length; offset += 3) {
    if (input.isCancelled?.()) { cancelled = true; break; }
    const batch = queue.slice(offset, offset + 3);
    await Promise.all(batch.map(async (place) => {
      if (input.isCancelled?.()) return;
      const started = performance.now();
      networkAttempts += 1;
      publish(place.name);
      try {
        const live = await fetchGoogleLiveDetails(input.apiKey, place.googlePlaceId as string);
        details.push({ place, live });
        logGoogleRequest({
          requestType: "place_details",
          placeId: place.id,
          placeName: place.name,
          googlePlaceId: place.googlePlaceId || undefined,
          status: "success",
          attempted: 1,
          retryCount: 0,
          durationMs: Math.round(performance.now() - started),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Google request failed";
        failures.push({ place, error: message });
        logGoogleRequest({
          requestType: "place_details",
          placeId: place.id,
          placeName: place.name,
          googlePlaceId: place.googlePlaceId || undefined,
          status: "failed",
          attempted: 1,
          retryCount: 0,
          durationMs: Math.round(performance.now() - started),
        });
      } finally {
        completed += 1;
        publish(place.name);
      }
    }));
  }

  if (input.isCancelled?.() && completed < logicalRequests) cancelled = true;
  return {
    logicalRequests,
    networkAttempts,
    succeeded: details.length,
    failed: failures.length,
    retries: 0,
    cancelled,
    details,
    failures,
  };
}

export async function retryFailedGoogleRequests(input: {
  apiKey: string;
  failures: GoogleRequestFailure[];
  safetyLimit?: number;
  dailyLimit?: number;
  isCancelled?: () => boolean;
  onProgress?: (progress: GoogleRequestProgress) => void;
}) {
  return runGoogleRequestBatch({
    apiKey: input.apiKey,
    places: input.failures.map((item) => item.place),
    safetyLimit: input.safetyLimit,
    dailyLimit: input.dailyLimit,
    isCancelled: input.isCancelled,
    onProgress: input.onProgress,
  });
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
  const requestInput = { query: input.query, center: input.center, radiusMeters: input.radiusMeters, language: input.language };
  const fromCache = hasGoogleTextSearchCache(requestInput);
  const usage = getGoogleRequestUsage();
  const dailyLimit = input.dailyLimit ?? DEFAULT_GOOGLE_DAILY_LIMIT;
  if (!fromCache && usage.today >= dailyLimit) throw new Error("Daily manual Google request limit reached");
  const started = performance.now();
  try {
    const candidates = await discoverGooglePlaces(input.apiKey, {
      query: input.query,
      center: input.center,
      radiusMeters: input.radiusMeters,
      language: input.language,
      maxResults: input.maxResults,
    });
    if (!fromCache) {
      logGoogleRequest({
        requestType: "text_search",
        query: input.query,
        status: "success",
        attempted: 1,
        retryCount: 0,
        durationMs: Math.round(performance.now() - started),
        candidateCount: candidates.length,
      });
    }
    return { logicalRequests: 1, networkAttempts: fromCache ? 0 : 1, succeeded: 1, failed: 0, fromCache, candidates };
  } catch (error) {
    if (!fromCache) {
      logGoogleRequest({
        requestType: "text_search",
        query: input.query,
        status: "failed",
        attempted: 1,
        retryCount: 0,
        durationMs: Math.round(performance.now() - started),
      });
    }
    throw error;
  }
}
