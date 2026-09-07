import type { Place } from "@/types/place";

export type ProviderCapabilities = {
  canPersistPlaces: boolean;
  canPersistPhotos: boolean;
  canPersistRatings: boolean;
  canPersistHours: boolean;
  purpose: "database" | "maintenance" | "temporary_search" | "map_only";
};

/**
 * Conservative defaults. A provider must be explicitly approved before its
 * data is written into the permanent Around My Dorm dataset.
 */
export const PROVIDER_CAPABILITIES: Record<string, ProviderCapabilities> = {
  manual: { canPersistPlaces: true, canPersistPhotos: true, canPersistRatings: true, canPersistHours: true, purpose: "database" },
  seed: { canPersistPlaces: true, canPersistPhotos: true, canPersistRatings: true, canPersistHours: true, purpose: "database" },
  official: { canPersistPlaces: true, canPersistPhotos: true, canPersistRatings: false, canPersistHours: true, purpose: "maintenance" },
  approved_import: { canPersistPlaces: true, canPersistPhotos: false, canPersistRatings: false, canPersistHours: true, purpose: "maintenance" },
  mapbox_map: { canPersistPlaces: false, canPersistPhotos: false, canPersistRatings: false, canPersistHours: false, purpose: "map_only" },
  mapbox_search: { canPersistPlaces: false, canPersistPhotos: false, canPersistRatings: false, canPersistHours: false, purpose: "temporary_search" },
  google_places_runtime: { canPersistPlaces: false, canPersistPhotos: false, canPersistRatings: false, canPersistHours: false, purpose: "temporary_search" },
};

export type FreshnessState = "fresh" | "verified" | "aging" | "stale" | "unverified";

export function freshnessState(place: Place, now = Date.now()): FreshnessState {
  const raw = place.lastChecked || place.lastUpdated || place.lastVerified;
  if (!raw) return place.verified ? "aging" : "unverified";
  const time = new Date(raw).getTime();
  if (!Number.isFinite(time)) return place.verified ? "aging" : "unverified";
  const days = Math.max(0, Math.floor((now - time) / 86_400_000));
  if (days <= 14) return "fresh";
  if (days <= 30) return "verified";
  if (days <= 90) return "aging";
  return "stale";
}

export function recommendedRefreshDays(place: Place) {
  if (place.categories.includes("parking") || place.categories.includes("monthly_parking")) return 21;
  if (place.categories.some((category) => ["food", "local_food", "cafe", "bar", "night_food", "mookata", "hotpot", "bbq"].includes(category))) return 21;
  if (place.categories.some((category) => ["fitness", "laundry", "salon", "barber", "pharmacy", "clinic"].includes(category))) return 45;
  return 75;
}

export function shouldRefresh(place: Place, now = Date.now()) {
  const raw = place.lastChecked || place.lastUpdated || place.lastVerified;
  if (!raw) return true;
  const time = new Date(raw).getTime();
  if (!Number.isFinite(time)) return true;
  return now - time >= recommendedRefreshDays(place) * 86_400_000;
}
