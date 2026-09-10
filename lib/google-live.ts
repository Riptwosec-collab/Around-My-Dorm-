import { loadGoogleMaps } from "@/lib/google-maps";
import { readGoogleMemoryCache, writeGoogleMemoryCache } from "@/lib/google-memory-cache";

export type GoogleLiveDetails = {
  googlePlaceId: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewCount: number | null;
  openNow: boolean | null;
  openingHoursText: string[];
  phone: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  photoUrl: string | null;
  priceLevel: string | null;
  businessStatus: string | null;
  fetchedAt: string;
};

export type GoogleDiscoveryCandidate = {
  googlePlaceId: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  primaryType: string | null;
  primaryTypeLabel: string | null;
  rating: number | null;
  reviewCount: number | null;
  openNow: boolean | null;
  googleMapsUrl: string | null;
  fetchedAt: string;
};

function readCache<T>(key: string): T | null { return readGoogleMemoryCache<T>(key); }
function writeCache<T>(key: string, value: T, ttlMs: number) { writeGoogleMemoryCache(key, value, ttlMs); }

function literalLocation(location: any) {
  if (!location) return { latitude: null, longitude: null };
  const latitude = typeof location.lat === "function" ? location.lat() : location.lat;
  const longitude = typeof location.lng === "function" ? location.lng() : location.lng;
  return {
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

async function placesLibrary(apiKey: string) {
  await loadGoogleMaps(apiKey, "manual_places_request");
  const google = window.google;
  if (!google?.maps) throw new Error("Google Maps is unavailable");
  if (google.maps.importLibrary) return google.maps.importLibrary("places");
  if (google.maps.places) return google.maps.places;
  throw new Error("Google Places library is unavailable");
}

/**
 * Explicit, short-lived live enrichment. Nothing here writes into the Around My
 * Dorm permanent place database. Call only after a user/admin action.
 */
export async function fetchGoogleLiveDetails(apiKey: string, googlePlaceId: string, ttlMs = 20 * 60_000): Promise<GoogleLiveDetails> {
  const cacheKey = `detail:${googlePlaceId}`;
  const cached = readCache<GoogleLiveDetails>(cacheKey);
  if (cached) return cached;

  const library: any = await placesLibrary(apiKey);
  const PlaceCtor = library.Place || window.google?.maps?.places?.Place;
  if (!PlaceCtor) throw new Error("Google Place Details is unavailable");

  const place = new PlaceCtor({ id: googlePlaceId });
  await place.fetchFields({
    fields: [
      "id",
      "displayName",
      "formattedAddress",
      "location",
      "rating",
      "userRatingCount",
      "currentOpeningHours",
      "nationalPhoneNumber",
      "websiteURI",
      "googleMapsURI",
      "photos",
      "priceLevel",
      "businessStatus",
    ],
  });

  const location = literalLocation(place.location);
  let photoUrl: string | null = null;
  try {
    const photo = Array.isArray(place.photos) ? place.photos[0] : null;
    photoUrl = photo?.getURI?.({ maxWidth: 1200, maxHeight: 900 }) || null;
  } catch {}

  const value: GoogleLiveDetails = {
    googlePlaceId: place.id || googlePlaceId,
    name: place.displayName || null,
    address: place.formattedAddress || null,
    ...location,
    rating: typeof place.rating === "number" ? place.rating : null,
    reviewCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    openNow: typeof place.currentOpeningHours?.openNow === "boolean" ? place.currentOpeningHours.openNow : null,
    openingHoursText: Array.isArray(place.currentOpeningHours?.weekdayDescriptions) ? place.currentOpeningHours.weekdayDescriptions.map(String) : [],
    phone: place.nationalPhoneNumber || null,
    website: place.websiteURI || null,
    googleMapsUrl: place.googleMapsURI || null,
    photoUrl,
    priceLevel: place.priceLevel != null ? String(place.priceLevel) : null,
    businessStatus: place.businessStatus != null ? String(place.businessStatus) : null,
    fetchedAt: new Date().toISOString(),
  };
  writeCache(cacheKey, value, ttlMs);
  return value;
}

/**
 * Explicit discovery only. Results are temporary candidates and must not be
 * silently inserted into the permanent Around My Dorm database.
 */
export async function discoverGooglePlaces(
  apiKey: string,
  input: { query: string; center: { lat: number; lng: number }; radiusMeters: number; language?: "th" | "en"; maxResults?: number },
  ttlMs = 10 * 60_000,
): Promise<GoogleDiscoveryCandidate[]> {
  const normalized = input.query.trim();
  if (!normalized) return [];
  const cacheKey = `search:${normalized.toLowerCase()}:${input.center.lat.toFixed(4)}:${input.center.lng.toFixed(4)}:${input.radiusMeters}:${input.language || "th"}`;
  const cached = readCache<GoogleDiscoveryCandidate[]>(cacheKey);
  if (cached) return cached;

  const library: any = await placesLibrary(apiKey);
  const PlaceCtor = library.Place || window.google?.maps?.places?.Place;
  if (!PlaceCtor?.searchByText) throw new Error("Google Places text search is unavailable");

  const response = await PlaceCtor.searchByText({
    textQuery: normalized,
    fields: [
      "id",
      "displayName",
      "formattedAddress",
      "location",
      "primaryType",
      "primaryTypeDisplayName",
      "rating",
      "userRatingCount",
      "currentOpeningHours",
      "googleMapsURI",
    ],
    locationBias: { center: input.center, radius: Math.max(100, Math.min(50000, input.radiusMeters)) },
    language: input.language || "th",
    region: "TH",
    maxResultCount: Math.max(1, Math.min(20, input.maxResults || 12)),
  });

  const candidates: GoogleDiscoveryCandidate[] = (response?.places || []).map((place: any) => {
    const location = literalLocation(place.location);
    return {
      googlePlaceId: place.id || "",
      name: place.displayName || "Google place",
      address: place.formattedAddress || null,
      ...location,
      primaryType: place.primaryType || null,
      primaryTypeLabel: place.primaryTypeDisplayName || null,
      rating: typeof place.rating === "number" ? place.rating : null,
      reviewCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
      openNow: typeof place.currentOpeningHours?.openNow === "boolean" ? place.currentOpeningHours.openNow : null,
      googleMapsUrl: place.googleMapsURI || null,
      fetchedAt: new Date().toISOString(),
    };
  }).filter((candidate: GoogleDiscoveryCandidate) => Boolean(candidate.googlePlaceId));

  writeCache(cacheKey, candidates, ttlMs);
  return candidates;
}
