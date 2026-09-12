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

function mapsSearchUrl(query: string, placeId?: string | null) {
  const params = new URLSearchParams({ api: "1", query });
  if (placeId) params.set("query_place_id", placeId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function googleErrorText(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "Unknown Google Maps error");
  if (/REQUEST_DENIED|ApiNotActivatedMapError|not authorized|has not been used|disabled|permission/i.test(raw)) {
    return `${raw} — Enable Places API (New) for full shop data. Enable Geocoding API for the coordinate fallback, and allow both APIs in this key's API restrictions.`;
  }
  return raw;
}

async function mapsLibrary(apiKey: string) {
  await loadGoogleMaps(apiKey, "manual_places_request");
  const google = window.google;
  if (!google?.maps) throw new Error("Google Maps is unavailable");
  return google.maps;
}

async function placesLibrary(apiKey: string) {
  const maps = await mapsLibrary(apiKey);
  if (maps.importLibrary) return maps.importLibrary("places");
  if (maps.places) return maps.places;
  throw new Error("Google Places library is unavailable");
}

async function geocoder(apiKey: string) {
  const maps = await mapsLibrary(apiKey);
  if (maps.importLibrary) {
    try {
      const library: any = await maps.importLibrary("geocoding");
      const GeocoderCtor = library?.Geocoder || maps.Geocoder;
      if (GeocoderCtor) return new GeocoderCtor();
    } catch {}
  }
  if (maps.Geocoder) return new maps.Geocoder();
  throw new Error("Google Geocoding service is unavailable");
}

async function discoverGoogleGeocode(apiKey: string, query: string): Promise<GoogleDiscoveryCandidate[]> {
  const service = await geocoder(apiKey);
  const response = await service.geocode({ address: query, region: "TH", language: "th" });
  const results = response?.results || [];
  return results.slice(0, 8).map((result: any) => {
    const location = literalLocation(result.geometry?.location);
    const placeId = result.place_id || "";
    return {
      googlePlaceId: placeId,
      // Keep the original shop query as the candidate name so matching still
      // recognises the local business name while the formatted address remains
      // available separately for area validation.
      name: query,
      address: result.formatted_address || null,
      ...location,
      primaryType: "geocode_fallback",
      primaryTypeLabel: "Google geocoded location",
      rating: null,
      reviewCount: null,
      openNow: null,
      googleMapsUrl: placeId ? mapsSearchUrl(query, placeId) : mapsSearchUrl(query),
      fetchedAt: new Date().toISOString(),
    } satisfies GoogleDiscoveryCandidate;
  }).filter((candidate: GoogleDiscoveryCandidate) => Boolean(candidate.googlePlaceId));
}

async function geocodePlaceId(apiKey: string, googlePlaceId: string): Promise<GoogleLiveDetails | null> {
  const service = await geocoder(apiKey);
  const response = await service.geocode({ placeId: googlePlaceId, region: "TH", language: "th" });
  const result = response?.results?.[0];
  if (!result) return null;
  const location = literalLocation(result.geometry?.location);
  return {
    googlePlaceId,
    name: null,
    address: result.formatted_address || null,
    ...location,
    rating: null,
    reviewCount: null,
    openNow: null,
    openingHoursText: [],
    phone: null,
    website: null,
    googleMapsUrl: mapsSearchUrl(result.formatted_address || googlePlaceId, googlePlaceId),
    photoUrl: null,
    priceLevel: null,
    businessStatus: null,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Explicit, short-lived live enrichment. Nothing here writes into the Around My
 * Dorm permanent place database. Call only after a user/admin action.
 *
 * Full Places fields are preferred. If Places API (New) is unavailable but the
 * Geocoding API is enabled, we still return verified Google coordinates/address
 * so every shop can be placed on the map instead of disappearing entirely.
 */
export async function fetchGoogleLiveDetails(apiKey: string, googlePlaceId: string, ttlMs = 20 * 60_000): Promise<GoogleLiveDetails> {
  const cacheKey = `detail:${googlePlaceId}`;
  const cached = readCache<GoogleLiveDetails>(cacheKey);
  if (cached) return cached;

  let placesError: unknown = null;
  try {
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
      name: typeof place.displayName === "string" ? place.displayName : place.displayName?.text || null,
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
  } catch (error) {
    placesError = error;
  }

  try {
    const fallback = await geocodePlaceId(apiKey, googlePlaceId);
    if (fallback) {
      writeCache(cacheKey, fallback, ttlMs);
      return fallback;
    }
  } catch (geocodeError) {
    throw new Error(`Google Place Details failed: ${googleErrorText(placesError)} | Geocoding fallback failed: ${googleErrorText(geocodeError)}`);
  }

  throw new Error(`Google Place Details failed: ${googleErrorText(placesError)}`);
}

/**
 * Explicit discovery only. Results are temporary candidates and must not be
 * silently inserted into the permanent Around My Dorm database.
 *
 * Places Text Search is preferred. If it is unavailable, fall back to Google
 * Geocoding so the app can still obtain a Place ID + coordinates for map pins.
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

  let placesError: unknown = null;
  try {
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
      const displayName = typeof place.displayName === "string" ? place.displayName : place.displayName?.text;
      return {
        googlePlaceId: place.id || "",
        name: displayName || "Google place",
        address: place.formattedAddress || null,
        ...location,
        primaryType: place.primaryType || null,
        primaryTypeLabel: typeof place.primaryTypeDisplayName === "string" ? place.primaryTypeDisplayName : place.primaryTypeDisplayName?.text || null,
        rating: typeof place.rating === "number" ? place.rating : null,
        reviewCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
        openNow: typeof place.currentOpeningHours?.openNow === "boolean" ? place.currentOpeningHours.openNow : null,
        googleMapsUrl: place.googleMapsURI || null,
        fetchedAt: new Date().toISOString(),
      };
    }).filter((candidate: GoogleDiscoveryCandidate) => Boolean(candidate.googlePlaceId));

    if (candidates.length) {
      writeCache(cacheKey, candidates, ttlMs);
      return candidates;
    }
  } catch (error) {
    placesError = error;
  }

  try {
    const candidates = await discoverGoogleGeocode(apiKey, normalized);
    if (candidates.length) {
      writeCache(cacheKey, candidates, ttlMs);
      return candidates;
    }
  } catch (geocodeError) {
    throw new Error(`Google Places search failed: ${googleErrorText(placesError)} | Geocoding fallback failed: ${googleErrorText(geocodeError)}`);
  }

  if (placesError) throw new Error(`Google Places search failed: ${googleErrorText(placesError)}`);
  return [];
}
