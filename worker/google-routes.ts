export type RouteMode = "WALK" | "DRIVE" | "TWO_WHEELER";

export type WorkerEnv = {
  GOOGLE_MAPS_SERVER_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
};

export type RouteMatrixInput = {
  origin: { latitude: number; longitude: number };
  destinations: Array<{ id: string; latitude: number; longitude: number }>;
  mode: RouteMode;
};

export type RouteMatrixResult = {
  placeId: string;
  mode: RouteMode;
  distanceMeters: number | null;
  durationSeconds: number | null;
  condition: string | null;
  statusCode: number | null;
  statusMessage: string | null;
};

function validCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function parseDurationSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  return match ? Math.round(Number(match[1])) : null;
}

function safeGoogleError(status: number) {
  if (status === 429) return "Google Routes quota/rate limit reached";
  if (status === 401 || status === 403) return "Google Routes request was denied; verify the server key and Routes API restrictions";
  if (status >= 500) return "Google Routes is temporarily unavailable";
  return `Google Routes request failed (${status})`;
}

export async function computeRouteMatrix(
  env: WorkerEnv,
  input: RouteMatrixInput,
  fetchFn: typeof fetch = fetch,
): Promise<RouteMatrixResult[]> {
  if (!env.GOOGLE_MAPS_SERVER_API_KEY) throw new Error("GOOGLE_MAPS_SERVER_API_KEY is not configured");
  if (!validCoordinate(input.origin.latitude, input.origin.longitude)) throw new Error("Invalid verified HOME coordinates");
  if (!input.destinations.length) return [];
  if (input.destinations.length > 25) throw new Error("Route batch exceeds 25 destinations");
  if (!input.destinations.every((item) => item.id && validCoordinate(item.latitude, item.longitude))) throw new Error("Route batch contains invalid destination coordinates");

  const response = await fetchFn("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_MAPS_SERVER_API_KEY,
      "X-Goog-FieldMask": "originIndex,destinationIndex,status,condition,distanceMeters,duration",
    },
    body: JSON.stringify({
      origins: [{
        waypoint: { location: { latLng: { latitude: input.origin.latitude, longitude: input.origin.longitude } } },
      }],
      destinations: input.destinations.map((item) => ({
        waypoint: { location: { latLng: { latitude: item.latitude, longitude: item.longitude } } },
      })),
      travelMode: input.mode,
      ...(input.mode === "DRIVE" || input.mode === "TWO_WHEELER" ? { routingPreference: "TRAFFIC_UNAWARE" } : {}),
      languageCode: "th",
      regionCode: "TH",
      units: "METRIC",
    }),
  });

  if (!response.ok) throw new Error(safeGoogleError(response.status));
  const raw = await response.json() as any;
  const elements: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.routeMatrixElements) ? raw.routeMatrixElements : [];
  const byDestination = new Map<number, any>();
  for (const element of elements) {
    if (typeof element?.destinationIndex === "number") byDestination.set(element.destinationIndex, element);
  }

  return input.destinations.map((destination, index) => {
    const element = byDestination.get(index);
    const statusCode = typeof element?.status?.code === "number" ? element.status.code : null;
    return {
      placeId: destination.id,
      mode: input.mode,
      distanceMeters: typeof element?.distanceMeters === "number" ? element.distanceMeters : null,
      durationSeconds: parseDurationSeconds(element?.duration),
      condition: typeof element?.condition === "string" ? element.condition : null,
      statusCode,
      statusMessage: typeof element?.status?.message === "string" ? element.status.message : null,
    };
  });
}
