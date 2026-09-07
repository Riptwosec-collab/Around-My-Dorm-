import { freshnessState, recommendedRefreshDays, shouldRefresh } from "@/lib/data-governance";
import type { Place } from "@/types/place";

export type RefreshPriorityLevel = "critical" | "high" | "medium" | "low" | "current";

export type RefreshPriorityFactors = {
  possibleClosure: number;
  dataAge: number;
  missingKeyFields: number;
  engagement: number;
  volatility: number;
  verificationGap: number;
};

export type RefreshQueueItem = {
  place: Place;
  score: number;
  priority: RefreshPriorityLevel;
  ageDays: number | null;
  missingFields: string[];
  factors: RefreshPriorityFactors;
  reasons: string[];
  googleEligible: boolean;
};

export type RefreshQueueSummary = {
  items: RefreshQueueItem[];
  critical: RefreshQueueItem[];
  high: RefreshQueueItem[];
  medium: RefreshQueueItem[];
  low: RefreshQueueItem[];
  current: RefreshQueueItem[];
  recommended: RefreshQueueItem[];
};

const VOLATILE_CATEGORIES = new Set([
  "food", "local_food", "noodle", "thai_food", "isan_food", "japanese", "korean_food", "vietnamese_food",
  "cafe", "bar", "night_food", "mookata", "hotpot", "bbq", "chinese_food", "parking", "monthly_parking",
]);

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function placeDataAgeDays(place: Place, now = Date.now()) {
  const raw = place.lastChecked || place.lastUpdated || place.lastVerified;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now - time) / 86_400_000));
}

function hasOpeningHours(place: Place) {
  if (place.is24Hours) return true;
  if (place.openingHoursText?.trim()) return true;
  return Object.values(place.openingHours || {}).some(Boolean);
}

function hasPrice(place: Place) {
  return Boolean(place.priceText?.trim()) || place.minPrice != null || place.maxPrice != null || place.averagePricePerPerson != null || Boolean(place.pricing?.displayText);
}

export function refreshMissingKeyFields(place: Place) {
  const missing: string[] = [];
  if (place.latitude == null || place.longitude == null) missing.push("coordinates");
  if (!place.googlePlaceId) missing.push("googlePlaceId");
  if (!place.address?.trim()) missing.push("address");
  if (!hasOpeningHours(place)) missing.push("openingHours");
  if (!place.phone?.trim()) missing.push("phone");
  if (!hasPrice(place)) missing.push("price");
  return missing;
}

function ageFactor(place: Place, ageDays: number | null) {
  if (ageDays == null) return 1;
  if (ageDays > 120) return 1;
  if (ageDays > 90) return 0.9;
  if (ageDays > 60) return 0.7;
  if (ageDays > 30) return 0.45;
  const recommended = recommendedRefreshDays(place);
  if (ageDays >= recommended) return 0.35;
  return clamp01(ageDays / Math.max(60, recommended * 2)) * 0.25;
}

function engagementFactor(place: Place) {
  let score = 0;
  if (place.localFavorite) score += 0.55;
  if (place.recommended) score += 0.35;
  if ((place.reviewCount || 0) >= 100) score += 0.1;
  return clamp01(score);
}

function volatilityFactor(place: Place) {
  return place.categories.some((category) => VOLATILE_CATEGORIES.has(category)) ? 1 : 0.35;
}

function verificationGapFactor(place: Place, ageDays: number | null) {
  if (!place.verified) return 1;
  if (!place.lastVerified) return 0.7;
  if (ageDays == null) return 0.65;
  if (ageDays > 90) return 0.65;
  if (ageDays > 60) return 0.45;
  if (ageDays > 30) return 0.25;
  return 0;
}

export function scoreRefreshPriority(place: Place, now = Date.now()): RefreshQueueItem {
  const ageDays = placeDataAgeDays(place, now);
  const missingFields = refreshMissingKeyFields(place);
  const possibleClosure = place.temporaryClosed ? 1 : place.permanentlyClosed ? 0.35 : 0;
  const dataAge = ageFactor(place, ageDays);
  const missingKeyFields = clamp01(missingFields.length / 6);
  const engagement = engagementFactor(place);
  const volatility = volatilityFactor(place);
  const verificationGap = verificationGapFactor(place, ageDays);

  const score = Math.round(
    possibleClosure * 30 +
    dataAge * 25 +
    missingKeyFields * 15 +
    engagement * 10 +
    volatility * 10 +
    verificationGap * 10,
  );

  let priority: RefreshPriorityLevel = "current";
  if (place.temporaryClosed || score >= 75) priority = "critical";
  else if ((ageDays != null && ageDays > 90) || score >= 60) priority = "high";
  else if ((ageDays != null && ageDays > 60) || score >= 42) priority = "medium";
  else if ((ageDays != null && ageDays > 30) || shouldRefresh(place, now) || score >= 28) priority = "low";

  const reasons: string[] = [];
  if (place.temporaryClosed) reasons.push("possible closure");
  if (ageDays == null) reasons.push("never checked");
  else if (ageDays > 90) reasons.push(`checked ${ageDays} days ago`);
  else if (ageDays > 60) reasons.push(`checked ${ageDays} days ago`);
  else if (ageDays > 30) reasons.push(`checked ${ageDays} days ago`);
  if (missingFields.length) reasons.push(`missing ${missingFields.length} key field${missingFields.length === 1 ? "" : "s"}`);
  if (!place.verified) reasons.push("not verified");
  if (place.categories.some((category) => VOLATILE_CATEGORIES.has(category))) reasons.push("volatile category");
  if (place.localFavorite || place.recommended) reasons.push("high local relevance");
  if (!reasons.length && freshnessState(place, now) === "fresh") reasons.push("recently checked");

  return {
    place,
    score,
    priority,
    ageDays,
    missingFields,
    factors: { possibleClosure, dataAge, missingKeyFields, engagement, volatility, verificationGap },
    reasons,
    googleEligible: Boolean(place.googlePlaceId),
  };
}

const PRIORITY_ORDER: Record<RefreshPriorityLevel, number> = { critical: 4, high: 3, medium: 2, low: 1, current: 0 };

export function buildRefreshQueue(places: Place[], now = Date.now()): RefreshQueueSummary {
  const items = places.map((place) => scoreRefreshPriority(place, now)).sort((a, b) => {
    const priorityDelta = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
    if (priorityDelta) return priorityDelta;
    if (b.score !== a.score) return b.score - a.score;
    const ageA = a.ageDays ?? Number.MAX_SAFE_INTEGER;
    const ageB = b.ageDays ?? Number.MAX_SAFE_INTEGER;
    if (ageB !== ageA) return ageB - ageA;
    return a.place.name.localeCompare(b.place.name);
  });
  const by = (priority: RefreshPriorityLevel) => items.filter((item) => item.priority === priority);
  const critical = by("critical");
  const high = by("high");
  const medium = by("medium");
  const low = by("low");
  const current = by("current");
  const recommended = items.filter((item) => item.priority !== "current" && item.googleEligible && !item.place.permanentlyClosed);
  return { items, critical, high, medium, low, current, recommended };
}

export function recommendedRefreshPlaces(places: Place[], maxItems = 50, now = Date.now()) {
  return buildRefreshQueue(places, now).recommended.slice(0, Math.max(0, maxItems)).map((item) => item.place);
}
