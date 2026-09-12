import { loadGoogleMaps } from "@/lib/google-maps";

export type GooglePhotoAuthorAttribution = {
  displayName: string | null;
  uri: string | null;
  photoUri: string | null;
};

export type GoogleTransientPhoto = {
  url: string;
  googleMapsUrl: string | null;
  flagContentUrl: string | null;
  authorAttributions: GooglePhotoAuthorAttribution[];
  width: number | null;
  height: number | null;
  fetchedAt: string;
};

function googlePhotoFailureText(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "Unknown Google photo error");
  if (/REQUEST_DENIED|ApiNotActivatedMapError|not authorized|has not been used|disabled|permission|referer|referrer/i.test(raw)) {
    return `${raw} — Enable Places API (New), then allow it in this browser key's API restrictions and allow the deployed site in Website/HTTP referrer restrictions.`;
  }
  return `${raw} — Verify Places API (New) is enabled and this browser key's API restrictions / Website referrer restrictions allow the deployed site.`;
}

/**
 * Pure mapper. The returned URI is display-only and must not be persisted.
 * Google photo URIs are intentionally excluded from Supabase/local storage.
 */
export function mapGooglePhoto(photo: any): GoogleTransientPhoto | null {
  if (!photo) return null;
  let url = "";
  try {
    url = photo.getURI?.({ maxWidth: 1200, maxHeight: 900 }) || "";
  } catch {
    return null;
  }
  if (!url) return null;
  const authorAttributions = Array.isArray(photo.authorAttributions)
    ? photo.authorAttributions.map((item: any) => ({
        displayName: typeof item?.displayName === "string" ? item.displayName : null,
        uri: typeof item?.uri === "string" ? item.uri : null,
        photoUri: typeof item?.photoURI === "string" ? item.photoURI : null,
      }))
    : [];
  return {
    url,
    googleMapsUrl: typeof photo.googleMapsURI === "string" ? photo.googleMapsURI : null,
    flagContentUrl: typeof photo.flagContentURI === "string" ? photo.flagContentURI : null,
    authorAttributions,
    width: typeof photo.widthPx === "number" ? photo.widthPx : null,
    height: typeof photo.heightPx === "number" ? photo.heightPx : null,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Explicit user-action only. No cache, no prefetch, no background refresh.
 * The caller must invoke this from a visible button/confirmation path.
 */
export async function fetchGoogleTransientPhoto(apiKey: string, googlePlaceId: string): Promise<GoogleTransientPhoto | null> {
  if (!apiKey) throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing");
  if (!googlePlaceId) return null;

  try {
    await loadGoogleMaps(apiKey, "manual_places_request");
    const maps = window.google?.maps;
    if (!maps) throw new Error("Google Maps is unavailable");
    const library: any = maps.importLibrary ? await maps.importLibrary("places") : maps.places;
    const PlaceCtor = library?.Place || maps.places?.Place;
    if (!PlaceCtor) throw new Error("Google Place Photos is unavailable");
    const place = new PlaceCtor({ id: googlePlaceId, requestedLanguage: "th", requestedRegion: "TH" });
    await place.fetchFields({ fields: ["photos"] });
    const photo = Array.isArray(place.photos) ? place.photos[0] : null;
    if (!photo) return null;
    const mapped = mapGooglePhoto(photo);
    if (!mapped) throw new Error("Google returned photo metadata without a usable display URI");
    return mapped;
  } catch (error) {
    throw new Error(`Google Place Photos failed: ${googlePhotoFailureText(error)}`);
  }
}
