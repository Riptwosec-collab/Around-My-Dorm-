import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";
import { googleDynamicMapSafetyState, googleMapsMonthlySoftLimit } from "@/lib/google-map-cost-control";

export type GoogleApiBudgetBreakdown = {
  dynamicMap: number;
  placeDetails: number;
  textSearch: number;
  geocoding: number;
  routes: number;
  streetView: number;
  placePhoto: number;
  other: number;
};

export type GoogleApiBudgetSummary = {
  provider: "Google Maps Platform";
  used: number;
  freeLimit: number;
  remaining: number;
  percent: number;
  resetAt: string;
  resetTimezone: "Asia/Bangkok";
  periodStart: string | null;
  lastCheckedAt: string;
  lastRequestAt: string | null;
  failedRequests: number;
  retries: number;
  breakdown: GoogleApiBudgetBreakdown;
};

type UsageSummaryRow = {
  period_start?: string | null;
  reset_at?: string | null;
  total_attempts?: number | string | null;
  dynamic_map?: number | string | null;
  place_details?: number | string | null;
  text_search?: number | string | null;
  geocoding?: number | string | null;
  routes?: number | string | null;
  street_view?: number | string | null;
  place_photo?: number | string | null;
  other_requests?: number | string | null;
  failed_requests?: number | string | null;
  retries?: number | string | null;
  last_request?: string | null;
};

export type TrackedGoogleRequestInput = {
  requestType: "place_photo";
  placeId?: string;
  placeName?: string;
  googlePlaceId?: string;
  status: "success" | "failed";
  attempted?: number;
  retryCount?: number;
  durationMs?: number;
};

let currentSummary: GoogleApiBudgetSummary | null = null;
let hydratePromise: Promise<GoogleApiBudgetSummary> | null = null;

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function defaultSummary(now = new Date()): GoogleApiBudgetSummary {
  const state = googleDynamicMapSafetyState(0, googleMapsMonthlySoftLimit(), now);
  return {
    provider: "Google Maps Platform",
    used: 0,
    freeLimit: state.freeLimit,
    remaining: state.remaining,
    percent: 0,
    resetAt: state.resetAt,
    resetTimezone: state.resetTimezone,
    periodStart: null,
    lastCheckedAt: now.toISOString(),
    lastRequestAt: null,
    failedRequests: 0,
    retries: 0,
    breakdown: {
      dynamicMap: 0,
      placeDetails: 0,
      textSearch: 0,
      geocoding: 0,
      routes: 0,
      streetView: 0,
      placePhoto: 0,
      other: 0,
    },
  };
}

function mapSummary(row: UsageSummaryRow | null | undefined, now = new Date()): GoogleApiBudgetSummary {
  const used = numberValue(row?.total_attempts);
  const state = googleDynamicMapSafetyState(used, googleMapsMonthlySoftLimit(), now);
  return {
    provider: "Google Maps Platform",
    used,
    freeLimit: state.freeLimit,
    remaining: state.remaining,
    percent: state.percent,
    resetAt: row?.reset_at || state.resetAt,
    resetTimezone: state.resetTimezone,
    periodStart: row?.period_start || null,
    lastCheckedAt: now.toISOString(),
    lastRequestAt: row?.last_request || null,
    failedRequests: numberValue(row?.failed_requests),
    retries: numberValue(row?.retries),
    breakdown: {
      dynamicMap: numberValue(row?.dynamic_map),
      placeDetails: numberValue(row?.place_details),
      textSearch: numberValue(row?.text_search),
      geocoding: numberValue(row?.geocoding),
      routes: numberValue(row?.routes),
      streetView: numberValue(row?.street_view),
      placePhoto: numberValue(row?.place_photo),
      other: numberValue(row?.other_requests),
    },
  };
}

export function getGoogleApiBudgetSummary() {
  return currentSummary ?? defaultSummary();
}

export async function hydrateGoogleApiBudgetSummary(force = false) {
  if (process.env.NODE_ENV === "test") {
    currentSummary = currentSummary ?? defaultSummary();
    return currentSummary;
  }
  if (currentSummary && !force) return currentSummary;
  if (hydratePromise && !force) return hydratePromise;
  hydratePromise = (async () => {
    await ensureCloudUser();
    const { data, error } = await supabase.rpc("amd_google_usage_summary");
    if (error) throw error;
    const row = Array.isArray(data) ? (data[0] as UsageSummaryRow | undefined) : (data as UsageSummaryRow | null);
    currentSummary = mapSummary(row);
    return currentSummary;
  })().finally(() => {
    hydratePromise = null;
  });
  return hydratePromise;
}

function requestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2).padEnd(12, "0").slice(0, 12)}`;
}

export async function recordTrackedGoogleRequest(input: TrackedGoogleRequestInput) {
  if (process.env.NODE_ENV === "test") return;
  const user = await ensureCloudUser();
  const occurredAt = new Date().toISOString();
  const { error } = await supabase.from("amd_google_request_logs").insert({
    id: requestId(),
    user_id: user.id,
    occurred_at: occurredAt,
    request_type: input.requestType,
    place_id: input.placeId || null,
    place_name: input.placeName || null,
    google_place_id: input.googlePlaceId || null,
    query: null,
    status: input.status,
    attempted: Math.max(0, input.attempted ?? 1),
    retry_count: Math.max(0, input.retryCount ?? 0),
    duration_ms: input.durationMs ?? null,
    candidate_count: null,
  });
  if (error) throw error;
  currentSummary = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("amd-google-usage-change", { detail: { requestType: input.requestType, occurredAt } }));
  }
}

export function resetGoogleApiBudgetMemoryForTests() {
  currentSummary = null;
  hydratePromise = null;
}
