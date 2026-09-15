import { FOOD_CATEGORIES } from "@/lib/app-shell-config";
import { buildRecommendationReasonLine } from "@/lib/discovery/recommendation-reasons";
import {
  explicitPriceCeiling,
  recommendationScore,
  type RecommendationContext,
} from "@/lib/place-ranking";
import { getPlaceOpenStatus } from "@/lib/place-utils";
import type { Place } from "@/types/place";

export type FoodNowCriteria = {
  budget: number | null;
  radiusMeters: number;
  localOnly: boolean;
  openNow: boolean;
  lateOnly: boolean;
  verifiedOnly: boolean;
};

export type FoodNowOptions = {
  budget: number | null;
  radius: number;
  localOnly: boolean;
  openNow: boolean;
  lateOnly: boolean;
};

export type FoodNowResult = {
  place: Place;
  score: number;
  reasonLine: string;
};

function bangkokHour(now: Date) {
  const value = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Bangkok",
  }).format(now);
  const hour = Number(value);
  return Number.isFinite(hour) ? hour : now.getHours();
}

function isFoodPlace(place: Place) {
  if (FOOD_CATEGORIES.has(place.category)) return true;
  return place.categories.some((category) => FOOD_CATEGORIES.has(category));
}

function isLocalPlace(place: Place) {
  return place.placeType === "local" || place.placeType === "independent" || place.localFavorite === true;
}

function isLatePlace(place: Place) {
  return place.openLate === true || place.is24Hours === true;
}

function passesFoodNowCriteria(place: Place, criteria: FoodNowCriteria, context: RecommendationContext) {
  if (!isFoodPlace(place)) return false;

  // Food Now always has a selected radius. Unknown straight-line distance is
  // therefore not eligible rather than being treated as nearby.
  if (place.distanceKm == null || place.distanceKm * 1000 > criteria.radiusMeters) return false;

  if (criteria.verifiedOnly && !place.verified) return false;
  if (criteria.localOnly && !isLocalPlace(place)) return false;
  if (criteria.lateOnly && !isLatePlace(place)) return false;

  if (criteria.openNow && getPlaceOpenStatus(place, context.now).isOpen !== true) return false;

  if (criteria.budget != null) {
    const ceiling = explicitPriceCeiling(place);
    if (ceiling == null || ceiling > criteria.budget) return false;
  }

  return true;
}

function scoreFoodNow(place: Place, criteria: FoodNowCriteria, context: RecommendationContext) {
  let score = recommendationScore(place, context);

  if (criteria.budget != null) {
    const ceiling = explicitPriceCeiling(place);
    if (ceiling != null && ceiling <= criteria.budget) score += 15;
  }

  const now = context.now ?? new Date();
  const hour = bangkokHour(now);
  if ((hour >= 21 || hour < 5) && isLatePlace(place)) score += 8;

  return score;
}

export function rankFoodNow(
  places: Place[],
  criteria: FoodNowCriteria,
  context: RecommendationContext = {},
  language: "th" | "en" = "th",
  limit = 5,
): FoodNowResult[] {
  const safeLimit = Math.max(0, Math.min(5, Math.trunc(limit)));

  return places
    .filter((place) => passesFoodNowCriteria(place, criteria, context))
    .map((place) => ({
      place,
      score: scoreFoodNow(place, criteria, context),
      reasonLine: buildRecommendationReasonLine(place, context, language),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const distanceA = a.place.distanceKm ?? Number.POSITIVE_INFINITY;
      const distanceB = b.place.distanceKm ?? Number.POSITIVE_INFINITY;
      if (distanceA !== distanceB) return distanceA - distanceB;
      return a.place.id.localeCompare(b.place.id);
    })
    .slice(0, safeLimit);
}

export function recommendFoodNow(
  places: Place[],
  options: FoodNowOptions,
  context: RecommendationContext = {},
  language: "th" | "en" = "th",
  limit = 5,
  verifiedOnly = false,
) {
  return rankFoodNow(
    places,
    {
      budget: options.budget,
      radiusMeters: options.radius,
      localOnly: options.localOnly,
      openNow: options.openNow,
      lateOnly: options.lateOnly,
      verifiedOnly,
    },
    context,
    language,
    limit,
  );
}
