import type { Place } from "@/types/place";

export type ProviderCapabilities = {
  canPersistPlaces: boolean;
  canPersistPlaceIds: boolean;
  canPersistPhotos: boolean;
  canPersistRatings: boolean;
  canPersistHours: boolean;
  purpose: "database" | "maintenance" | "temporary_search" | "map_only";
};

/**
 * Conservative defaults. A provider must be explicitly approved before its
 * data is written into the permanent Around My Dorm dataset.
 *
 * Google Maps is the renderer. Google Places live data is treated as temporary
 * enrichment/discovery data; only a stable Google Place ID is eligible for
 * long-lived linkage here. Provider terms remain the final authority.
 */
export const PROVIDER_CAPABILITIES: Record<string, ProviderCapabilities> = {
  manual: { canPersistPlaces: true, canPersistPlaceIds: true, canPersistPhotos: true, canPersistRatings: true, canPersistHours: true, purpose: "database" },
  seed: { canPersistPlaces: true, canPersistPlaceIds: true, canPersistPhotos: true, canPersistRatings: true, canPersistHours: true, purpose: "database" },
  official: { canPersistPlaces: true, canPersistPlaceIds: true, canPersistPhotos: true, canPersistRatings: false, canPersistHours: true, purpose: "maintenance" },
  approved_import: { canPersistPlaces: true, canPersistPlaceIds: true, canPersistPhotos: false, canPersistRatings: false, canPersistHours: true, purpose: "maintenance" },
  google_maps: { canPersistPlaces: false, canPersistPlaceIds: true, canPersistPhotos: false, canPersistRatings: false, canPersistHours: false, purpose: "map_only" },
  google_places_live: { canPersistPlaces: false, canPersistPlaceIds: true, canPersistPhotos: false, canPersistRatings: false, canPersistHours: false, purpose: "temporary_search" },
  google_places_admin: { canPersistPlaces: false, canPersistPlaceIds: true, canPersistPhotos: false, canPersistRatings: false, canPersistHours: false, purpose: "maintenance" },
};

export type FreshnessState = "fresh" | "aging" | "stale_soon" | "stale" | "unverified";

export function freshnessState(place: Place, now = Date.now()): FreshnessState {
  if (!place.verified) return "unverified";
  const raw = place.lastChecked || place.lastUpdated || place.lastVerified;
  if (!raw) return "aging";
  const time = new Date(raw).getTime();
  if (!Number.isFinite(time)) return "aging";
  const days = Math.max(0, Math.floor((now - time) / 86_400_000));
  if (days <= 30) return "fresh";
  if (days <= 60) return "aging";
  if (days <= 90) return "stale_soon";
  return "stale";
}

/**
 * Default refresh recommendations intentionally fit the 1–3 month operating
 * model. Admin review can still choose a narrower or broader scope manually.
 */
export function recommendedRefreshDays(place: Place) {
  if (place.categories.includes("parking") || place.categories.includes("monthly_parking")) return 45;
  if (place.categories.some((category) => ["food", "local_food", "noodle", "thai_food", "isan_food", "japanese", "korean_food", "vietnamese_food", "cafe", "bar", "night_food", "mookata", "hotpot", "bbq", "chinese_food"].includes(category))) return 45;
  if (place.categories.some((category) => ["fitness", "laundry", "salon", "barber", "pharmacy", "clinic", "convenience", "supermarket"].includes(category))) return 75;
  return 90;
}

export function shouldRefresh(place: Place, now = Date.now()) {
  const raw = place.lastChecked || place.lastUpdated || place.lastVerified;
  if (!raw) return true;
  const time = new Date(raw).getTime();
  if (!Number.isFinite(time)) return true;
  return now - time >= recommendedRefreshDays(place) * 86_400_000;
}
