import type { Place } from "@/types/place";

export type ParkingMatch = {
  place: Place;
  distanceKm: number;
  walkingMinutes: number | null;
  score: number;
  reasons: string[];
};

const PARKING_CATEGORIES = new Set(["parking", "monthly_parking"]);
const EARTH_RADIUS_KM = 6371;

function validCoordinate(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isParkingPlace(place: Place) {
  return PARKING_CATEGORIES.has(place.category) || place.categories?.some((category) => PARKING_CATEGORIES.has(category));
}

function knownWalkingMinutes(place: Place) {
  const value = place.distance?.walkingMinutes ?? place.walkingMinutes;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function priceSignal(place: Place) {
  const details = place.parkingDetails;
  const known = [details?.hourlyPrice, details?.dailyPrice, details?.monthlyPrice]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  if (!known.length) return 0;
  const cheapest = Math.min(...known);
  if (details?.hourlyPrice != null) return cheapest <= 20 ? 6 : cheapest <= 50 ? 3 : 1;
  if (details?.dailyPrice != null) return cheapest <= 100 ? 5 : cheapest <= 200 ? 2 : 1;
  return cheapest <= 1500 ? 5 : cheapest <= 2500 ? 2 : 1;
}

function scoreParking(place: Place, distanceKm: number, walkingMinutes: number | null) {
  const details = place.parkingDetails;
  const reasons: string[] = [];
  let score = Math.max(0, 40 - distanceKm * 20);

  if (details?.availabilityStatus === "available") {
    score += 40;
    reasons.push("available");
  } else if (details?.availabilityStatus === "call_to_confirm") {
    score += 8;
    reasons.push("call_to_confirm");
  } else if (details?.availabilityStatus === "full") {
    score -= 100;
    reasons.push("full");
  }

  if (walkingMinutes != null) {
    score += Math.max(0, 12 - walkingMinutes * 0.5);
    reasons.push("verified_walk");
  }

  const priceBonus = priceSignal(place);
  if (priceBonus > 0) {
    score += priceBonus;
    reasons.push("price");
  }

  if (details?.access24Hours === true) {
    score += 8;
    reasons.push("24h");
  }
  if (details?.coveredParking === true) {
    score += 4;
    reasons.push("covered");
  }
  if (details?.cctv === true) {
    score += 4;
    reasons.push("cctv");
  }
  if (details?.securityGuard === true) {
    score += 4;
    reasons.push("security");
  }
  if (details?.overnightAllowed === true) {
    score += 2;
    reasons.push("overnight");
  }

  return { score, reasons };
}

export function rankNearbyParking(
  target: Place,
  places: Place[],
  options: { limit?: number } = {},
): ParkingMatch[] {
  if (!validCoordinate(target.latitude) || !validCoordinate(target.longitude)) return [];
  const limit = Math.max(0, Math.floor(options.limit ?? 3));

  return places
    .filter((place) => place.id !== target.id && isParkingPlace(place))
    .filter((place) => validCoordinate(place.latitude) && validCoordinate(place.longitude))
    .map((place) => {
      const distanceKm = haversineKm(target.latitude!, target.longitude!, place.latitude!, place.longitude!);
      const walkingMinutes = knownWalkingMinutes(place);
      const { score, reasons } = scoreParking(place, distanceKm, walkingMinutes);
      return { place, distanceKm, walkingMinutes, score, reasons } satisfies ParkingMatch;
    })
    .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm || a.place.name.localeCompare(b.place.name, "th"))
    .slice(0, limit);
}
