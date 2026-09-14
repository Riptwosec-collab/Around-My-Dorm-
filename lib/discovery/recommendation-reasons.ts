import { getPlaceOpenStatus } from "@/lib/place-utils";
import type { RecommendationContext } from "@/lib/place-ranking";
import type { Place } from "@/types/place";

function knownDistanceLabel(distanceKm: number | null | undefined, language: "th" | "en") {
  if (distanceKm == null) return null;
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} ${language === "en" ? "m" : "ม."}`;
  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} ${language === "en" ? "km" : "กม."}`;
}

function money(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function knownPriceLabel(place: Place) {
  const pricing = place.pricing;
  if (pricing?.displayText) return pricing.displayText;
  if (pricing?.type === "free") return "ฟรี";
  if (pricing?.fixed != null) return `฿${money(pricing.fixed)}`;
  if (pricing?.min != null && pricing.max != null) return `฿${money(pricing.min)}–${money(pricing.max)}`;
  if (pricing?.max != null) return `≤ ฿${money(pricing.max)}`;
  if (place.minPrice != null && place.maxPrice != null) return `฿${money(place.minPrice)}–${money(place.maxPrice)}`;
  if (place.maxPrice != null) return `≤ ฿${money(place.maxPrice)}`;
  if (place.averagePricePerPerson != null) return `฿${money(place.averagePricePerPerson)}`;
  if (place.priceText?.trim()) return place.priceText.trim();
  return null;
}

export function buildRecommendationReasonLine(
  place: Place,
  context: RecommendationContext = {},
  language: "th" | "en" = "th",
) {
  const facts: string[] = [];
  const now = context.now ?? new Date();
  const status = getPlaceOpenStatus(place, now);
  const distance = knownDistanceLabel(place.distanceKm, language);
  const price = knownPriceLabel(place);
  const isLocal = place.placeType === "local" || place.placeType === "independent" || place.localFavorite;

  if (status.isOpen === true) facts.push(language === "en" ? "Open now" : "เปิดอยู่");
  if (distance) facts.push(distance);
  if (price) facts.push(price);
  if (isLocal) facts.push("LOCAL");

  if (facts.length < 4 && place.hiddenGem) facts.push("HIDDEN GEM");
  if (facts.length < 4 && place.verified) facts.push(language === "en" ? "VERIFIED" : "ยืนยันแล้ว");

  return Array.from(new Set(facts)).slice(0, 4).join(" • ");
}
