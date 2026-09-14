import type { FilterState } from "@/components/FilterSheet";
import { buildRecommendationReasonLine } from "@/lib/discovery/recommendation-reasons";
import { getPlaceOpenStatus, normalizeText } from "@/lib/place-utils";
import type { CategoryId, Place, SortMode } from "@/types/place";

export type RecommendationContext = {
  preferredCategories?: ReadonlySet<CategoryId>;
  favoriteIds?: ReadonlySet<string>;
  recentIds?: ReadonlySet<string>;
  now?: Date;
};

export function activeFilterCount(filters: FilterState) {
  return (
    Object.entries(filters).filter(([key, value]) => !["priceLevels", "maxPrice", "maxWalkingMinutes", "area"].includes(key) && value === true).length +
    (filters.priceLevels.length ? 1 : 0) +
    (filters.maxPrice != null ? 1 : 0) +
    (filters.maxWalkingMinutes != null ? 1 : 0) +
    (filters.area ? 1 : 0)
  );
}

export function explicitPriceCeiling(place: Place) {
  if (place.pricing?.max != null) return place.pricing.max;
  if (place.pricing?.fixed != null) return place.pricing.fixed;
  if (place.maxPrice != null) return place.maxPrice;
  if (place.averagePricePerPerson != null) return place.averagePricePerPerson;
  return null;
}

export function passesFilters(place: Place, filters: FilterState, verifiedOnly: boolean) {
  const status = getPlaceOpenStatus(place);
  if (filters.onlyOpen && status.isOpen !== true) return false;
  if (filters.only24Hours && !place.is24Hours) return false;
  if (filters.openLate && place.openLate !== true) return false;
  if (filters.parking && place.parking.available !== true && !place.categories.includes("parking") && !place.categories.includes("monthly_parking")) return false;
  if (filters.wifi && place.wifi !== true) return false;
  if (filters.powerOutlet && place.powerOutlet !== true) return false;
  if (filters.airConditioned && place.airConditioned !== true) return false;
  if (filters.delivery && place.delivery !== true) return false;
  if (filters.takeaway && place.takeaway !== true) return false;
  if (filters.goodForWorking && place.goodForWorking !== true) return false;
  if (filters.studentFriendly && place.studentFriendly !== true) return false;
  if ((filters.verifiedOnly || verifiedOnly) && !place.verified) return false;
  if (filters.localOnly && !(place.placeType === "local" || place.placeType === "independent" || place.localFavorite)) return false;
  if (filters.priceLevels.length && (place.priceLevel == null || !filters.priceLevels.includes(place.priceLevel))) return false;
  if (filters.maxPrice != null) {
    const ceiling = explicitPriceCeiling(place);
    if (ceiling == null || ceiling > filters.maxPrice) return false;
  }
  if (filters.maxWalkingMinutes != null) {
    const walking = place.distance?.walkingMinutes ?? place.walkingMinutes;
    if (walking == null || walking > filters.maxWalkingMinutes) return false;
  }
  if (filters.area && !normalizeText(`${place.area} ${place.soi || ""}`).includes(normalizeText(filters.area))) return false;
  return true;
}

function bangkokHour(now: Date) {
  const value = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Bangkok",
  }).format(now);
  const hour = Number(value);
  return Number.isFinite(hour) ? hour : now.getHours();
}

function distanceNowScore(distanceKm: number | null | undefined) {
  if (distanceKm == null) return 0;
  if (distanceKm <= 0.25) return 25;
  if (distanceKm <= 0.5) return 21;
  if (distanceKm <= 1) return 15;
  if (distanceKm <= 2) return 8;
  if (distanceKm <= 3) return 3;
  return 0;
}

function qualityNowScore(place: Place) {
  let score = 0;
  if (place.verified) score += 6;
  if (place.dataStatus === "verified") score += 4;
  else if (place.dataStatus === "partial") score += 1;
  else if (place.dataStatus === "stale") score -= 3;
  else if (place.dataStatus === "unverified") score -= 4;
  return score;
}

/**
 * Recommended Now score. Current usefulness dominates social popularity:
 * open/closed state, distance, preferences and known local quality carry the
 * meaningful weight; ratings/review volume are bounded tie-break signals.
 * Unknown values are neutral rather than guessed.
 */
export function recommendationScore(place: Place, context: RecommendationContext = {}) {
  const preferred = context.preferredCategories ?? new Set<CategoryId>();
  const favorites = context.favoriteIds ?? new Set<string>();
  const recents = context.recentIds ?? new Set<string>();
  const now = context.now ?? new Date();
  const status = getPlaceOpenStatus(place, now);
  const hour = bangkokHour(now);

  let score = 0;

  if (status.isOpen === true) score += 30;
  else if (status.isOpen === false) score -= 35;

  score += distanceNowScore(place.distanceKm);

  if (preferred.has(place.category) || place.categories.some((category) => preferred.has(category))) score += 10;
  if (place.placeType === "local" || place.placeType === "independent" || place.localFavorite) score += 8;
  if (place.hiddenGem) score += 5;
  score += qualityNowScore(place);

  // Small continuity signals preserve useful existing personalization without
  // overpowering "now" fit.
  if (place.recommended) score += 3;
  if (favorites.has(place.id)) score += 2;
  if (recents.has(place.id)) score += 1;
  if (place.studentFriendly === true) score += 1;
  if (place.goodForWorking === true) score += 1;

  if ((hour >= 20 || hour < 5) && (place.openLate === true || place.is24Hours)) score += 5;

  // Ratings and volume are deliberately capped as tie-breakers.
  if (place.rating != null) score += Math.max(0, Math.min(1.5, (place.rating - 3) * 0.75));
  if (place.reviewCount != null && place.reviewCount > 0) score += Math.min(1, Math.log10(place.reviewCount + 1) / 4);
  if (place.localScore != null) score += Math.min(2, Math.max(0, place.localScore / 50));

  return score;
}

export function sortPlaces(places: Place[], mode: SortMode, context: RecommendationContext = {}) {
  return [...places].sort((a, b) => {
    const distanceA = a.distanceKm ?? Number.POSITIVE_INFINITY;
    const distanceB = b.distanceKm ?? Number.POSITIVE_INFINITY;
    if (mode === "distanceAsc") return distanceA - distanceB;
    if (mode === "distanceDesc") return distanceB - distanceA;
    if (mode === "rating") return (b.rating ?? -1) - (a.rating ?? -1);
    if (mode === "reviews") return (b.reviewCount ?? -1) - (a.reviewCount ?? -1);
    if (mode === "price") return (explicitPriceCeiling(a) ?? 999999) - (explicitPriceCeiling(b) ?? 999999);
    if (mode === "openNow") return Number(getPlaceOpenStatus(b, context.now).isOpen === true) - Number(getPlaceOpenStatus(a, context.now).isOpen === true) || distanceA - distanceB;
    if (mode === "local") return Number(Boolean(b.localFavorite || b.placeType === "local" || b.placeType === "independent")) - Number(Boolean(a.localFavorite || a.placeType === "local" || a.placeType === "independent")) || distanceA - distanceB;
    if (mode === "localScore") return (b.localScore ?? -1) - (a.localScore ?? -1) || distanceA - distanceB;
    if (mode === "late") return Number(b.openLate === true || b.is24Hours) - Number(a.openLate === true || a.is24Hours) || distanceA - distanceB;
    return recommendationScore(b, context) - recommendationScore(a, context) || distanceA - distanceB || a.id.localeCompare(b.id);
  });
}

export function smartLocalPicks(places: Place[], context: RecommendationContext = {}, limit = 4) {
  const locals = places.filter((place) => place.localFavorite || place.hiddenGem || place.placeType === "local" || place.placeType === "independent");
  const source = locals.length ? locals : places;
  return sortPlaces(source, "recommended", context).slice(0, limit);
}

export function recommendationReasons(place: Place, context: RecommendationContext = {}, language: "th" | "en" = "th") {
  const reasons: string[] = [];
  const preferred = context.preferredCategories ?? new Set<CategoryId>();
  const now = context.now ?? new Date();
  const status = getPlaceOpenStatus(place, now);
  const hour = bangkokHour(now);
  const knownFactsLine = buildRecommendationReasonLine(place, context, language);

  if (knownFactsLine) reasons.push(knownFactsLine);
  if (status.isOpen === true) reasons.push(language === "en" ? "Open now" : "เปิดอยู่ตอนนี้");
  if (place.distanceKm != null && place.distanceKm <= 0.5) reasons.push(language === "en" ? "Very close" : "ใกล้มาก");
  if (preferred.has(place.category) || place.categories.some((category) => preferred.has(category))) reasons.push(language === "en" ? "Matches your interests" : "ตรงกับหมวดที่ชอบ");
  if (place.hiddenGem) reasons.push(language === "en" ? "Hidden gem" : "Hidden Gem");
  else if (place.localFavorite || place.placeType === "local" || place.placeType === "independent") reasons.push(language === "en" ? "Local pick" : "ร้าน Local น่าแวะ");
  if ((hour >= 20 || hour < 5) && (place.openLate === true || place.is24Hours)) reasons.push(language === "en" ? "Good late-night option" : "เหมาะช่วงดึก");
  if (place.rating != null && place.rating >= 4.5) reasons.push(language === "en" ? "Highly rated" : "คะแนนรีวิวสูง");
  if (place.verified) reasons.push(language === "en" ? "Verified data" : "ข้อมูลยืนยันแล้ว");

  return Array.from(new Set(reasons)).slice(0, 3);
}
