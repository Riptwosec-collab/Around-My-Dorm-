import { recordTrackedGoogleRequest } from "@/lib/google-api-budget";
import { getPlaceImageCandidates } from "@/lib/place-images";
import { fetchGoogleTransientPhoto, type GoogleTransientPhoto } from "@/lib/google-transient-photo";
import type { Place } from "@/types/place";

export const GOOGLE_PHOTO_RUNTIME_CHANGED_EVENT = "amd:google-photo-runtime-changed";
export const GOOGLE_PHOTO_VISIBLE_CARDS_CHANGED_EVENT = "amd:google-photo-visible-cards-changed";
export const GOOGLE_PHOTO_VISIBLE_LOAD_LIMIT = 20;

type RuntimePhotoRecord = {
  placeId: string;
  googlePlaceId: string;
  photo: GoogleTransientPhoto;
};

export type VisibleGooglePhotoLoadSummary = {
  attempted: number;
  loaded: number;
  noPhoto: number;
  failed: number;
};

const runtimePhotos = new Map<string, RuntimePhotoRecord>();
const visibleGooglePhotoCards = new Map<string, Place>();

function dispatchRuntimeChanged(placeId: string | null, googlePlaceId: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GOOGLE_PHOTO_RUNTIME_CHANGED_EVENT, { detail: { placeId, googlePlaceId } }));
}

function dispatchVisibleCardsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GOOGLE_PHOTO_VISIBLE_CARDS_CHANGED_EVENT));
}

function googlePlaceIdFor(place: Place): string | null {
  return place.googlePlaceId || place.googleMaps?.placeId || null;
}

function hasPersistedPhoto(place: Place): boolean {
  return getPlaceImageCandidates(place).length > 0;
}

function isVisibleGooglePhotoLoadTarget(place: Place): boolean {
  return Boolean(
    place?.id
    && googlePlaceIdFor(place)
    && !hasGoogleRuntimePhoto(place.id)
    && !hasPersistedPhoto(place),
  );
}

export function getGoogleRuntimePhoto(placeId: string): GoogleTransientPhoto | null {
  return runtimePhotos.get(placeId)?.photo ?? null;
}

export function hasGoogleRuntimePhoto(placeId: string): boolean {
  return runtimePhotos.has(placeId);
}

export function getGoogleRuntimePhotoCount(): number {
  return runtimePhotos.size;
}

export function setGoogleRuntimePhoto(placeId: string, googlePlaceId: string, photo: GoogleTransientPhoto): void {
  if (!placeId || !googlePlaceId || !photo?.url) return;
  runtimePhotos.set(placeId, { placeId, googlePlaceId, photo });
  dispatchRuntimeChanged(placeId, googlePlaceId);
}

export function clearGoogleRuntimePhotos(): void {
  if (!runtimePhotos.size) return;
  runtimePhotos.clear();
  dispatchRuntimeChanged(null, null);
}

/**
 * Compatibility for the admin panel's legacy restore filter. Automatic restore
 * no longer exists, so there can never be an automatic restore in flight.
 */
export function isGooglePhotoAutoRestoreInFlight(_placeId: string): boolean {
  return false;
}

/**
 * Visibility tracking only. This function never calls Google.
 * PlacePhoto updates it from IntersectionObserver; Google requests happen only
 * when loadVisibleGooglePhotos() is called by the explicit user button.
 */
export function setGooglePhotoCardVisible(place: Place, visible: boolean): void {
  if (!place?.id) return;
  const wasVisible = visibleGooglePhotoCards.has(place.id);
  if (visible) {
    visibleGooglePhotoCards.set(place.id, place);
  } else {
    visibleGooglePhotoCards.delete(place.id);
  }
  if (wasVisible !== visible) dispatchVisibleCardsChanged();
}

export function getVisibleGooglePhotoPlaces(): Place[] {
  return Array.from(visibleGooglePhotoCards.values());
}

export function resetVisibleGooglePhotoCards(): void {
  if (!visibleGooglePhotoCards.size) return;
  visibleGooglePhotoCards.clear();
  dispatchVisibleCardsChanged();
}

export function getVisibleGooglePhotoLoadTargetCount(): number {
  return getVisibleGooglePhotoPlaces().filter(isVisibleGooglePhotoLoadTarget).length;
}

/**
 * Explicit user action only. Snapshot the cards currently visible at click time,
 * then request Google photos only for eligible cards in that snapshot.
 * Google photo content remains runtime-only and is never persisted.
 */
export async function loadVisibleGooglePhotos(apiKey: string): Promise<VisibleGooglePhotoLoadSummary> {
  if (!apiKey) throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing");

  const targets = getVisibleGooglePhotoPlaces()
    .filter(isVisibleGooglePhotoLoadTarget)
    .slice(0, GOOGLE_PHOTO_VISIBLE_LOAD_LIMIT);

  const summary: VisibleGooglePhotoLoadSummary = {
    attempted: targets.length,
    loaded: 0,
    noPhoto: 0,
    failed: 0,
  };

  for (const place of targets) {
    const googlePlaceId = googlePlaceIdFor(place);
    if (!googlePlaceId) continue;
    const startedAt = Date.now();
    let status: "success" | "failed" = "success";
    let resultCode: "photo_loaded" | "no_photo" | "failed" = "no_photo";

    try {
      const photo = await fetchGoogleTransientPhoto(apiKey, googlePlaceId, "manual_places_request");
      if (photo) {
        setGoogleRuntimePhoto(place.id, googlePlaceId, photo);
        resultCode = "photo_loaded";
        summary.loaded += 1;
      } else {
        summary.noPhoto += 1;
      }
    } catch {
      status = "failed";
      resultCode = "failed";
      summary.failed += 1;
    }

    try {
      await recordTrackedGoogleRequest({
        requestType: "place_photo",
        placeId: place.id,
        placeName: place.name,
        googlePlaceId,
        status,
        resultCode,
        attempted: 1,
        retryCount: 0,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
    } catch {
      // Display can succeed even if usage metadata logging is temporarily unavailable.
    }
  }

  dispatchVisibleCardsChanged();
  return summary;
}
