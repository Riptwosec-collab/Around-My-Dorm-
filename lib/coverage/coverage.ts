import { scorePlaceDataQuality } from "@/lib/data-quality";
import { buildDataHealthSummary } from "@/lib/place-data/data-health";
import { DORM_CENTER, haversineKm } from "@/lib/place-utils";
import type { Place } from "@/types/place";

export type CoverageRingId = "r1" | "r2" | "r3" | "r4" | "r5";

export type CoverageGapCode =
  | "low_category_count"
  | "no_verified_category"
  | "missing_hours"
  | "missing_photo"
  | "missing_price"
  | "missing_maps"
  | "stale_records"
  | "duplicate_candidates";

export type CoverageRing = {
  id: CoverageRingId;
  minMeters: number;
  maxMeters: number;
  label: string;
};

export type CoverageGap = {
  id: string;
  code: CoverageGapCode;
  ringId: CoverageRingId;
  category: string | null;
  count: number;
  total: number;
  severity: "low" | "medium" | "high";
  message: string;
};

export type CoverageRingSummary = {
  ring: CoverageRing;
  placeIds: string[];
  total: number;
  byCategory: Record<string, number>;
  verified: number;
  coordinateCoverage: number;
  mapsCoverage: number;
  imageCoverage: number;
  hoursCoverage: number;
  priceCoverage: number;
  stale: number;
  duplicateCandidates: number;
  gaps: CoverageGap[];
};

export type CoverageReport = {
  totalPlaces: number;
  rings: CoverageRingSummary[];
  gaps: CoverageGap[];
};

export const COVERAGE_RINGS: CoverageRing[] = [
  { id: "r1", minMeters: 0, maxMeters: 500, label: "0–500 m" },
  { id: "r2", minMeters: 500, maxMeters: 1000, label: "500 m–1 km" },
  { id: "r3", minMeters: 1000, maxMeters: 2000, label: "1–2 km" },
  { id: "r4", minMeters: 2000, maxMeters: 3000, label: "2–3 km" },
  { id: "r5", minMeters: 3000, maxMeters: 5000, label: "3–5 km" },
];

export const COVERAGE_CATEGORY_MINIMUMS: Partial<Record<CoverageRingId, Record<string, number>>> = {
  r1: { food: 3, noodle: 1, cafe: 1, mookata: 1, hotpot: 1, parking: 1 },
  r2: { food: 5, noodle: 2, cafe: 2, mookata: 1, hotpot: 1, parking: 1 },
  r3: { food: 8, noodle: 3, cafe: 3, mookata: 1, hotpot: 1, parking: 2 },
};

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

function hasMapsIdentity(place: Place) {
  return Boolean(
    place.googlePlaceId?.trim() ||
      place.googleMapsUrl?.trim() ||
      place.googleMaps?.url?.trim(),
  );
}

function percent(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function ringContains(ring: CoverageRing, meters: number) {
  if (meters < ring.minMeters) return false;
  if (ring.id === "r5") return meters <= ring.maxMeters;
  return meters < ring.maxMeters;
}

function severityForCoverage(value: number): CoverageGap["severity"] {
  if (value < 40) return "high";
  if (value < 70) return "medium";
  return "low";
}

function completenessGap(
  ring: CoverageRing,
  code: Extract<CoverageGapCode, "missing_hours" | "missing_photo" | "missing_price" | "missing_maps">,
  coverage: number,
  total: number,
): CoverageGap | null {
  if (!total || coverage >= 70) return null;
  const labels: Record<typeof code, string> = {
    missing_hours: "opening-hours",
    missing_photo: "photo",
    missing_price: "price",
    missing_maps: "Maps identity/link",
  };
  return {
    id: `${ring.id}:${code}`,
    code,
    ringId: ring.id,
    category: null,
    count: total - Math.round((coverage / 100) * total),
    total,
    severity: severityForCoverage(coverage),
    message: `${ring.label} has only ${coverage}% ${labels[code]} coverage.`,
  };
}

function buildRingSummary(
  ring: CoverageRing,
  places: Place[],
  now: number,
): CoverageRingSummary {
  const byCategory: Record<string, number> = {};
  let verified = 0;
  let coordinates = 0;
  let maps = 0;
  let images = 0;
  let hours = 0;
  let prices = 0;

  for (const place of places) {
    byCategory[place.category] = (byCategory[place.category] ?? 0) + 1;
    if (place.verified || place.dataStatus === "verified") verified += 1;
    if (hasValidCoordinates(place)) coordinates += 1;
    if (hasMapsIdentity(place)) maps += 1;

    const quality = scorePlaceDataQuality(place);
    if (!quality.missing.includes("photo")) images += 1;
    if (!quality.missing.includes("openingHours")) hours += 1;
    if (!quality.missing.includes("price")) prices += 1;
  }

  const health = buildDataHealthSummary(places, now);
  const total = places.length;
  const gaps: CoverageGap[] = [];
  const minimums = COVERAGE_CATEGORY_MINIMUMS[ring.id] ?? {};

  for (const [category, minimum] of Object.entries(minimums)) {
    const count = byCategory[category] ?? 0;
    if (count < minimum) {
      gaps.push({
        id: `${ring.id}:low_category_count:${category}`,
        code: "low_category_count",
        ringId: ring.id,
        category,
        count,
        total: minimum,
        severity: count === 0 ? "high" : "medium",
        message: `${ring.label} has ${count}/${minimum} target places for ${category}.`,
      });
    }

    if (count > 0) {
      const verifiedInCategory = places.filter(
        (place) =>
          place.category === category &&
          (place.verified || place.dataStatus === "verified"),
      ).length;
      if (verifiedInCategory === 0) {
        gaps.push({
          id: `${ring.id}:no_verified_category:${category}`,
          code: "no_verified_category",
          ringId: ring.id,
          category,
          count: 0,
          total: count,
          severity: "medium",
          message: `${ring.label} has no verified ${category} place.`,
        });
      }
    }
  }

  const imageCoverage = percent(images, total);
  const hoursCoverage = percent(hours, total);
  const priceCoverage = percent(prices, total);
  const mapsCoverage = percent(maps, total);
  for (const gap of [
    completenessGap(ring, "missing_hours", hoursCoverage, total),
    completenessGap(ring, "missing_photo", imageCoverage, total),
    completenessGap(ring, "missing_price", priceCoverage, total),
    completenessGap(ring, "missing_maps", mapsCoverage, total),
  ]) {
    if (gap) gaps.push(gap);
  }

  if (health.status.stale > 0) {
    gaps.push({
      id: `${ring.id}:stale_records`,
      code: "stale_records",
      ringId: ring.id,
      category: null,
      count: health.status.stale,
      total,
      severity: health.status.stale === total ? "high" : "medium",
      message: `${ring.label} has ${health.status.stale} stale record(s).`,
    });
  }

  if (health.duplicateCandidates > 0) {
    gaps.push({
      id: `${ring.id}:duplicate_candidates`,
      code: "duplicate_candidates",
      ringId: ring.id,
      category: null,
      count: health.duplicateCandidates,
      total,
      severity: "high",
      message: `${ring.label} has ${health.duplicateCandidates} duplicate candidate issue(s).`,
    });
  }

  return {
    ring,
    placeIds: places.map((place) => place.id),
    total,
    byCategory,
    verified,
    coordinateCoverage: percent(coordinates, total),
    mapsCoverage,
    imageCoverage,
    hoursCoverage,
    priceCoverage,
    stale: health.status.stale,
    duplicateCandidates: health.duplicateCandidates,
    gaps,
  };
}

export function buildCoverageReport(
  places: Place[],
  origin: { lat: number; lng: number } = DORM_CENTER,
  now = Date.now(),
): CoverageReport {
  const byRing = new Map<CoverageRingId, Place[]>(
    COVERAGE_RINGS.map((ring) => [ring.id, []]),
  );

  for (const place of places) {
    if (!hasValidCoordinates(place)) continue;
    const meters =
      haversineKm(origin, { lat: place.latitude!, lng: place.longitude! }) * 1000;
    const ring = COVERAGE_RINGS.find((candidate) => ringContains(candidate, meters));
    if (ring) byRing.get(ring.id)!.push(place);
  }

  const rings = COVERAGE_RINGS.map((ring) =>
    buildRingSummary(ring, byRing.get(ring.id) ?? [], now),
  );

  return {
    totalPlaces: places.length,
    rings,
    gaps: rings.flatMap((ring) => ring.gaps),
  };
}
