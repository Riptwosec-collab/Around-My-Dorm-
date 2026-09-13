import { dataAgeDays, scorePlaceDataQuality } from "@/lib/data-quality";
import { haversineKm, normalizePlaceName } from "@/lib/place-utils";
import type { Place } from "@/types/place";

export type DataHealthIssueCode =
  | "duplicate_id"
  | "duplicate_slug"
  | "duplicate_google_place_id"
  | "invalid_coordinates"
  | "category_mismatch"
  | "missing_maps_link"
  | "duplicate_image"
  | "invalid_price_range"
  | "stale_record"
  | "missing_area_context"
  | "local_chain_ambiguity"
  | "possible_duplicate_business";

export type DataHealthIssue = {
  code: DataHealthIssueCode;
  severity: "warning" | "error";
  placeIds: string[];
  message: string;
};

export type DataHealthSummary = {
  total: number;
  status: { verified: number; partial: number; stale: number; unverified: number };
  withCoordinates: number;
  withMapsLink: number;
  withUsableImage: number;
  withHours: number;
  withPrice: number;
  duplicateCandidates: number;
  needsReview: number;
  issues: DataHealthIssue[];
};

function nonBlank(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValidCoordinates(place: Place) {
  return (
    place.latitude != null &&
    place.longitude != null &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude) &&
    place.latitude >= -90 &&
    place.latitude <= 90 &&
    place.longitude >= -180 &&
    place.longitude <= 180
  );
}

function resolvedStatus(place: Place, now: number): keyof DataHealthSummary["status"] {
  const age = dataAgeDays(place, now);
  if (place.dataStatus === "stale" || (age != null && age > 90)) return "stale";
  if (place.dataStatus === "unverified") return "unverified";
  if (place.dataStatus === "partial") return "partial";
  if (place.dataStatus === "verified" || place.verified) return "verified";
  return "unverified";
}

function duplicatesBy(places: Place[], value: (place: Place) => string | null) {
  const groups = new Map<string, string[]>();
  for (const place of places) {
    const key = value(place);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), place.id]);
  }
  return [...groups.entries()].filter(([, ids]) => ids.length > 1);
}

function hasDuplicateMedia(place: Place) {
  const urls = [
    ...(place.images ?? []),
    ...(place.galleryImages ?? []),
    ...(place.menuImages ?? []),
    ...(place.parkingImages ?? []),
  ]
    .map((url) => url.trim())
    .filter(Boolean);
  return new Set(urls).size !== urls.length;
}

function pushDuplicateIssues(
  issues: DataHealthIssue[],
  code: Extract<DataHealthIssueCode, "duplicate_id" | "duplicate_slug" | "duplicate_google_place_id">,
  groups: Array<[string, string[]]>,
  label: string,
) {
  for (const [value, placeIds] of groups) {
    issues.push({
      code,
      severity: "error",
      placeIds,
      message: `${label} is duplicated: ${value}`,
    });
  }
}

export function buildDataHealthSummary(places: Place[], now = Date.now()): DataHealthSummary {
  const issues: DataHealthIssue[] = [];
  const status: DataHealthSummary["status"] = { verified: 0, partial: 0, stale: 0, unverified: 0 };

  pushDuplicateIssues(issues, "duplicate_id", duplicatesBy(places, (place) => nonBlank(place.id) ? place.id : null), "Internal ID");
  pushDuplicateIssues(issues, "duplicate_slug", duplicatesBy(places, (place) => nonBlank(place.slug) ? place.slug : null), "Slug");
  pushDuplicateIssues(
    issues,
    "duplicate_google_place_id",
    duplicatesBy(places, (place) => nonBlank(place.googlePlaceId) ? place.googlePlaceId!.trim() : null),
    "Google Place ID",
  );

  let withCoordinates = 0;
  let withMapsLink = 0;
  let withUsableImage = 0;
  let withHours = 0;
  let withPrice = 0;

  for (const place of places) {
    const healthStatus = resolvedStatus(place, now);
    status[healthStatus] += 1;

    const validCoordinates = hasValidCoordinates(place);
    if (validCoordinates) withCoordinates += 1;
    if (nonBlank(place.googleMapsUrl) || nonBlank(place.googleMaps?.url)) withMapsLink += 1;

    const quality = scorePlaceDataQuality(place);
    if (!quality.missing.includes("photo")) withUsableImage += 1;
    if (!quality.missing.includes("openingHours")) withHours += 1;
    if (!quality.missing.includes("price")) withPrice += 1;

    if ((place.latitude != null || place.longitude != null) && !validCoordinates) {
      issues.push({ code: "invalid_coordinates", severity: "error", placeIds: [place.id], message: "Coordinates are outside valid latitude/longitude ranges." });
    }
    if (!place.categories.includes(place.category)) {
      issues.push({ code: "category_mismatch", severity: "warning", placeIds: [place.id], message: "Primary category is missing from categories." });
    }
    if ((nonBlank(place.googlePlaceId) || validCoordinates) && !nonBlank(place.googleMapsUrl) && !nonBlank(place.googleMaps?.url)) {
      issues.push({ code: "missing_maps_link", severity: "warning", placeIds: [place.id], message: "Place has identity/location data but no stored Maps link." });
    }
    if (hasDuplicateMedia(place)) {
      issues.push({ code: "duplicate_image", severity: "warning", placeIds: [place.id], message: "Duplicate image URL detected in stored media." });
    }
    if (
      (place.minPrice != null && place.maxPrice != null && place.minPrice > place.maxPrice) ||
      (place.pricing?.min != null && place.pricing?.max != null && place.pricing.min > place.pricing.max)
    ) {
      issues.push({ code: "invalid_price_range", severity: "error", placeIds: [place.id], message: "Minimum price is greater than maximum price." });
    }
    const age = dataAgeDays(place, now);
    if (place.dataStatus === "stale" || (age != null && age > 90)) {
      issues.push({ code: "stale_record", severity: "warning", placeIds: [place.id], message: "Stored record is stale and should be reviewed." });
    }
    if (validCoordinates && !nonBlank(place.area) && !nonBlank(place.soi)) {
      issues.push({ code: "missing_area_context", severity: "warning", placeIds: [place.id], message: "Coordinate-bearing record has no area or soi context." });
    }
    if (place.placeType === "chain" && place.localFavorite === true) {
      issues.push({ code: "local_chain_ambiguity", severity: "warning", placeIds: [place.id], message: "Chain classification conflicts with local-favorite metadata." });
    }
  }

  for (let index = 0; index < places.length; index += 1) {
    const first = places[index]!;
    if (!hasValidCoordinates(first)) continue;
    const firstName = normalizePlaceName(first.name);
    if (!firstName) continue;

    for (let otherIndex = index + 1; otherIndex < places.length; otherIndex += 1) {
      const second = places[otherIndex]!;
      if (first.id === second.id || !hasValidCoordinates(second)) continue;
      if (firstName !== normalizePlaceName(second.name)) continue;

      const distanceKm = haversineKm(
        { lat: first.latitude!, lng: first.longitude! },
        { lat: second.latitude!, lng: second.longitude! },
      );
      if (distanceKm > 0.1) continue;

      issues.push({
        code: "possible_duplicate_business",
        severity: "warning",
        placeIds: [first.id, second.id],
        message: "Nearby records have the same normalized business name.",
      });
    }
  }

  const duplicateCodes = new Set<DataHealthIssueCode>([
    "duplicate_id",
    "duplicate_slug",
    "duplicate_google_place_id",
    "possible_duplicate_business",
  ]);
  const reviewIds = new Set(issues.flatMap((issue) => issue.placeIds));

  return {
    total: places.length,
    status,
    withCoordinates,
    withMapsLink,
    withUsableImage,
    withHours,
    withPrice,
    duplicateCandidates: issues.filter((issue) => duplicateCodes.has(issue.code)).length,
    needsReview: reviewIds.size,
    issues,
  };
}
