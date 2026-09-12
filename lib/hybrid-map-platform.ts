import { haversineKm } from "@/lib/place-utils";
import type { Place } from "@/types/place";

export type GeoPoint = { lat: number; lng: number };

export function hasPlaceCoordinates(place: Place): boolean {
  return Number.isFinite(place.latitude) && Number.isFinite(place.longitude);
}

export function filterPlacesInSearchArea(places: Place[], center: GeoPoint, radiusMeters: number): Place[] {
  const safeRadius = Math.max(0, radiusMeters);
  return places.filter((place) => {
    if (place.latitude == null || place.longitude == null) return false;
    return haversineKm(center, { lat: place.latitude, lng: place.longitude }) * 1000 <= safeRadius;
  });
}

export type PlatformDiagnostics = {
  total: number;
  matched: number;
  coordinates: number;
  markers: number;
  missingCoordinates: number;
  duplicateGooglePlaceIds: string[];
  duplicatePlaceRows: number;
  routePlaces: number;
  routeModes: number;
};

export function buildPlatformDiagnostics(places: Place[]): PlatformDiagnostics {
  const idCounts = new Map<string, number>();
  let matched = 0;
  let coordinates = 0;
  let routePlaces = 0;
  let routeModes = 0;

  for (const place of places) {
    if (place.googlePlaceId) {
      matched += 1;
      idCounts.set(place.googlePlaceId, (idCounts.get(place.googlePlaceId) || 0) + 1);
    }
    if (hasPlaceCoordinates(place)) coordinates += 1;

    const modes = [
      place.distance?.walkingMinutes ?? place.walkingMinutes,
      place.distance?.motorcycleMinutes,
      place.distance?.drivingMinutes ?? place.drivingMinutes,
    ].filter((value) => typeof value === "number" && Number.isFinite(value)).length;
    if (modes > 0) routePlaces += 1;
    routeModes += modes;
  }

  const duplicateGooglePlaceIds = Array.from(idCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort();

  return {
    total: places.length,
    matched,
    coordinates,
    markers: coordinates,
    missingCoordinates: Math.max(0, places.length - coordinates),
    duplicateGooglePlaceIds,
    duplicatePlaceRows: duplicateGooglePlaceIds.reduce((sum, id) => sum + (idCounts.get(id) || 0), 0),
    routePlaces,
    routeModes,
  };
}
