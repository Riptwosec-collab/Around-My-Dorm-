import { formatDistance, formatPrice } from "@/lib/place-utils";
import type { Place } from "@/types/place";

export type DisplayLanguage = "th" | "en";

export function formatDisplayDistance(distanceKm: number | null, language: DisplayLanguage) {
  if (language === "th") return formatDistance(distanceKm);
  if (distanceKm == null) return "Coordinates not verified";
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`;
}

export function formatDisplayPrice(place: Place, language: DisplayLanguage) {
  if (language === "th") return formatPrice(place);

  const pricing = place.pricing;
  if (pricing?.type === "free") return "Free";

  if (pricing?.fixed != null) {
    const suffix = pricing.type === "per_month"
      ? "/month"
      : pricing.type === "per_hour"
        ? "/hr"
        : pricing.type === "per_person"
          ? "/person"
          : "";
    return `${pricing.fixed.toLocaleString("en-US")} THB${suffix}`;
  }

  const min = pricing?.min ?? place.minPrice ?? null;
  const max = pricing?.max ?? place.maxPrice ?? null;
  if (min != null || max != null) {
    const safeMin = min ?? 0;
    if (max != null) return `${safeMin.toLocaleString("en-US")}–${max.toLocaleString("en-US")} THB`;
    return `From ${safeMin.toLocaleString("en-US")} THB`;
  }

  if (place.averagePricePerPerson != null) {
    return `${place.averagePricePerPerson.toLocaleString("en-US")} THB/person`;
  }

  if (pricing?.displayText) return pricing.displayText;
  if (place.priceText) return place.priceText;
  if (place.priceLevel != null) return "฿".repeat(place.priceLevel);
  return "Price unavailable";
}
