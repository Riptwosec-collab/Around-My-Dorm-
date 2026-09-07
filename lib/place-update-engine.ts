import type { CategoryId, Place } from "@/types/place";
import { haversineKm, normalizeText } from "@/lib/place-utils";
import { freshnessState, shouldRefresh, type FreshnessState } from "@/lib/data-governance";

export type UpdateMode = "all" | "older14" | "older30" | "older90" | "restaurants_cafes" | "parking" | "category" | "area" | "selected";
export type ChangeRisk = "safe" | "review" | "high";

export type FieldDiff = {
  field: keyof Place | string;
  previousValue: unknown;
  incomingValue: unknown;
  risk: ChangeRisk;
};

export type PlaceUpdateDiff = {
  id: string;
  placeId: string;
  placeName: string;
  source: string;
  detectedAt: string;
  fields: FieldDiff[];
  risk: ChangeRisk;
};

export type MaintenanceSummary = {
  scanned: number;
  verified: number;
  stale: number;
  unverified: number;
  needsReview: number;
  freshness: Record<FreshnessState, number>;
};

const REVIEW_FIELDS = new Set(["openingHours", "openingHoursText", "priceText", "minPrice", "maxPrice", "averagePricePerPerson", "rating", "reviewCount", "images", "coverImage", "parking"]);
const HIGH_RISK_FIELDS = new Set(["name", "category", "categories", "latitude", "longitude", "address", "permanentlyClosed", "temporaryClosed"]);

function equalValue(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffPlace(existing: Place, incoming: Partial<Place>, source: string): PlaceUpdateDiff | null {
  const fields: FieldDiff[] = [];
  for (const [field, incomingValue] of Object.entries(incoming)) {
    if (incomingValue === undefined || field === "id") continue;
    const previousValue = (existing as unknown as Record<string, unknown>)[field];
    if (equalValue(previousValue, incomingValue)) continue;
    const risk: ChangeRisk = HIGH_RISK_FIELDS.has(field) ? "high" : REVIEW_FIELDS.has(field) ? "review" : "safe";
    fields.push({ field, previousValue, incomingValue, risk });
  }
  if (!fields.length) return null;
  const risk: ChangeRisk = fields.some((item) => item.risk === "high") ? "high" : fields.some((item) => item.risk === "review") ? "review" : "safe";
  return {
    id: `${existing.id}-${Date.now()}`,
    placeId: existing.id,
    placeName: existing.name,
    source,
    detectedAt: new Date().toISOString(),
    fields,
    risk,
  };
}

export function selectPlacesForUpdate(
  places: Place[],
  mode: UpdateMode,
  options: { selectedIds?: string[]; category?: CategoryId | null; area?: string | null } = {},
) {
  const now = Date.now();
  const ageDays = (place: Place) => {
    const raw = place.lastChecked || place.lastUpdated || place.lastVerified;
    if (!raw) return Number.POSITIVE_INFINITY;
    const time = new Date(raw).getTime();
    return Number.isFinite(time) ? Math.max(0, (now - time) / 86_400_000) : Number.POSITIVE_INFINITY;
  };
  if (mode === "all") return places;
  if (mode === "older14") return places.filter((place) => ageDays(place) > 14);
  if (mode === "older30") return places.filter((place) => ageDays(place) > 30);
  if (mode === "older90") return places.filter((place) => ageDays(place) > 90);
  if (mode === "restaurants_cafes") return places.filter((place) => place.categories.some((category) => ["food", "local_food", "cafe", "bar", "night_food", "mookata", "hotpot", "bbq"].includes(category)));
  if (mode === "parking") return places.filter((place) => place.categories.includes("parking") || place.categories.includes("monthly_parking"));
  if (mode === "category") return options.category ? places.filter((place) => place.categories.includes(options.category as CategoryId)) : [];
  if (mode === "area") {
    const area = normalizeText(options.area || "");
    return area ? places.filter((place) => normalizeText(`${place.area} ${place.soi || ""} ${place.address || ""}`).includes(area)) : [];
  }
  const ids = new Set(options.selectedIds || []);
  return places.filter((place) => ids.has(place.id));
}

export function auditPlaces(places: Place[]): MaintenanceSummary {
  const freshness: Record<FreshnessState, number> = { fresh: 0, verified: 0, aging: 0, stale: 0, unverified: 0 };
  for (const place of places) freshness[freshnessState(place)] += 1;
  return {
    scanned: places.length,
    verified: places.filter((place) => place.verified).length,
    stale: freshness.stale,
    unverified: freshness.unverified,
    needsReview: places.filter((place) => shouldRefresh(place) || !place.verified).length,
    freshness,
  };
}

export function possibleDuplicate(a: Place, b: Place) {
  if (a.id === b.id) return false;
  const nameA = normalizeText(a.name);
  const nameB = normalizeText(b.name);
  const similarName = nameA === nameB || (nameA.length >= 5 && nameB.length >= 5 && (nameA.includes(nameB) || nameB.includes(nameA)));
  if (!similarName || a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return false;
  return haversineKm({ lat: a.latitude, lng: a.longitude }, { lat: b.latitude, lng: b.longitude }) <= 0.05;
}

export function findDuplicatePairs(places: Place[]) {
  const pairs: Array<{ a: Place; b: Place }> = [];
  for (let i = 0; i < places.length; i += 1) {
    for (let j = i + 1; j < places.length; j += 1) {
      if (possibleDuplicate(places[i], places[j])) pairs.push({ a: places[i], b: places[j] });
    }
  }
  return pairs;
}
