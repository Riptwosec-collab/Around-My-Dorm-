import type { FilterState } from "@/components/FilterSheet";
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

export function recommendationScore(place: Place, context: RecommendationContext = {}) {
  const preferred = context.preferredCategories ?? new Set<CategoryId>();
  const favorites = context.favoriteIds ?? new Set<string>();
  const recents = context.recentIds ?? new Set<string>();
  const now = context.now ?? new Date();
  const status = getPlaceOpenStatus(place);
  const hour = bangkokHour(now);
  const distanceKm = place.distanceKm;

  let score = 0;

  if (preferred.has(place.category) || place.categories.some((category) => preferred.has(category))) score += 18;
  if (place.recommended) score += 14;
  if (place.localFavorite) score += 12;
  if (place.hiddenGem) score += 8;
  if (place.placeType === "local" || place.placeType === "independent") score += 7;
  if (place.verified) score += 8;
  if (place.dataStatus === "verified") score += 4;
  if (place.dataStatus === "stale") score -= 5;
  if (place.dataStatus === "unverified") score -= 7;
  if (place.studentFriendly === true) score += 4;
  if (place.goodForWorking === true) score += 3;
  if (favorites.has(place.id)) score += 4;
  if (recents.has(place.id)) score += 2;

  if (status.isOpen === true) score += 15;
  else if (status.isOpen === false) score -= 10;

  if (hour >= 20 || hour < 5) {
    if (place.openLate === true || place.is24Hours) score += 9;
    if (status.isOpen === false) score -= 4;
  }

  if (place.rating != null) score += Math.max(0, Math.min(12, (place.rating - 3) * 6));
  if (place.reviewCount != null && place.reviewCount > 0) score += Math.min(6, Math.log10(place.reviewCount + 1) * 2);
  if (place.localScore != null) score += Math.min(10, Math.max(0, place.localScore / 10));

  if (distanceKm != null) {
    if (distanceKm <= 0.25) score += 14;
    else if (distanceKm <= 0.5) score += 11;
    else if (distanceKm <= 1) score += 8;
    else if (distanceKm <= 2) score += 4;
    else if (distanceKm > 3) score -= 4;
  }

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
    if (mode === "openNow") return Number(getPlaceOpenStatus(b).isOpen === true) - Number(getPlaceOpenStatus(a).isOpen === true) || distanceA - distanceB;
    if (mode === "local") return Number(Boolean(b.localFavorite || b.placeType === "local" || b.placeType === "independent")) - Number(Boolean(a.localFavorite || a.placeType === "local" || a.placeType === "independent")) || distanceA - distanceB;
    if (mode === "localScore") return (b.localScore ?? -1) - (a.localScore ?? -1) || distanceA - distanceB;
    if (mode === "late") return Number(b.openLate === true || b.is24Hours) - Number(a.openLate === true || a.is24Hours) || distanceA - distanceB;
    return recommendationScore(b, context) - recommendationScore(a, context) || distanceA - distanceB;
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
  const status = getPlaceOpenStatus(place);
  const hour = bangkokHour(context.now ?? new Date());

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
