import { haversineKm, normalizeText } from "@/lib/place-utils";
import type { Place } from "@/types/place";

export type CandidateIdentity = {
  name: string;
  sourceId?: string | null;
  googlePlaceId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
};

export type CandidateMatch = {
  placeId: string;
  score: number;
  reasons: string[];
};

function candidateCoordinates(candidate: CandidateIdentity) {
  if (
    candidate.latitude == null ||
    candidate.longitude == null ||
    !Number.isFinite(candidate.latitude) ||
    !Number.isFinite(candidate.longitude)
  ) {
    return null;
  }
  return { lat: candidate.latitude, lng: candidate.longitude };
}

function normalizedPhone(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

export function scoreCandidateAgainstPlace(
  place: Place,
  candidate: CandidateIdentity,
): CandidateMatch {
  let score = 0;
  const reasons: string[] = [];

  const identityMatch = Boolean(
    (candidate.sourceId &&
      (place.sourceId === candidate.sourceId || place.googlePlaceId === candidate.sourceId)) ||
      (candidate.googlePlaceId && place.googlePlaceId === candidate.googlePlaceId),
  );
  if (identityMatch) {
    score += 100;
    reasons.push("provider_identity");
  }

  const placeName = normalizeText(place.name);
  const candidateName = normalizeText(candidate.name);
  if (placeName && candidateName && placeName === candidateName) {
    score += 45;
    reasons.push("exact_name");
  } else if (
    placeName &&
    candidateName &&
    (placeName.includes(candidateName) || candidateName.includes(placeName))
  ) {
    score += 22;
    reasons.push("similar_name");
  }

  const coords = candidateCoordinates(candidate);
  if (
    coords &&
    place.latitude != null &&
    place.longitude != null &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude)
  ) {
    const distance = haversineKm(
      { lat: place.latitude, lng: place.longitude },
      coords,
    );
    if (distance <= 0.05) {
      score += 40;
      reasons.push("within_50m");
    } else if (distance <= 0.15) {
      score += 24;
      reasons.push("within_150m");
    } else if (distance <= 0.5) {
      score += 8;
      reasons.push("within_500m");
    } else {
      score -= 35;
      reasons.push("farther_than_500m");
    }
  }

  const candidateAddress = candidate.address ? normalizeText(candidate.address) : "";
  const placeAddress = place.address ? normalizeText(place.address) : "";
  if (candidateAddress && placeAddress && candidateAddress === placeAddress) {
    score += 20;
    reasons.push("exact_address");
  }

  const candidatePhone = normalizedPhone(candidate.phone);
  const placePhone = normalizedPhone(place.phone);
  if (candidatePhone && placePhone && candidatePhone === placePhone) {
    score += 25;
    reasons.push("exact_phone");
  }

  const candidateWebsite = candidate.website ? normalizeText(candidate.website) : "";
  const placeWebsite = place.website ? normalizeText(place.website) : "";
  if (candidateWebsite && placeWebsite && candidateWebsite === placeWebsite) {
    score += 20;
    reasons.push("exact_website");
  }

  return { placeId: place.id, score, reasons };
}

export function rankCandidateMatches(
  places: Place[],
  candidate: CandidateIdentity,
): CandidateMatch[] {
  return places
    .map((place) => scoreCandidateAgainstPlace(place, candidate))
    .sort((a, b) => b.score - a.score || a.placeId.localeCompare(b.placeId));
}

export function resolveCandidateMatch(
  places: Place[],
  candidate: CandidateIdentity,
): {
  matchedPlaceId: string | null;
  possibleMatchIds: string[];
  ambiguous: boolean;
  topScore: number;
} {
  const ranked = rankCandidateMatches(places, candidate);
  const first = ranked[0];
  const second = ranked[1];
  if (!first) {
    return { matchedPlaceId: null, possibleMatchIds: [], ambiguous: false, topScore: 0 };
  }

  const possibleMatchIds = ranked
    .filter((match) => match.score >= 45)
    .map((match) => match.placeId);
  const ambiguous = Boolean(
    first.score >= 65 &&
      second &&
      second.score >= 65 &&
      first.score - second.score < 10 &&
      first.score < 100,
  );

  if (first.score < 65 || ambiguous) {
    return {
      matchedPlaceId: null,
      possibleMatchIds,
      ambiguous,
      topScore: first.score,
    };
  }

  return {
    matchedPlaceId: first.placeId,
    possibleMatchIds: [],
    ambiguous: false,
    topScore: first.score,
  };
}
