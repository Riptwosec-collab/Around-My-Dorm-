import { recordTrackedGoogleRequest } from "@/lib/google-api-budget";
import { googleApiRequestsLocked } from "@/lib/google-api-control";
import { DORM_CENTER } from "@/lib/place-utils";
import type { Place } from "@/types/place";

export type RouteMode = "walking" | "motorcycle" | "driving";

export type RuntimeRouteResult = {
  mode: RouteMode;
  distanceMeters: number;
  durationSeconds: number;
  calculatedAt: string;
  provider: "google_routes";
};

export type RouteRuntimeErrorCode =
  | "api_locked"
  | "missing_api_key"
  | "missing_coordinates"
  | "no_route"
  | "provider_error";

export class RouteRuntimeError extends Error {
  readonly code: RouteRuntimeErrorCode;

  constructor(code: RouteRuntimeErrorCode, message: string) {
    super(message);
    this.name = "RouteRuntimeError";
    this.code = code;
  }
}

const GOOGLE_MODE: Record<RouteMode, "WALK" | "TWO_WHEELER" | "DRIVE"> = {
  walking: "WALK",
  motorcycle: "TWO_WHEELER",
  driving: "DRIVE",
};

const ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const routeCache = new Map<string, RuntimeRouteResult>();

function cacheKey(placeId: string, mode: RouteMode) {
  return `${placeId}:${mode}`;
}

function validCoordinate(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value);
}

function parseGoogleDuration(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : null;
}

async function logRouteAttempt(input: Parameters<typeof recordTrackedGoogleRequest>[0]) {
  try {
    await recordTrackedGoogleRequest(input);
  } catch {
    // Usage logging is operational telemetry. A logging outage must not turn a
    // valid route response into a user-visible route failure.
  }
}

export function getCachedRoute(placeId: string, mode: RouteMode) {
  return routeCache.get(cacheKey(placeId, mode)) ?? null;
}

export async function calculateRoute(
  place: Place,
  mode: RouteMode,
  options: { force?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<RuntimeRouteResult> {
  const key = cacheKey(place.id, mode);
  if (!options.force) {
    const cached = routeCache.get(key);
    if (cached) return cached;
  }

  if (googleApiRequestsLocked()) {
    throw new RouteRuntimeError("api_locked", "Google API requests are locked by the cloud safety control");
  }

  if (!validCoordinate(place.latitude) || !validCoordinate(place.longitude)) {
    throw new RouteRuntimeError("missing_coordinates", "Place coordinates are unavailable");
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    throw new RouteRuntimeError("missing_api_key", "Google Maps API key is unavailable");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const startedAt = Date.now();
  let response: Response;

  try {
    response = await fetchImpl(ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: DORM_CENTER.lat,
              longitude: DORM_CENTER.lng,
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: place.latitude,
              longitude: place.longitude,
            },
          },
        },
        travelMode: GOOGLE_MODE[mode],
        computeAlternativeRoutes: false,
        languageCode: "th-TH",
        units: "METRIC",
      }),
    });
  } catch (error) {
    await logRouteAttempt({
      requestType: "routes",
      placeId: place.id,
      placeName: place.name,
      googlePlaceId: place.googlePlaceId ?? undefined,
      status: "failed",
      resultCode: "failed",
      durationMs: Date.now() - startedAt,
    });
    throw new RouteRuntimeError("provider_error", error instanceof Error ? error.message : "Route provider request failed");
  }

  if (!response.ok) {
    await logRouteAttempt({
      requestType: "routes",
      placeId: place.id,
      placeName: place.name,
      googlePlaceId: place.googlePlaceId ?? undefined,
      status: "failed",
      resultCode: "failed",
      durationMs: Date.now() - startedAt,
    });
    throw new RouteRuntimeError("provider_error", `Google Routes returned HTTP ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    await logRouteAttempt({
      requestType: "routes",
      placeId: place.id,
      placeName: place.name,
      googlePlaceId: place.googlePlaceId ?? undefined,
      status: "failed",
      resultCode: "failed",
      durationMs: Date.now() - startedAt,
    });
    throw new RouteRuntimeError("provider_error", "Google Routes returned invalid JSON");
  }

  const routes = payload && typeof payload === "object" && Array.isArray((payload as { routes?: unknown }).routes)
    ? (payload as { routes: Array<{ distanceMeters?: unknown; duration?: unknown }> }).routes
    : [];
  const first = routes[0];
  const distanceMeters = Number(first?.distanceMeters);
  const durationSeconds = parseGoogleDuration(first?.duration);

  if (!first || !Number.isFinite(distanceMeters) || distanceMeters < 0 || durationSeconds == null) {
    await logRouteAttempt({
      requestType: "routes",
      placeId: place.id,
      placeName: place.name,
      googlePlaceId: place.googlePlaceId ?? undefined,
      status: "failed",
      resultCode: "no_route",
      durationMs: Date.now() - startedAt,
    });
    throw new RouteRuntimeError("no_route", "No usable route was returned");
  }

  const result: RuntimeRouteResult = {
    mode,
    distanceMeters,
    durationSeconds,
    calculatedAt: new Date().toISOString(),
    provider: "google_routes",
  };
  routeCache.set(key, result);

  await logRouteAttempt({
    requestType: "routes",
    placeId: place.id,
    placeName: place.name,
    googlePlaceId: place.googlePlaceId ?? undefined,
    status: "success",
    resultCode: "route_loaded",
    durationMs: Date.now() - startedAt,
  });

  return result;
}

export function resetRuntimeRoutesForTests() {
  routeCache.clear();
}
