import type { GoogleTransientPhoto } from "@/lib/google-transient-photo";

export const GOOGLE_PHOTO_RUNTIME_CHANGED_EVENT = "amd:google-photo-runtime-changed";

type RuntimePhotoRecord = {
  placeId: string;
  googlePlaceId: string;
  photo: GoogleTransientPhoto;
};

const runtimePhotos = new Map<string, RuntimePhotoRecord>();

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
