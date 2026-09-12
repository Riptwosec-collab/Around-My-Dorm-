import { haversineKm, normalizeText } from "@/lib/place-utils";
import type { CategoryId, Place } from "@/types/place";
import type { GoogleDiscoveryCandidate } from "@/lib/google-live";

export type PlaceIdIntegrityStatus = "linked" | "missing" | "needs_review" | "possible_wrong_match";
export type PlaceIdAuditSeverity = "review" | "high";
export type MatchFactorKey = "name" | "coordinates" | "address" | "category" | "phone" | "website";

export type PlaceIdAuditIssue = {
  id: string;
  placeIds: string[];
  googlePlaceId?: string;
  kind: "duplicate_google_place_id" | "missing_coordinates" | "google_maps_identity_conflict" | "distant_link" | "chain_conflict";
  severity: PlaceIdAuditSeverity;
  message: string;
};

export type MatchFactor = {
  key: MatchFactorKey;
  weight: number;
  score: number | null;
  label: "High" | "Medium" | "Low" | "Unavailable";
};

export type GooglePlaceMatchAssessment = {
  confidence: number;
  factors: Record<MatchFactorKey, MatchFactor>;
  distanceMeters: number | null;
  isChain: boolean;
  chainSafetyPassed: boolean;
  duplicateGooglePlaceId: boolean;
  hardBlocked: boolean;
  blockReasons: string[];
};

export type PlaceIdCoverageSummary = {
  total: number;
  linked: number;
  missing: number;
  needsReview: number;
  possibleWrongMatch: number;
  chainLocations: number;
};

export const DEFAULT_MATCH_CONFIDENCE_THRESHOLD = 75;

const CHAIN_NAME_PATTERNS = [
  /\b7[\s-]?eleven\b/i,
  /เซเว่น/i,
  /\bstarbucks\b/i,
  /cafe amazon/i,
  /คาเฟ่อเมซอน/i,
  /\bkfc\b/i,
  /mcdonald/i,
  /burger king/i,
  /\bsubway\b/i,
  /lotus'?s?/i,
  /\bbig c\b/i,
];

const CATEGORY_GOOGLE_TYPES: Partial<Record<CategoryId, string[]>> = {
  cafe: ["cafe", "coffee_shop"],
  food: ["restaurant", "food", "meal_takeaway"],
  local_food: ["restaurant", "food", "meal_takeaway"],
  thai_food: ["thai_restaurant", "restaurant"],
  japanese: ["japanese_restaurant", "restaurant"],
  korean_food: ["korean_restaurant", "restaurant"],
  chinese_food: ["chinese_restaurant", "restaurant"],
  noodle: ["restaurant", "food"],
  mookata: ["restaurant", "barbecue_restaurant"],
  bbq: ["barbecue_restaurant", "restaurant"],
  hotpot: ["restaurant"],
  bar: ["bar", "pub"],
  convenience: ["convenience_store"],
  supermarket: ["supermarket", "grocery_store"],
  pharmacy: ["pharmacy"],
  hospital: ["hospital"],
  clinic: ["doctor", "medical_clinic"],
  parking: ["parking"],
  monthly_parking: ["parking"],
  fitness: ["gym", "fitness_center"],
  laundry: ["laundry"],
  barber: ["barber_shop", "hair_salon"],
  salon: ["hair_salon", "beauty_salon"],
  gas_station: ["gas_station"],
  atm: ["atm"],
  bank: ["bank"],
  post_office: ["post_office"],
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = saved;
    }
  }
  return previous[b.length];
}

export function textSimilarity(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeText(a || "");
  const right = normalizeText(b || "");
  if (!left || !right) return null;
  if (left === right) return 1;
  // Google fallback queries often include the local name/area plus Bangkok.
  // Treat normalized containment as a strong match instead of penalising the
  // extra location tokens.
  if (left.includes(right) || right.includes(left)) return 0.95;
  const maxLength = Math.max(left.length, right.length);
  const editScore = 1 - levenshtein(left, right) / maxLength;
  const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size || 1;
  const tokenScore = overlap / union;
  return clamp01(Math.max(editScore, tokenScore));
}

function scoreLabel(score: number | null): MatchFactor["label"] {
  if (score == null) return "Unavailable";
  if (score >= 0.8) return "High";
  if (score >= 0.55) return "Medium";
  return "Low";
}

function coordinateScore(distanceMeters: number | null) {
  if (distanceMeters == null) return null;
  if (distanceMeters <= 25) return 1;
  if (distanceMeters <= 75) return 0.92;
  if (distanceMeters <= 150) return 0.8;
  if (distanceMeters <= 300) return 0.58;
  if (distanceMeters <= 750) return 0.25;
  return 0;
}

function categoryScore(place: Place, candidate: GoogleDiscoveryCandidate) {
  const type = String(candidate.primaryType || "").toLowerCase();
  if (!type) return null;
  const expected = new Set(place.categories.flatMap((category) => CATEGORY_GOOGLE_TYPES[category] || []));
  if (!expected.size) return null;
  return expected.has(type) ? 1 : 0.25;
}

export function isChainPlace(place: Place) {
  if (place.placeType === "chain" || place.placeType === "franchise") return true;
  return CHAIN_NAME_PATTERNS.some((pattern) => pattern.test(place.name));
}

export function buildGoogleMatchQuery(place: Place) {
  return [place.name, place.address || place.soi || place.area].filter(Boolean).join(" ").trim();
}

export function usedGooglePlaceIds(places: Place[]) {
  const map = new Map<string, string[]>();
  for (const place of places) {
    if (!place.googlePlaceId) continue;
    const list = map.get(place.googlePlaceId) || [];
    list.push(place.id);
    map.set(place.googlePlaceId, list);
  }
  return map;
}

export function assessGooglePlaceMatch(place: Place, candidate: GoogleDiscoveryCandidate, places: Place[]): GooglePlaceMatchAssessment {
  const distanceMeters = place.latitude != null && place.longitude != null && candidate.latitude != null && candidate.longitude != null
    ? Math.round(haversineKm({ lat: place.latitude, lng: place.longitude }, { lat: candidate.latitude, lng: candidate.longitude }) * 1000)
    : null;
  const rawFactors: MatchFactor[] = [
    { key: "name", weight: 35, score: textSimilarity(place.name, candidate.name), label: "Unavailable" },
    { key: "coordinates", weight: 30, score: coordinateScore(distanceMeters), label: "Unavailable" },
    { key: "address", weight: 15, score: textSimilarity(place.address || place.soi || place.area, candidate.address), label: "Unavailable" },
    { key: "category", weight: 10, score: categoryScore(place, candidate), label: "Unavailable" },
    { key: "phone", weight: 5, score: null, label: "Unavailable" },
    { key: "website", weight: 5, score: null, label: "Unavailable" },
  ];
  const factorsArray: MatchFactor[] = rawFactors.map((factor) => ({ ...factor, label: scoreLabel(factor.score) }));
  const available = factorsArray.filter((factor) => factor.score != null);
  const weightTotal = available.reduce((sum, factor) => sum + factor.weight, 0);
  const weighted = available.reduce((sum, factor) => sum + (factor.score || 0) * factor.weight, 0);
  const confidence = weightTotal ? Math.round((weighted / weightTotal) * 100) : 0;
  const factorMap = Object.fromEntries(factorsArray.map((factor) => [factor.key, factor])) as Record<MatchFactorKey, MatchFactor>;
  const linkedElsewhere = places.some((item) => item.id !== place.id && item.googlePlaceId === candidate.googlePlaceId);
  const chain = isChainPlace(place);
  const chainAddressScore = factorMap.address.score;
  const geocodeFallback = candidate.primaryType === "geocode_fallback";
  // Existing records currently have no local coordinates. For normal Places
  // candidates, keep the strict coordinate guard. For the explicit Google
  // Geocoding fallback, require strong area/address agreement instead so chain
  // branches can still be positioned on the map without inventing coordinates.
  const chainSafetyPassed = !chain || (
    !linkedElsewhere &&
    chainAddressScore != null && chainAddressScore >= (geocodeFallback ? 0.55 : 0.45) &&
    (geocodeFallback || (distanceMeters != null && distanceMeters <= 150))
  );
  const blockReasons: string[] = [];
  if (linkedElsewhere) blockReasons.push("Google Place ID is already linked to another local record");
  if (chain && !geocodeFallback && distanceMeters == null) blockReasons.push("Chain location requires coordinate proximity");
  if (chain && !geocodeFallback && distanceMeters != null && distanceMeters > 150) blockReasons.push("Chain candidate is too far from this branch");
  if (chain && (chainAddressScore == null || chainAddressScore < (geocodeFallback ? 0.55 : 0.45))) blockReasons.push("Chain candidate requires address agreement");
  return {
    confidence,
    factors: factorMap,
    distanceMeters,
    isChain: chain,
    chainSafetyPassed,
    duplicateGooglePlaceId: linkedElsewhere,
    hardBlocked: linkedElsewhere || !chainSafetyPassed,
    blockReasons,
  };
}

export function auditExistingPlaceIds(places: Place[]) {
  const issues: PlaceIdAuditIssue[] = [];
  const byGoogleId = usedGooglePlaceIds(places);
  for (const [googlePlaceId, placeIds] of byGoogleId.entries()) {
    if (placeIds.length > 1) {
      issues.push({ id: `duplicate:${googlePlaceId}`, placeIds, googlePlaceId, kind: "duplicate_google_place_id", severity: "high", message: `Google Place ID is assigned to ${placeIds.length} local records.` });
      if (placeIds.some((id) => isChainPlace(places.find((place) => place.id === id)!))) {
        issues.push({ id: `chain:${googlePlaceId}`, placeIds, googlePlaceId, kind: "chain_conflict", severity: "high", message: "A chain location shares a Google Place ID with another local record." });
      }
    }
  }
  for (const place of places) {
    if (!place.googlePlaceId) continue;
    if (place.latitude == null || place.longitude == null) {
      issues.push({ id: `coords:${place.id}`, placeIds: [place.id], googlePlaceId: place.googlePlaceId, kind: "missing_coordinates", severity: "review", message: "Linked record is missing local coordinates." });
    }
    if (place.googleMaps?.placeId && place.googleMaps.placeId !== place.googlePlaceId) {
      issues.push({ id: `identity:${place.id}`, placeIds: [place.id], googlePlaceId: place.googlePlaceId, kind: "google_maps_identity_conflict", severity: "high", message: "googlePlaceId conflicts with the stored Google Maps identity." });
    }
    if (place.latitude != null && place.longitude != null && place.googleMaps?.latitude != null && place.googleMaps?.longitude != null) {
      const distanceKm = haversineKm({ lat: place.latitude, lng: place.longitude }, { lat: place.googleMaps.latitude, lng: place.googleMaps.longitude });
      if (distanceKm > 1) issues.push({ id: `distance:${place.id}`, placeIds: [place.id], googlePlaceId: place.googlePlaceId, kind: "distant_link", severity: "high", message: `Stored Google Maps coordinates are ${distanceKm.toFixed(1)} km from the local record.` });
    }
  }
  return issues;
}

export function placeIdIntegrityStatus(place: Place, issues: PlaceIdAuditIssue[]): PlaceIdIntegrityStatus {
  if (!place.googlePlaceId) return "missing";
  const mine = issues.filter((issue) => issue.placeIds.includes(place.id));
  if (mine.some((issue) => issue.severity === "high")) return "possible_wrong_match";
  if (mine.length) return "needs_review";
  return "linked";
}

export function placeIdCoverageSummary(places: Place[], issues = auditExistingPlaceIds(places)): PlaceIdCoverageSummary {
  const statuses = places.map((place) => placeIdIntegrityStatus(place, issues));
  return {
    total: places.length,
    linked: statuses.filter((status) => status === "linked").length,
    missing: statuses.filter((status) => status === "missing").length,
    needsReview: statuses.filter((status) => status === "needs_review").length,
    possibleWrongMatch: statuses.filter((status) => status === "possible_wrong_match").length,
    chainLocations: places.filter(isChainPlace).length,
  };
}
