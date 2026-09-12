import { saveVerifiedHomeOrigin } from "@/lib/home-origin";
import { runSharedGoogleTextSearch } from "@/lib/google-request-manager";
import { textSimilarity } from "@/lib/google-place-id-manager";
import { DORM_CENTER } from "@/lib/place-utils";
import type { GoogleDiscoveryCandidate } from "@/lib/google-live";
import type { HomeOrigin } from "@/types/place";

export type HomeOriginAssessment = {
  candidate: GoogleDiscoveryCandidate;
  score: number;
  nameScore: number;
  addressScore: number;
  bangkokEvidence: boolean;
  validCoordinates: boolean;
};

const HOME_NAME_TH = "บ้านสุภาอพาร์ทเม้นต์";
const HOME_ADDRESS_CLUES = ["รัชดาภิเษก 36", "จันทรเกษม", "จตุจักร", "กรุงเทพ", "bangkok"];

function validCoordinates(candidate: GoogleDiscoveryCandidate) {
  return candidate.latitude != null && candidate.longitude != null &&
    Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude) &&
    candidate.latitude >= -90 && candidate.latitude <= 90 &&
    candidate.longitude >= -180 && candidate.longitude <= 180;
}

export function assessHomeOriginCandidate(candidate: GoogleDiscoveryCandidate): HomeOriginAssessment {
  const nameScore = textSimilarity(HOME_NAME_TH, candidate.name) ?? 0;
  const addressText = (candidate.address || "").toLowerCase();
  const matchedClues = HOME_ADDRESS_CLUES.filter((clue) => addressText.includes(clue.toLowerCase())).length;
  const addressScore = Math.min(1, matchedClues / 2);
  const bangkokEvidence = /กรุงเทพ|bangkok/i.test(addressText);
  const coordinatesOk = validCoordinates(candidate);

  let score = nameScore * 65 + addressScore * 25;
  if (bangkokEvidence) score += 5;
  if (coordinatesOk) score += 5;

  return {
    candidate,
    score: Math.round(Math.min(100, score)),
    nameScore,
    addressScore,
    bangkokEvidence,
    validCoordinates: coordinatesOk,
  };
}

export function shouldAutoRecommendHomeOrigin(first: HomeOriginAssessment, second: HomeOriginAssessment | null) {
  if (!first.validCoordinates || !first.candidate.googlePlaceId) return false;
  if (!first.bangkokEvidence || first.addressScore < 0.5) return false;
  if (first.nameScore < 0.9 || first.score < 85) return false;
  if (second && first.score - second.score < 8) return false;
  return true;
}

export async function searchHomeOriginCandidates(input: {
  apiKey: string;
  language: "th" | "en";
}): Promise<HomeOriginAssessment[]> {
  const queries = [
    `${HOME_NAME_TH} รัชดาภิเษก 36 จันทรเกษม จตุจักร กรุงเทพมหานคร`,
    `${HOME_NAME_TH} Bangkok Thailand`,
  ];
  const byPlaceId = new Map<string, GoogleDiscoveryCandidate>();

  for (const query of queries) {
    const results = await runSharedGoogleTextSearch({
      apiKey: input.apiKey,
      query,
      center: DORM_CENTER,
      radiusMeters: 10000,
      language: input.language,
      maxResults: 8,
    });
    for (const result of results) {
      if (result.googlePlaceId) byPlaceId.set(result.googlePlaceId, result);
    }
    if (byPlaceId.size >= 8) break;
  }

  return Array.from(byPlaceId.values())
    .map(assessHomeOriginCandidate)
    .sort((a, b) => b.score - a.score);
}

export function homeOriginFromCandidate(candidate: GoogleDiscoveryCandidate): HomeOrigin {
  if (!candidate.googlePlaceId || !validCoordinates(candidate)) {
    throw new Error("Selected HOME candidate is missing a Google Place ID or valid coordinates");
  }
  const now = new Date().toISOString();
  return {
    id: "baan-supha-apartment",
    nameTh: HOME_NAME_TH,
    nameEn: candidate.name && candidate.name !== HOME_NAME_TH ? candidate.name : null,
    googlePlaceId: candidate.googlePlaceId,
    formattedAddress: candidate.address,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    googleMapsUrl: candidate.googleMapsUrl,
    resolvedAt: now,
    verifiedAt: now,
    source: "google_places",
  };
}

export async function confirmHomeOrigin(candidate: GoogleDiscoveryCandidate): Promise<HomeOrigin> {
  const origin = homeOriginFromCandidate(candidate);
  await saveVerifiedHomeOrigin(origin);
  return origin;
}
