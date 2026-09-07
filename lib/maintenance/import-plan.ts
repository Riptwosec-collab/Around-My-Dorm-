import type { Place } from "@/types/place";
import { PROVIDER_CAPABILITIES } from "@/lib/data-governance";
import { diffPlace, possibleDuplicate, type PlaceUpdateDiff } from "@/lib/place-update-engine";
import { haversineKm, normalizeText } from "@/lib/place-utils";

export type ImportCandidate = Partial<Place> & {
  name: string;
  sourceProvider: string;
  sourceId?: string | null;
  sourceUrl?: string | null;
};

export type NewPlaceCandidate = {
  candidate: ImportCandidate;
  duplicateIds: string[];
  confidence: "new" | "possible_duplicate";
};

export type ImportPlan = {
  provider: string;
  scanned: number;
  matched: number;
  newPlaces: NewPlaceCandidate[];
  diffs: PlaceUpdateDiff[];
  rejected: Array<{ candidate: ImportCandidate; reason: string }>;
};

function candidateCoordinates(candidate: ImportCandidate) {
  if (candidate.latitude == null || candidate.longitude == null) return null;
  return { lat: candidate.latitude, lng: candidate.longitude };
}

function identityScore(existing: Place, candidate: ImportCandidate) {
  let score = 0;
  if (candidate.sourceId && (existing.sourceId === candidate.sourceId || existing.googlePlaceId === candidate.sourceId)) score += 100;
  if (normalizeText(existing.name) === normalizeText(candidate.name)) score += 45;
  else if (normalizeText(existing.name).includes(normalizeText(candidate.name)) || normalizeText(candidate.name).includes(normalizeText(existing.name))) score += 22;
  const coords = candidateCoordinates(candidate);
  if (coords && existing.latitude != null && existing.longitude != null) {
    const distance = haversineKm({ lat: existing.latitude, lng: existing.longitude }, coords);
    if (distance <= 0.05) score += 40;
    else if (distance <= 0.15) score += 24;
    else if (distance <= 0.5) score += 8;
    else score -= 35;
  }
  if (candidate.address && existing.address && normalizeText(candidate.address) === normalizeText(existing.address)) score += 20;
  if (candidate.phone && existing.phone && candidate.phone.replace(/\D/g, "") === existing.phone.replace(/\D/g, "")) score += 25;
  if (candidate.website && existing.website && normalizeText(candidate.website) === normalizeText(existing.website)) score += 20;
  return score;
}

function matchExisting(places: Place[], candidate: ImportCandidate) {
  const ranked = places.map((place) => ({ place, score: identityScore(place, candidate) })).sort((a, b) => b.score - a.score);
  const first = ranked[0];
  const second = ranked[1];
  if (!first || first.score < 65) return null;
  if (second && first.score - second.score < 10 && first.score < 100) return null;
  return first.place;
}

function persistablePatch(candidate: ImportCandidate) {
  const policy = PROVIDER_CAPABILITIES[candidate.sourceProvider];
  if (!policy?.canPersistPlaces) return null;
  const patch: Partial<Place> = { ...candidate };
  delete (patch as Record<string, unknown>).sourceProvider;
  if (!policy.canPersistPhotos) {
    delete patch.image;
    delete patch.coverImage;
    delete patch.images;
    delete patch.galleryImages;
    delete patch.imageMetadata;
  }
  if (!policy.canPersistRatings) {
    delete patch.rating;
    delete patch.reviewCount;
  }
  if (!policy.canPersistHours) {
    delete patch.openingHours;
    delete patch.structuredOpeningHours;
    delete patch.openingHoursText;
    delete patch.liveOpenNow;
  }
  patch.sourceId = candidate.sourceId ?? patch.sourceId ?? null;
  patch.sourceUrl = candidate.sourceUrl ?? patch.sourceUrl ?? null;
  patch.lastChecked = new Date().toISOString();
  return patch;
}

export function buildImportPlan(places: Place[], candidates: ImportCandidate[], provider: string): ImportPlan {
  const plan: ImportPlan = { provider, scanned: candidates.length, matched: 0, newPlaces: [], diffs: [], rejected: [] };
  const providerPolicy = PROVIDER_CAPABILITIES[provider];
  if (!providerPolicy?.canPersistPlaces) {
    for (const candidate of candidates) plan.rejected.push({ candidate, reason: `Provider ${provider} is not approved for permanent place storage.` });
    return plan;
  }

  for (const candidate of candidates) {
    if (candidate.sourceProvider !== provider) {
      plan.rejected.push({ candidate, reason: "Candidate provider does not match import provider." });
      continue;
    }
    const patch = persistablePatch(candidate);
    if (!patch) {
      plan.rejected.push({ candidate, reason: "Provider persistence policy rejected this record." });
      continue;
    }
    const existing = matchExisting(places, candidate);
    if (existing) {
      plan.matched += 1;
      const diff = diffPlace(existing, patch, provider);
      if (diff) plan.diffs.push(diff);
      continue;
    }

    const temp = {
      ...(places[0] || {}),
      ...candidate,
      id: candidate.id || `candidate-${normalizeText(candidate.name).replace(/\s+/g, "-")}`,
      name: candidate.name,
    } as Place;
    const duplicateIds = places.filter((place) => possibleDuplicate(place, temp)).map((place) => place.id);
    plan.newPlaces.push({ candidate, duplicateIds, confidence: duplicateIds.length ? "possible_duplicate" : "new" });
  }
  return plan;
}
