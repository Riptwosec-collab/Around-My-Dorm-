import { COVERAGE_RINGS, type CoverageRingId } from "@/lib/coverage/coverage";
import { scorePlaceDataQuality } from "@/lib/data-quality";
import type { PlaceCandidate } from "@/lib/maintenance/place-candidates";
import { buildDataHealthSummary, type DataHealthIssueCode } from "@/lib/place-data/data-health";
import { DORM_CENTER, haversineKm } from "@/lib/place-utils";
import type { PlaceUpdateDiff } from "@/lib/place-update-engine";
import type { Place } from "@/types/place";

export type ReviewPriority = "p0" | "p1" | "p2" | "p3";
export type ReviewReason =
  | "new_place"
  | "invalid_coordinates"
  | "identity_conflict"
  | "possible_duplicate"
  | "category_mismatch"
  | "local_chain_ambiguity"
  | "missing_maps"
  | "missing_hours"
  | "stale_record"
  | "missing_photo"
  | "missing_price"
  | "high_risk_change";

export type ReviewQueueItem = {
  id: string;
  kind: "place" | "candidate" | "change";
  entityId: string;
  title: string;
  priority: ReviewPriority;
  reasons: ReviewReason[];
  category: string | null;
  source: string | null;
  ringId: CoverageRingId | null;
  createdAt: string | null;
};

export type ReviewQueueFilters = {
  priorities?: ReviewPriority[];
  reasons?: ReviewReason[];
  category?: string | null;
  ringId?: CoverageRingId | null;
  source?: string | null;
};

const PRIORITY_WEIGHT: Record<ReviewPriority, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
const REASON_PRIORITY: Record<ReviewReason, ReviewPriority> = {
  invalid_coordinates: "p0",
  identity_conflict: "p0",
  possible_duplicate: "p1",
  category_mismatch: "p1",
  local_chain_ambiguity: "p1",
  high_risk_change: "p1",
  missing_maps: "p2",
  missing_hours: "p2",
  stale_record: "p2",
  new_place: "p3",
  missing_photo: "p3",
  missing_price: "p3",
};

const HEALTH_REASON: Partial<Record<DataHealthIssueCode, ReviewReason>> = {
  duplicate_id: "identity_conflict",
  duplicate_slug: "identity_conflict",
  duplicate_google_place_id: "identity_conflict",
  invalid_coordinates: "invalid_coordinates",
  category_mismatch: "category_mismatch",
  missing_maps_link: "missing_maps",
  stale_record: "stale_record",
  local_chain_ambiguity: "local_chain_ambiguity",
  possible_duplicate_business: "possible_duplicate",
};

function validCoordinates(latitude: number | null | undefined, longitude: number | null | undefined) {
  return (
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function ringForCoordinates(latitude: number | null | undefined, longitude: number | null | undefined): CoverageRingId | null {
  if (!validCoordinates(latitude, longitude)) return null;
  const meters = haversineKm(DORM_CENTER, { lat: latitude!, lng: longitude! }) * 1000;
  const ring = COVERAGE_RINGS.find((candidate) => {
    if (meters < candidate.minMeters) return false;
    return candidate.id === "r5" ? meters <= candidate.maxMeters : meters < candidate.maxMeters;
  });
  return ring?.id ?? null;
}

function highestPriority(reasons: Iterable<ReviewReason>): ReviewPriority {
  let result: ReviewPriority = "p3";
  for (const reason of reasons) {
    if (PRIORITY_WEIGHT[REASON_PRIORITY[reason]] < PRIORITY_WEIGHT[result]) result = REASON_PRIORITY[reason];
  }
  return result;
}

function placeTimestamp(place: Place) {
  return place.lastChecked || place.lastUpdated || place.lastVerified || null;
}

function sortQueue(items: ReviewQueueItem[]) {
  return items.sort((a, b) => {
    const priority = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    if (priority !== 0) return priority;
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : Number.NEGATIVE_INFINITY;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : Number.NEGATIVE_INFINITY;
    const normalizedATime = Number.isFinite(aTime) ? aTime : Number.NEGATIVE_INFINITY;
    const normalizedBTime = Number.isFinite(bTime) ? bTime : Number.NEGATIVE_INFINITY;
    if (normalizedATime !== normalizedBTime) return normalizedATime - normalizedBTime;
    return a.title.localeCompare(b.title, "th");
  });
}

function addReason(map: Map<string, Set<ReviewReason>>, entityId: string, reason: ReviewReason) {
  const reasons = map.get(entityId) ?? new Set<ReviewReason>();
  reasons.add(reason);
  map.set(entityId, reasons);
}

export function buildReviewQueue(input: {
  places: Place[];
  candidates: PlaceCandidate[];
  pendingChanges?: PlaceUpdateDiff[];
  now?: number;
}): ReviewQueueItem[] {
  const now = input.now ?? Date.now();
  const result: ReviewQueueItem[] = [];
  const placeReasons = new Map<string, Set<ReviewReason>>();
  const health = buildDataHealthSummary(input.places, now);

  for (const issue of health.issues) {
    const reason = HEALTH_REASON[issue.code];
    if (!reason) continue;
    for (const placeId of issue.placeIds) addReason(placeReasons, placeId, reason);
  }

  for (const place of input.places) {
    const quality = scorePlaceDataQuality(place);
    if (quality.missing.includes("openingHours")) addReason(placeReasons, place.id, "missing_hours");
    if (quality.missing.includes("photo")) addReason(placeReasons, place.id, "missing_photo");
    if (quality.missing.includes("price")) addReason(placeReasons, place.id, "missing_price");
  }

  for (const place of input.places) {
    const reasons = placeReasons.get(place.id);
    if (!reasons?.size) continue;
    result.push({
      id: `place:${place.id}`,
      kind: "place",
      entityId: place.id,
      title: place.name,
      priority: highestPriority(reasons),
      reasons: [...reasons].sort((a, b) => PRIORITY_WEIGHT[REASON_PRIORITY[a]] - PRIORITY_WEIGHT[REASON_PRIORITY[b]] || a.localeCompare(b)),
      category: place.category || null,
      source: place.source?.[0] ?? null,
      ringId: ringForCoordinates(place.latitude, place.longitude),
      createdAt: placeTimestamp(place),
    });
  }

  for (const candidate of input.candidates) {
    if (candidate.status === "approved" || candidate.status === "rejected" || candidate.status === "merged") continue;
    const reasons = new Set<ReviewReason>();
    if (candidate.status === "new") reasons.add("new_place");
    if (candidate.possibleMatchIds.length || candidate.validationIssues.some((issue) => issue.code === "possible_duplicate")) {
      reasons.add("possible_duplicate");
    }
    for (const issue of candidate.validationIssues) {
      if (issue.code === "invalid_coordinates") reasons.add("invalid_coordinates");
      if (issue.code === "missing_category") reasons.add("category_mismatch");
      if (issue.code === "missing_name" || issue.code === "source_conflict") reasons.add("identity_conflict");
    }
    if (!reasons.size) reasons.add("new_place");
    result.push({
      id: `candidate:${candidate.id}`,
      kind: "candidate",
      entityId: candidate.id,
      title: candidate.proposedPlace.name,
      priority: highestPriority(reasons),
      reasons: [...reasons].sort((a, b) => PRIORITY_WEIGHT[REASON_PRIORITY[a]] - PRIORITY_WEIGHT[REASON_PRIORITY[b]] || a.localeCompare(b)),
      category: candidate.proposedPlace.category ?? null,
      source: candidate.sourceProvider || null,
      ringId: ringForCoordinates(candidate.proposedPlace.latitude, candidate.proposedPlace.longitude),
      createdAt: candidate.createdAt,
    });
  }

  for (const change of input.pendingChanges ?? []) {
    if (change.risk !== "high" && !change.fields.some((field) => field.risk === "high")) continue;
    result.push({
      id: `change:${change.id}`,
      kind: "change",
      entityId: change.id,
      title: change.placeName,
      priority: "p1",
      reasons: ["high_risk_change"],
      category: input.places.find((place) => place.id === change.placeId)?.category ?? null,
      source: change.source || null,
      ringId: (() => {
        const place = input.places.find((item) => item.id === change.placeId);
        return place ? ringForCoordinates(place.latitude, place.longitude) : null;
      })(),
      createdAt: change.detectedAt || null,
    });
  }

  return sortQueue(result);
}

export function filterReviewQueue(items: ReviewQueueItem[], filters: ReviewQueueFilters): ReviewQueueItem[] {
  const priorities = filters.priorities?.length ? new Set(filters.priorities) : null;
  const reasons = filters.reasons?.length ? new Set(filters.reasons) : null;
  return items.filter((item) => {
    if (priorities && !priorities.has(item.priority)) return false;
    if (reasons && !item.reasons.some((reason) => reasons.has(reason))) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.ringId && item.ringId !== filters.ringId) return false;
    if (filters.source && item.source !== filters.source) return false;
    return true;
  });
}
