import { recordTrackedGoogleRequest } from "@/lib/google-api-budget";
import {
  loadGooglePhotoCloudMetadata,
  type GooglePhotoRestoreTarget,
} from "@/lib/google-photo-cloud-metadata";
import { getPlaceImageCandidates } from "@/lib/place-images";
import { fetchGoogleTransientPhoto, type GoogleTransientPhoto } from "@/lib/google-transient-photo";
import type { Place } from "@/types/place";

export const GOOGLE_PHOTO_RUNTIME_CHANGED_EVENT = "amd:google-photo-runtime-changed";
export const GOOGLE_PHOTO_AUTO_RESTORE_LIMIT = 20;

type RuntimePhotoRecord = {
  placeId: string;
  googlePlaceId: string;
  photo: GoogleTransientPhoto;
};

export type GooglePhotoAutoRestoreResult = "restored" | "no_photo" | "failed" | "skipped";

const runtimePhotos = new Map<string, RuntimePhotoRecord>();
const autoRestoreClaims = new Set<string>();
const autoRestoreInFlight = new Set<string>();
let restoreTargetsPromise: Promise<Map<string, GooglePhotoRestoreTarget>> | null = null;
let autoRestoreQueue: Promise<void> = Promise.resolve();

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
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(GOOGLE_PHOTO_RUNTIME_CHANGED_EVENT, { detail: { placeId, googlePlaceId } }));
  }
}

export function clearGoogleRuntimePhotos(): void {
  if (!runtimePhotos.size) return;
  runtimePhotos.clear();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(GOOGLE_PHOTO_RUNTIME_CHANGED_EVENT, { detail: { placeId: null, googlePlaceId: null } }));
  }
}

export function claimGooglePhotoAutoRestoreSlot(placeId: string): boolean {
  if (!placeId || autoRestoreClaims.has(placeId)) return false;
  if (autoRestoreClaims.size >= GOOGLE_PHOTO_AUTO_RESTORE_LIMIT) return false;
  autoRestoreClaims.add(placeId);
  return true;
}

export function isGooglePhotoAutoRestoreInFlight(placeId: string): boolean {
  return autoRestoreInFlight.has(placeId);
}

export function getGooglePhotoAutoRestoreCount(): number {
  return autoRestoreClaims.size;
}

export function resetGooglePhotoAutoRestoreSession(): void {
  autoRestoreClaims.clear();
  autoRestoreInFlight.clear();
  restoreTargetsPromise = null;
  autoRestoreQueue = Promise.resolve();
}

async function restoreTargetsByPlace() {
  if (!restoreTargetsPromise) {
    restoreTargetsPromise = loadGooglePhotoCloudMetadata()
      .then((summary) => new Map(summary.restoreTargets.map((target) => [target.placeId, target])))
      .catch(() => new Map<string, GooglePhotoRestoreTarget>());
  }
  return restoreTargetsPromise;
}

function hasPersistedPhoto(place: Place) {
  return getPlaceImageCandidates(place).length > 0;
}

function queueAutoRestore<T>(task: () => Promise<T>): Promise<T> {
  const run = autoRestoreQueue.catch(() => undefined).then(task);
  autoRestoreQueue = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Restore a previously successful Google photo only after its rendered card becomes visible.
 * The photo remains runtime-only. Supabase stores only request/result metadata and Google Place ID.
 */
export async function requestVisibleGooglePhotoRestore(
  place: Place,
  apiKey: string,
): Promise<GooglePhotoAutoRestoreResult> {
  if (!apiKey || !place?.id || hasGoogleRuntimePhoto(place.id) || hasPersistedPhoto(place)) return "skipped";

  const targets = await restoreTargetsByPlace();
  const savedTarget = targets.get(place.id);
  if (!savedTarget) return "skipped";

  const target: GooglePhotoRestoreTarget = {
    placeId: place.id,
    googlePlaceId: place.googlePlaceId || place.googleMaps?.placeId || savedTarget.googlePlaceId,
  };
  if (!target.googlePlaceId || !claimGooglePhotoAutoRestoreSlot(place.id)) return "skipped";

  autoRestoreInFlight.add(place.id);
  return queueAutoRestore(async () => {
    try {
      if (hasGoogleRuntimePhoto(place.id) || hasPersistedPhoto(place)) return "skipped";

      const startedAt = Date.now();
      let requestStatus: "success" | "failed" = "success";
      let resultCode: "photo_loaded" | "no_photo" | "failed" = "no_photo";
      let outcome: GooglePhotoAutoRestoreResult = "no_photo";

      try {
        const photo = await fetchGoogleTransientPhoto(apiKey, target.googlePlaceId, "visible_photo_restore");
        if (photo) {
          setGoogleRuntimePhoto(place.id, target.googlePlaceId, photo);
          resultCode = "photo_loaded";
          outcome = "restored";
        }
      } catch {
        requestStatus = "failed";
        resultCode = "failed";
        outcome = "failed";
      }

      try {
        await recordTrackedGoogleRequest({
          requestType: "place_photo",
          placeId: place.id,
          placeName: place.name,
          googlePlaceId: target.googlePlaceId,
          status: requestStatus,
          resultCode,
          attempted: 1,
          retryCount: 0,
          durationMs: Math.max(0, Date.now() - startedAt),
        });
      } catch {
        // Photo display is allowed to succeed even if usage metadata logging is temporarily unavailable.
      }

      return outcome;
    } finally {
      autoRestoreInFlight.delete(place.id);
    }
  });
}
