import { requireAdminSessionToken } from "@/lib/admin-auth";
import { isUsableHomeOrigin } from "@/lib/home-origin";
import type { HomeOrigin, Place, PlaceDistance } from "@/types/place";
import type { RouteMode, RouteMatrixResult } from "@/worker/google-routes";

/**
 * Google Routes response content is never persisted to Supabase, localStorage,
 * sessionStorage, IndexedDB, or any other durable cache. Results live only in
 * this JS module's process/runtime memory after an explicit admin request.
 */
export const ROUTE_RUNTIME_TTL_MINUTES = 20;
const ROUTE_RUNTIME_TTL_MS = ROUTE_RUNTIME_TTL_MINUTES * 60 * 1000;
const runtimeRouteRows = new Map<string, RouteCacheRow>();

export type RouteCacheRow = {
  origin_id: string;
  place_id: string;
  travel_mode: RouteMode;
  distance_meters: number | null;
  duration_seconds: number | null;
  status: string;
  fetched_at: string;
  expires_at: string;
};

export type RouteRefreshProgress = {
  mode: RouteMode | null;
  processed: number;
  total: number;
  requests: number;
  success: number;
  skipped: number;
  failed: number;
  currentBatch: number;
  totalBatches: number;
};

function rowKey(originId: string, placeId: string, mode: RouteMode) {
  return `${originId}:${placeId}:${mode}`;
}

function isFresh(row: RouteCacheRow) {
  return new Date(row.expires_at).getTime() > Date.now();
}

function purgeExpiredRuntimeRows() {
  for (const [key, row] of runtimeRouteRows.entries()) {
    if (!isFresh(row)) runtimeRouteRows.delete(key);
  }
}

function minutes(seconds: number | null) {
  return seconds == null ? null : Math.max(1, Math.round(seconds / 60));
}

export function clearRuntimeRouteCache() {
  runtimeRouteRows.clear();
}

export function storeRuntimeRouteResults(originId: string, results: RouteMatrixResult[], fetchedAt = new Date().toISOString()) {
  if (!results.length) return;
  purgeExpiredRuntimeRows();
  const expiresAt = new Date(new Date(fetchedAt).getTime() + ROUTE_RUNTIME_TTL_MS).toISOString();
  for (const result of results) {
    const row: RouteCacheRow = {
      origin_id: originId,
      place_id: result.placeId,
      travel_mode: result.mode,
      distance_meters: result.distanceMeters,
      duration_seconds: result.durationSeconds,
      status: result.condition || (result.statusCode === 0 ? "ROUTE_EXISTS" : "ROUTE_NOT_FOUND"),
      fetched_at: fetchedAt,
      expires_at: expiresAt,
    };
    runtimeRouteRows.set(rowKey(originId, result.placeId, result.mode), row);
  }
}

export async function loadRouteCache(originId = "baan-supha-apartment"): Promise<RouteCacheRow[]> {
  purgeExpiredRuntimeRows();
  return Array.from(runtimeRouteRows.values()).filter((row) => row.origin_id === originId);
}

export function mergeRouteCacheIntoPlaces(places: Place[], rows: RouteCacheRow[]): Place[] {
  const fresh = rows.filter(isFresh);
  const byPlace = new Map<string, RouteCacheRow[]>();
  for (const row of fresh) {
    const list = byPlace.get(row.place_id) || [];
    list.push(row);
    byPlace.set(row.place_id, list);
  }

  return places.map((place) => {
    const routeRows = byPlace.get(place.id);
    if (!routeRows?.length) return place;

    const distance: PlaceDistance = {
      straightLineMeters: place.distance?.straightLineMeters ?? (place.straightLineDistanceKm != null ? Math.round(place.straightLineDistanceKm * 1000) : place.distanceKm != null ? Math.round(place.distanceKm * 1000) : null),
      walkingDistanceMeters: place.distance?.walkingDistanceMeters ?? null,
      walkingMinutes: place.distance?.walkingMinutes ?? place.walkingMinutes ?? null,
      motorcycleDistanceMeters: place.distance?.motorcycleDistanceMeters ?? null,
      motorcycleMinutes: place.distance?.motorcycleMinutes ?? null,
      drivingDistanceMeters: place.distance?.drivingDistanceMeters ?? null,
      drivingMinutes: place.distance?.drivingMinutes ?? place.drivingMinutes ?? null,
    };
    let walkingMinutes = place.walkingMinutes;
    let drivingMinutes = place.drivingMinutes;
    let latest = place.lastChecked || null;

    for (const row of routeRows) {
      if (latest == null || row.fetched_at > latest) latest = row.fetched_at;
      const routeExists = row.status === "ROUTE_EXISTS" || row.status === "OK" || row.status === "";
      if (!routeExists || row.distance_meters == null || row.duration_seconds == null) continue;
      if (row.travel_mode === "WALK") {
        distance.walkingDistanceMeters = row.distance_meters;
        distance.walkingMinutes = minutes(row.duration_seconds);
        walkingMinutes = distance.walkingMinutes;
      } else if (row.travel_mode === "DRIVE") {
        distance.drivingDistanceMeters = row.distance_meters;
        distance.drivingMinutes = minutes(row.duration_seconds);
        drivingMinutes = distance.drivingMinutes;
      } else if (row.travel_mode === "TWO_WHEELER") {
        distance.motorcycleDistanceMeters = row.distance_meters;
        distance.motorcycleMinutes = minutes(row.duration_seconds);
      }
    }

    return {
      ...place,
      distance,
      walkingMinutes,
      drivingMinutes,
      walkingDistanceKm: distance.walkingDistanceMeters != null ? Number((distance.walkingDistanceMeters / 1000).toFixed(2)) : place.walkingDistanceKm,
      drivingDistanceKm: distance.drivingDistanceMeters != null ? Number((distance.drivingDistanceMeters / 1000).toFixed(2)) : place.drivingDistanceKm,
      source: Array.from(new Set([...(place.source || []), "google_routes_runtime"])),
      lastChecked: latest,
    };
  });
}

export async function refreshRoutesForPlaces(input: {
  origin: HomeOrigin;
  places: Place[];
  modes?: RouteMode[];
  onProgress?: (value: RouteRefreshProgress) => void;
}): Promise<RouteRefreshProgress> {
  if (!isUsableHomeOrigin(input.origin)) throw new Error("Verified HOME origin is required before refreshing routes");
  const token = await requireAdminSessionToken();
  const eligible = input.places.filter((place) => place.latitude != null && place.longitude != null);
  const modes = input.modes || ["WALK", "DRIVE", "TWO_WHEELER"];
  const batches: Array<{ mode: RouteMode; places: Place[] }> = [];
  for (const mode of modes) {
    for (let i = 0; i < eligible.length; i += 25) batches.push({ mode, places: eligible.slice(i, i + 25) });
  }

  const progress: RouteRefreshProgress = { mode: null, processed: 0, total: eligible.length * modes.length, requests: 0, success: 0, skipped: (input.places.length - eligible.length) * modes.length, failed: 0, currentBatch: 0, totalBatches: batches.length };
  input.onProgress?.({ ...progress });

  for (const [index, batch] of batches.entries()) {
    progress.mode = batch.mode;
    progress.currentBatch = index + 1;
    input.onProgress?.({ ...progress });
    try {
      const response = await fetch("/api/routes/refresh", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          origin: { latitude: input.origin.latitude, longitude: input.origin.longitude },
          destinations: batch.places.map((place) => ({ id: place.id, latitude: place.latitude, longitude: place.longitude })),
          mode: batch.mode,
        }),
      });
      progress.requests += 1;
      const body = await response.json() as { ok?: boolean; results?: RouteMatrixResult[]; error?: string };
      if (!response.ok || !body.ok || !Array.isArray(body.results)) throw new Error(body.error || `Route request failed (${response.status})`);
      storeRuntimeRouteResults(input.origin.id, body.results);
      for (const result of body.results) {
        if (result.distanceMeters != null && result.durationSeconds != null) progress.success += 1;
        else progress.skipped += 1;
      }
      progress.processed += batch.places.length;
    } catch {
      progress.failed += batch.places.length;
      progress.processed += batch.places.length;
    }
    input.onProgress?.({ ...progress });
  }

  progress.mode = null;
  input.onProgress?.({ ...progress });
  return progress;
}
