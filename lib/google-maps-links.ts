import type { Place } from "@/types/place";

function searchUrl(query: string, placeId?: string | null) {
  const params = new URLSearchParams({ api: "1", query });
  if (placeId) params.set("query_place_id", placeId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

/**
 * Returns the strongest known Google Maps destination without making a network
 * request. Existing Google URLs win, then Place ID, coordinates, then text.
 */
export function googleMapsPlaceUrl(place: Place): string {
  const existing = place.googleMaps?.url || place.googleMapsUrl;
  if (existing) return existing;

  const placeId = place.googlePlaceId || place.googleMaps?.placeId || null;
  const coordinateQuery = place.latitude != null && place.longitude != null
    ? `${place.latitude},${place.longitude}`
    : null;
  const textQuery = [place.name, place.address || place.area].filter(Boolean).join(" ").trim();
  const query = coordinateQuery || textQuery || place.name || place.id;
  return searchUrl(query, placeId);
}

export function googleMapsDirectionsFallbackUrl(place: Place): string {
  const placeId = place.googlePlaceId || place.googleMaps?.placeId || null;
  const destination = place.latitude != null && place.longitude != null
    ? `${place.latitude},${place.longitude}`
    : [place.name, place.address || place.area].filter(Boolean).join(" ");
  const params = new URLSearchParams({ api: "1", destination });
  if (placeId) params.set("destination_place_id", placeId);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
