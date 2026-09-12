import { ensureCloudUser, supabase } from "@/lib/cloud/supabase";
import { getGoogleApiControlSettings, hydrateGoogleApiControlSettings } from "@/lib/google-api-control";
import {
  assessGooglePlaceMatch,
  buildGoogleMatchQuery,
  isChainPlace,
  textSimilarity,
  type GooglePlaceMatchAssessment,
} from "@/lib/google-place-id-manager";
import type { GoogleDiscoveryCandidate, GoogleLiveDetails } from "@/lib/google-live";
import {
  getGoogleRequestUsage,
  hydrateGoogleRequestLogs,
  runGoogleSinglePlaceDetails,
  runGoogleTextSearchRequest,
} from "@/lib/google-request-manager";
import { DORM_CENTER } from "@/lib/place-utils";
import type { FieldProvenanceEntry, Place } from "@/types/place";

export const GOOGLE_CLOUD_CACHE_TTL_DAYS = 29;
export const GOOGLE_CLOUD_CACHE_TTL_MS = GOOGLE_CLOUD_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
export const GOOGLE_AUTO_MATCH_THRESHOLD = 75;

type MatchRow = {
  place_id: string;
  google_place_id: string | null;
  status: string;
  confidence: number | null;
  candidate: Record<string, unknown> | null;
  candidate_expires_at: string | null;
  updated_at: string;
};

type CacheRow = {
  place_id: string;
  google_place_id: string;
  payload: GoogleCloudPlacePayload;
  fetched_at: string;
  expires_at: string;
};

export type GoogleCloudPlacePayload = {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewCount: number | null;
  openNow: boolean | null;
  openingHoursText: string[];
  phone: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  priceLevel: string | null;
  businessStatus: string | null;
  fetchedAt: string;
};

export type GoogleCloudEnrichmentStatus = {
  total: number;
  linked: number;
  missingPlaceId: number;
  review: number;
  freshCache: number;
  expiredCache: number;
  estimatedSearchRequests: number;
  estimatedDetailRequests: number;
  estimatedMaxRequests: number;
  lastFetchedAt: string | null;
};

export type GoogleCloudEnrichmentProgress = {
  current: number;
  total: number;
  currentName: string | null;
  networkRequests: number;
  linked: number;
  cached: number;
  review: number;
  failed: number;
};

export type GoogleCloudEnrichmentResult = GoogleCloudEnrichmentProgress & {
  cancelled: boolean;
  stoppedByLimit: boolean;
  stoppedReason: string | null;
};

type CandidateAssessment = {
  candidate: GoogleDiscoveryCandidate;
  assessment: GooglePlaceMatchAssessment;
  areaScore: number | null;
};

function isFresh(expiresAt: string | null | undefined) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now());
}

function safePayload(value: unknown): GoogleCloudPlacePayload | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<GoogleCloudPlacePayload>;
  if (typeof record.fetchedAt !== "string") return null;
  return {
    address: typeof record.address === "string" ? record.address : null,
    latitude: typeof record.latitude === "number" ? record.latitude : null,
    longitude: typeof record.longitude === "number" ? record.longitude : null,
    rating: typeof record.rating === "number" ? record.rating : null,
    reviewCount: typeof record.reviewCount === "number" ? record.reviewCount : null,
    openNow: typeof record.openNow === "boolean" ? record.openNow : null,
    openingHoursText: Array.isArray(record.openingHoursText) ? record.openingHoursText.map(String) : [],
    phone: typeof record.phone === "string" ? record.phone : null,
    website: typeof record.website === "string" ? record.website : null,
    googleMapsUrl: typeof record.googleMapsUrl === "string" ? record.googleMapsUrl : null,
    priceLevel: typeof record.priceLevel === "string" ? record.priceLevel : null,
    businessStatus: typeof record.businessStatus === "string" ? record.businessStatus : null,
    fetchedAt: record.fetchedAt,
  };
}

export function sanitizeGoogleLiveDetails(live: GoogleLiveDetails): GoogleCloudPlacePayload {
  return {
    address: live.address,
    latitude: live.latitude,
    longitude: live.longitude,
    rating: live.rating,
    reviewCount: live.reviewCount,
    openNow: live.openNow,
    openingHoursText: live.openingHoursText,
    phone: live.phone,
    website: live.website,
    googleMapsUrl: live.googleMapsUrl,
    priceLevel: live.priceLevel,
    businessStatus: live.businessStatus,
    fetchedAt: live.fetchedAt,
  };
}

function googleProvenance(fetchedAt: string, googlePlaceId: string): FieldProvenanceEntry {
  return {
    source: "google_places_live",
    checkedAt: fetchedAt,
    confidence: "high",
    sourceId: googlePlaceId,
  };
}

export function mergeGoogleCloudPayload(place: Place, googlePlaceId: string, payload: GoogleCloudPlacePayload): Place {
  const next: Place = { ...place };
  const provenance = { ...(place.fieldProvenance || {}) };
  const mark = (field: string) => { provenance[field] = googleProvenance(payload.fetchedAt, googlePlaceId); };

  next.googlePlaceId = place.googlePlaceId || googlePlaceId;
  next.googleMaps = {
    placeId: googlePlaceId,
    url: place.googleMaps?.url || payload.googleMapsUrl || place.googleMapsUrl || null,
    latitude: place.googleMaps?.latitude ?? payload.latitude,
    longitude: place.googleMaps?.longitude ?? payload.longitude,
  };
  mark("googlePlaceId");

  if (!next.address && payload.address) { next.address = payload.address; mark("address"); }
  if (next.latitude == null && payload.latitude != null) { next.latitude = payload.latitude; mark("latitude"); }
  if (next.longitude == null && payload.longitude != null) { next.longitude = payload.longitude; mark("longitude"); }
  if (next.rating == null && payload.rating != null) { next.rating = payload.rating; mark("rating"); }
  if (next.reviewCount == null && payload.reviewCount != null) { next.reviewCount = payload.reviewCount; mark("reviewCount"); }
  if (next.liveOpenNow == null && payload.openNow != null) { next.liveOpenNow = payload.openNow; mark("liveOpenNow"); }
  if (!next.openingHoursText && payload.openingHoursText.length) { next.openingHoursText = payload.openingHoursText.join("\n"); mark("openingHoursText"); }
  if (!next.phone && payload.phone) { next.phone = payload.phone; mark("phone"); }
  if (!next.website && payload.website) { next.website = payload.website; mark("website"); }
  if (!next.googleMapsUrl && payload.googleMapsUrl) { next.googleMapsUrl = payload.googleMapsUrl; mark("googleMapsUrl"); }

  const businessStatus = (payload.businessStatus || "").toUpperCase();
  if (businessStatus.includes("PERMANENT")) { next.permanentlyClosed = true; mark("permanentlyClosed"); }
  if (businessStatus.includes("TEMPORAR")) { next.temporaryClosed = true; mark("temporaryClosed"); }

  next.source = Array.from(new Set([...(place.source || []), "google_places_live"]));
  next.lastChecked = payload.fetchedAt;
  next.fieldProvenance = provenance;
  return next;
}

async function loadCloudRows(userId: string) {
  const [matchesResult, cacheResult] = await Promise.all([
    supabase
      .from("amd_google_place_matches")
      .select("place_id,google_place_id,status,confidence,candidate,candidate_expires_at,updated_at")
      .eq("user_id", userId),
    supabase
      .from("amd_google_place_cache")
      .select("place_id,google_place_id,payload,fetched_at,expires_at")
      .eq("user_id", userId),
  ]);
  if (matchesResult.error) throw matchesResult.error;
  if (cacheResult.error) throw cacheResult.error;
  return {
    matches: (matchesResult.data || []) as MatchRow[],
    cache: (cacheResult.data || []) as CacheRow[],
  };
}

export async function applyGoogleCloudPlaceLayer(places: Place[]): Promise<Place[]> {
  if (!places.length) return places;
  const user = await ensureCloudUser();
  const { matches, cache } = await loadCloudRows(user.id);
  const linkedByPlace = new Map(matches.filter((row) => row.status === "linked" && row.google_place_id).map((row) => [row.place_id, row.google_place_id as string]));
  const freshCacheByPlace = new Map(
    cache.filter((row) => isFresh(row.expires_at)).map((row) => [row.place_id, row]),
  );

  return places.map((place) => {
    const linkedId = place.googlePlaceId || linkedByPlace.get(place.id) || null;
    if (!linkedId) return place;
    const row = freshCacheByPlace.get(place.id);
    const payload = row && row.google_place_id === linkedId ? safePayload(row.payload) : null;
    if (!payload) {
      return {
        ...place,
        googlePlaceId: linkedId,
        googleMaps: place.googleMaps || { placeId: linkedId, url: place.googleMapsUrl || null, latitude: place.latitude, longitude: place.longitude },
      };
    }
    return mergeGoogleCloudPayload(place, linkedId, payload);
  });
}

export async function loadGoogleCloudEnrichmentStatus(places: Place[]): Promise<GoogleCloudEnrichmentStatus> {
  const user = await ensureCloudUser();
  const { matches, cache } = await loadCloudRows(user.id);
  const placeIds = new Set(places.map((place) => place.id));
  const linkedRows = matches.filter((row) => placeIds.has(row.place_id) && row.status === "linked" && row.google_place_id);
  const linkedByPlace = new Map(linkedRows.map((row) => [row.place_id, row.google_place_id as string]));
  const linkedCount = places.filter((place) => Boolean(place.googlePlaceId || linkedByPlace.get(place.id))).length;
  const review = matches.filter((row) => placeIds.has(row.place_id) && row.status === "review").length;
  const fresh = cache.filter((row) => placeIds.has(row.place_id) && isFresh(row.expires_at));
  const expired = cache.filter((row) => placeIds.has(row.place_id) && !isFresh(row.expires_at));
  const freshIds = new Set(fresh.map((row) => row.place_id));
  const missingPlaceId = Math.max(0, places.length - linkedCount);
  const linkedWithoutFreshCache = places.filter((place) => {
    const linked = Boolean(place.googlePlaceId || linkedByPlace.get(place.id));
    return linked && !freshIds.has(place.id);
  }).length;
  const lastFetchedAt = fresh.map((row) => row.fetched_at).sort().at(-1) || null;
  const estimatedSearchRequests = missingPlaceId;
  const estimatedDetailRequests = linkedWithoutFreshCache + missingPlaceId;
  return {
    total: places.length,
    linked: linkedCount,
    missingPlaceId,
    review,
    freshCache: fresh.length,
    expiredCache: expired.length,
    estimatedSearchRequests,
    estimatedDetailRequests,
    estimatedMaxRequests: estimatedSearchRequests + estimatedDetailRequests,
    lastFetchedAt,
  };
}

function areaSimilarity(place: Place, candidate: GoogleDiscoveryCandidate) {
  const localArea = [place.soi, place.area, place.address].filter(Boolean).join(" ");
  if (!localArea || !candidate.address) return null;
  return textSimilarity(localArea, candidate.address);
}

function assessCandidates(place: Place, candidates: GoogleDiscoveryCandidate[], places: Place[], usedGooglePlaceIds: Set<string>): CandidateAssessment[] {
  return candidates
    .filter((candidate) => candidate.googlePlaceId && !usedGooglePlaceIds.has(candidate.googlePlaceId))
    .map((candidate) => ({
      candidate,
      assessment: assessGooglePlaceMatch(place, candidate, places),
      areaScore: areaSimilarity(place, candidate),
    }))
    .sort((a, b) => b.assessment.confidence - a.assessment.confidence);
}

export function chooseAutomaticGoogleMatch(place: Place, assessed: CandidateAssessment[]): CandidateAssessment | null {
  const first = assessed[0];
  if (!first) return null;
  const second = assessed[1];
  const margin = first.assessment.confidence - (second?.assessment.confidence ?? 0);
  const nameScore = first.assessment.factors.name.score ?? 0;
  const areaScore = first.areaScore ?? first.assessment.factors.address.score ?? 0;

  if (!isChainPlace(place)) {
    if (first.assessment.hardBlocked) return null;
    if (first.assessment.confidence < GOOGLE_AUTO_MATCH_THRESHOLD) return null;
    if (nameScore < 0.72) return null;
    if (second && margin < 6) return null;
    return first;
  }

  // Chain branches without local coordinates need much stronger name + area evidence.
  if (first.assessment.duplicateGooglePlaceId) return null;
  if (nameScore < 0.9 || areaScore < 0.45 || first.assessment.confidence < 80) return null;
  if (second && margin < 10) return null;
  return first;
}

async function persistMatch(input: {
  userId: string;
  place: Place;
  candidate: CandidateAssessment | null;
  status: "linked" | "review";
}) {
  const now = new Date().toISOString();
  const expiresAt = input.status === "review" ? new Date(Date.now() + GOOGLE_CLOUD_CACHE_TTL_MS).toISOString() : null;
  const candidatePayload = input.candidate && input.status === "review" ? {
    name: input.candidate.candidate.name,
    address: input.candidate.candidate.address,
    googleMapsUrl: input.candidate.candidate.googleMapsUrl,
    primaryType: input.candidate.candidate.primaryType,
    confidence: input.candidate.assessment.confidence,
    nameScore: input.candidate.assessment.factors.name.score,
    areaScore: input.candidate.areaScore,
  } : input.status === "review" ? { reason: "no_unambiguous_match" } : {
    confidence: input.candidate?.assessment.confidence ?? null,
    nameScore: input.candidate?.assessment.factors.name.score ?? null,
    areaScore: input.candidate?.areaScore ?? null,
  };
  const { error } = await supabase.from("amd_google_place_matches").upsert({
    user_id: input.userId,
    place_id: input.place.id,
    google_place_id: input.candidate?.candidate.googlePlaceId || null,
    status: input.status,
    confidence: input.candidate?.assessment.confidence ?? null,
    candidate: candidatePayload,
    candidate_expires_at: expiresAt,
    reviewed_at: now,
    updated_at: now,
  }, { onConflict: "user_id,place_id" });
  if (error) throw error;
}

async function persistLiveDetails(userId: string, placeId: string, googlePlaceId: string, live: GoogleLiveDetails) {
  const fetchedAt = live.fetchedAt || new Date().toISOString();
  const expiresAt = new Date(new Date(fetchedAt).getTime() + GOOGLE_CLOUD_CACHE_TTL_MS).toISOString();
  const payload = sanitizeGoogleLiveDetails(live);
  const { error } = await supabase.from("amd_google_place_cache").upsert({
    user_id: userId,
    place_id: placeId,
    google_place_id: googlePlaceId,
    payload,
    fetched_at: fetchedAt,
    expires_at: expiresAt,
    source: "google_places_admin",
  }, { onConflict: "user_id,place_id" });
  if (error) throw error;
}

export async function runGoogleCloudAutoEnrichment(input: {
  apiKey: string;
  places: Place[];
  language: "th" | "en";
  isCancelled?: () => boolean;
  onProgress?: (progress: GoogleCloudEnrichmentProgress) => void;
}): Promise<GoogleCloudEnrichmentResult> {
  if (!input.apiKey) throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing");
  const [user, control] = await Promise.all([
    ensureCloudUser(),
    hydrateGoogleApiControlSettings(),
    hydrateGoogleRequestLogs(),
  ]).then(([cloudUser, apiControl]) => [cloudUser, apiControl] as const);
  if (control.locked) throw new Error("Google API Request Lock is enabled. Unlock it in Data Management before starting the bulk request.");

  const cloud = await loadCloudRows(user.id);
  const matchByPlace = new Map(cloud.matches.filter((row) => row.status === "linked" && row.google_place_id).map((row) => [row.place_id, row.google_place_id as string]));
  const cacheByPlace = new Map(cloud.cache.map((row) => [row.place_id, row]));
  const usedGooglePlaceIds = new Set<string>([
    ...input.places.map((place) => place.googlePlaceId).filter((value): value is string => Boolean(value)),
    ...matchByPlace.values(),
  ]);

  let current = 0;
  let networkRequests = 0;
  let linked = 0;
  let cached = 0;
  let review = 0;
  let failed = 0;
  let cancelled = false;
  let stoppedByLimit = false;
  let stoppedReason: string | null = null;
  let currentName: string | null = null;

  const publish = () => input.onProgress?.({ current, total: input.places.length, currentName, networkRequests, linked, cached, review, failed });
  publish();

  for (const place of input.places) {
    if (input.isCancelled?.()) { cancelled = true; break; }
    currentName = place.name;
    publish();

    try {
      let googlePlaceId = place.googlePlaceId || matchByPlace.get(place.id) || null;
      if (!googlePlaceId) {
        const usageBeforeSearch = getGoogleRequestUsage();
        if (usageBeforeSearch.today >= control.dailyWarningLimit) {
          stoppedByLimit = true;
          stoppedReason = `Daily manual Google request safety limit reached (${control.dailyWarningLimit})`;
          break;
        }

        const query = [buildGoogleMatchQuery(place), "Bangkok Thailand"].filter(Boolean).join(" ");
        const center = place.latitude != null && place.longitude != null ? { lat: place.latitude, lng: place.longitude } : DORM_CENTER;
        const radiusMeters = place.latitude != null && place.longitude != null ? (isChainPlace(place) ? 1500 : 4000) : 20000;
        const search = await runGoogleTextSearchRequest({
          apiKey: input.apiKey,
          query,
          center,
          radiusMeters,
          language: input.language,
          maxResults: 8,
          dailyLimit: control.dailyWarningLimit,
        });
        networkRequests += search.networkAttempts;
        const assessed = assessCandidates(place, search.candidates, input.places, usedGooglePlaceIds);
        const automatic = chooseAutomaticGoogleMatch(place, assessed);
        if (!automatic) {
          await persistMatch({ userId: user.id, place, candidate: assessed[0] || null, status: "review" });
          review += 1;
          current += 1;
          publish();
          continue;
        }
        googlePlaceId = automatic.candidate.googlePlaceId;
        usedGooglePlaceIds.add(googlePlaceId);
        matchByPlace.set(place.id, googlePlaceId);
        await persistMatch({ userId: user.id, place, candidate: automatic, status: "linked" });
      }

      linked += 1;
      const existingCache = cacheByPlace.get(place.id);
      if (existingCache && existingCache.google_place_id === googlePlaceId && isFresh(existingCache.expires_at)) {
        cached += 1;
        current += 1;
        publish();
        continue;
      }

      const usageBeforeDetails = getGoogleRequestUsage();
      if (usageBeforeDetails.today >= control.dailyWarningLimit) {
        stoppedByLimit = true;
        stoppedReason = `Daily manual Google request safety limit reached (${control.dailyWarningLimit})`;
        break;
      }

      const details = await runGoogleSinglePlaceDetails({
        apiKey: input.apiKey,
        place: { ...place, googlePlaceId },
        dailyLimit: control.dailyWarningLimit,
      });
      networkRequests += details.networkAttempts;
      await persistLiveDetails(user.id, place.id, googlePlaceId, details.live);
      cached += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Google enrichment failed";
      if (/daily manual google request limit/i.test(message)) {
        stoppedByLimit = true;
        stoppedReason = message;
        break;
      }
    }

    current += 1;
    publish();
  }

  currentName = null;
  publish();
  return { current, total: input.places.length, currentName, networkRequests, linked, cached, review, failed, cancelled, stoppedByLimit, stoppedReason };
}
