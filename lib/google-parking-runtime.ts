import { getRuntimeLoadedPlaces } from "@/lib/database/runtime-places";
import { runGoogleTextSearchRequest } from "@/lib/google-request-manager";
import { candidateFromGoogle, type PlaceCandidate } from "@/lib/maintenance/place-candidates";
import type { Place } from "@/types/place";

export type TransientParkingSearchOptions = {
  apiKey?: string;
  language?: "th" | "en";
  radiusMeters?: number;
  maxResults?: number;
  places?: Place[];
};

function hasCoordinates(place: Place) {
  return (
    place.latitude != null &&
    place.longitude != null &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude)
  );
}

/**
 * Runs only after an explicit user action. Google results are converted into
 * review candidates and returned to the caller; this function never persists
 * or publishes them into the canonical place database.
 */
export async function searchTransientParking(
  target: Place,
  options: TransientParkingSearchOptions = {},
): Promise<PlaceCandidate[]> {
  if (!hasCoordinates(target)) {
    throw new Error("Target coordinates are required for parking search");
  }

  const apiKey = options.apiKey ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  if (!apiKey) throw new Error("Google Maps API key is not configured");

  const language = options.language ?? "th";
  const places = options.places ?? getRuntimeLoadedPlaces();
  const result = await runGoogleTextSearchRequest({
    apiKey,
    query: language === "en" ? "parking" : "ที่จอดรถ",
    center: { lat: target.latitude as number, lng: target.longitude as number },
    radiusMeters: options.radiusMeters ?? 1000,
    language,
    maxResults: options.maxResults ?? 8,
  });

  return result.candidates.map((candidate) => candidateFromGoogle(candidate, places, "parking"));
}
