import { supabase } from "@/lib/cloud/supabase";
import {
  assessGooglePlaceMatch,
  buildGoogleMatchQuery,
  isChainPlace,
  textSimilarity,
  type GooglePlaceMatchAssessment,
} from "@/lib/google-place-id-manager";
import type { GoogleDiscoveryCandidate, GoogleLiveDetails } from "@/lib/google-live";
import { runSharedGooglePlaceDetails, runSharedGoogleTextSearch } from "@/lib/google-request-manager";
import {
  classifyGoogleEnrichmentError,
  createGoogleEnrichmentRunId,
  isSystemicGoogleEnrichmentError,
  sanitizeGoogleDiagnosticText,
  writeGoogleEnrichmentDiagnostic,
} from "@/lib/google-enrichment-diagnostics";
import { DORM_CENTER, haversineKm } from "@/lib/place-utils";
import type { FieldProvenanceEntry, Place } from "@/types/place";

export const GOOGLE_CLOUD_CACHE_TTL_DAYS = 29;
export const GOOGLE_CLOUD_CACHE_TTL_MS = GOOGLE_CLOUD_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
export const GOOGLE_AUTO_MATCH_THRESHOLD = 75;
export const GOOGLE_BULK_RUN_REQUEST_LIMIT = 200;

type LinkRow = {
  place_id: string;
  google_place_id: string | null;
  status: "linked" | "review";
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
  lastError: string | null;
};

export type GoogleCloudEnrichmentResult = GoogleCloudEnrichmentProgress & {
  cancelled: boolean;
  stoppedByLimit: boolean;
  stoppedBySystemicError: boolean;
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

function normalizedPriceLevel(value: string | null): 1 | 2 | 3 | 4 | null {
  if (!value) return null;
  const text = value.toUpperCase();
  if (text === "1" || text.includes("INEXPENSIVE")) return 1;
  if (text === "2" || text.includes("MODERATE")) return 2;
  if (text === "3" || (text.includes("EXPENSIVE") && !text.includes("VERY"))) return 3;
  if (text === "4" || text.includes("VERY_EXPENSIVE")) return 4;
  return null;
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
  if (next.priceLevel == null) {
    const priceLevel = normalizedPriceLevel(payload.priceLevel);
    if (priceLevel != null) { next.priceLevel = priceLevel; mark("priceLevel"); }
  }

  if (next.latitude != null && next.longitude != null && next.distanceKm == null) {
    const km = haversineKm(DORM_CENTER, { lat: next.latitude, lng: next.longitude });
    next.distanceKm = Number(km.toFixed(2));
    next.straightLineDistanceKm = next.distanceKm;
    if (next.distance) {
      next.distance = { ...next.distance, straightLineMeters: Math.round(km * 1000) };
    }
    mark("distanceKm");
  }

  const businessStatus = (payload.businessStatus || "").toUpperCase();
  if (businessStatus.includes("PERMANENT")) { next.permanentlyClosed = true; mark("permanentlyClosed"); }
  if (businessStatus.includes("TEMPORAR")) { next.temporaryClosed = true; mark("temporaryClosed"); }

  next.source = Array.from(new Set([...(place.source || []), "google_places_live"]));
  next.lastChecked = payload.fetchedAt;
  next.fieldProvenance = provenance;
  return next;
}

function mergeGoogleReviewLocation(place: Place, payload: GoogleCloudPlacePayload): Place {
  const next: Place = { ...place };
  if (!next.address && payload.address) next.address = payload.address;
  if (next.latitude == null && payload.latitude != null) next.latitude = payload.latitude;
  if (next.longitude == null && payload.longitude != null) next.longitude = payload.longitude;
  if (!next.googleMapsUrl && payload.googleMapsUrl) next.googleMapsUrl = payload.googleMapsUrl;
  if (next.latitude != null && next.longitude != null && next.distanceKm == null) {
    const km = haversineKm(DORM_CENTER, { lat: next.latitude, lng: next.longitude });
    next.distanceKm = Number(km.toFixed(2));
    next.straightLineDistanceKm = next.distanceKm;
    if (next.distance) next.distance = { ...next.distance, straightLineMeters: Math.round(km * 1000) };
  }
  next.source = Array.from(new Set([...(place.source || []), "google_candidate_review"]));
  next.lastChecked = payload.fetchedAt;
  return next;
}

async function loadSharedRows() {
  const [linksResult, cacheResult] = await Promise.all([
    supabase
      .from("amd_google_public_links")
      .select("place_id,google_place_id,status,confidence,candidate,candidate_expires_at,updated_at"),
    supabase
      .from("amd_google_public_cache")
      .select("place_id,google_place_id,payload,fetched_at,expires_at"),
  ]);
  if (linksResult.error) throw linksResult.error;
  if (cacheResult.error) throw cacheResult.error;
  return {
    links: (linksResult.data || []) as LinkRow[],
    cache: (cacheResult.data || []) as CacheRow[],
  };
}

export async function applyGoogleCloudPlaceLayer(places: Place[]): Promise<Place[]> {
  if (!places.length) return places;
  const { links, cache } = await loadSharedRows();
  const linkByPlace = new Map(links.map((row) => [row.place_id, row]));
  const freshCacheByPlace = new Map(
    cache.filter((row) => isFresh(row.expires_at)).map((row) => [row.place_id, row]),
  );

  return places.map((place) => {
    const link = linkByPlace.get(place.id);
    const linkedId = place.googlePlaceId || (link?.status === "linked" ? link.google_place_id : null);
    const reviewId = !linkedId && link?.status === "review" && isFresh(link.candidate_expires_at) ? link.google_place_id : null;
    const effectiveId = linkedId || reviewId;
    if (!effectiveId) return place;

    const row = freshCacheByPlace.get(place.id);
    const payload = row && row.google_place_id === effectiveId ? safePayload(row.payload) : null;
    if (!payload) {
      if (!linkedId) return place;
      return {
        ...place,
        googlePlaceId: linkedId,
        googleMaps: place.googleMaps || {
          placeId: linkedId,
          url: place.googleMapsUrl || null,
          latitude: place.latitude,
          longitude: place.longitude,
        },
      };
    }

    if (linkedId) return mergeGoogleCloudPayload(place, linkedId, payload);
    return mergeGoogleReviewLocation(place, payload);
  });
}

export async function loadGoogleCloudEnrichmentStatus(places: Place[]): Promise<GoogleCloudEnrichmentStatus> {
  const { links, cache } = await loadSharedRows();
  const placeIds = new Set(places.map((place) => place.id));
  const linksByPlace = new Map(links.filter((row) => placeIds.has(row.place_id)).map((row) => [row.place_id, row]));
  const cacheByPlace = new Map(cache.filter((row) => placeIds.has(row.place_id)).map((row) => [row.place_id, row]));

  let linked = 0;
  let review = 0;
  let freshCache = 0;
  let expiredCache = 0;
  let estimatedSearchRequests = 0;
  let estimatedDetailRequests = 0;
  const fetchedTimes: string[] = [];

  for (const place of places) {
    const link = linksByPlace.get(place.id);
    const linkedId = place.googlePlaceId || (link?.status === "linked" ? link.google_place_id : null);
    const freshReview = link?.status === "review" && isFresh(link.candidate_expires_at);
    const row = cacheByPlace.get(place.id);
    const effectiveId = linkedId || (freshReview ? link?.google_place_id : null);
    const fresh = Boolean(row && isFresh(row.expires_at) && effectiveId && row.google_place_id === effectiveId);

    if (linkedId) linked += 1;
    if (freshReview) review += 1;
    if (fresh) {
      freshCache += 1;
      if (row) fetchedTimes.push(row.fetched_at);
    } else if (row) {
      expiredCache += 1;
    }

    if (!linkedId && !freshReview) estimatedSearchRequests += 1;
    if (linkedId && !fresh) estimatedDetailRequests += 1;
    if (!linkedId && !freshReview) estimatedDetailRequests += 1;
  }

  return {
    total: places.length,
    linked,
    missingPlaceId: Math.max(0, places.length - linked),
    review,
    freshCache,
    expiredCache,
    estimatedSearchRequests,
    estimatedDetailRequests,
    estimatedMaxRequests: estimatedSearchRequests + estimatedDetailRequests,
    lastFetchedAt: fetchedTimes.sort().at(-1) || null,
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

  if (first.assessment.duplicateGooglePlaceId) return null;
  if (nameScore < 0.9 || areaScore < 0.45 || first.assessment.confidence < 80) return null;
  if (second && margin < 10) return null;
  return first;
}

async function persistLink(place: Place, candidate: CandidateAssessment | null, status: "linked" | "review") {
  const now = new Date().toISOString();
  const candidateExpiresAt = status === "review" ? new Date(Date.now() + GOOGLE_CLOUD_CACHE_TTL_MS).toISOString() : null;
  const candidatePayload = status === "review"
    ? candidate
      ? {
          name: candidate.candidate.name,
          address: candidate.candidate.address,
          googleMapsUrl: candidate.candidate.googleMapsUrl,
          primaryType: candidate.candidate.primaryType,
          confidence: candidate.assessment.confidence,
          nameScore: candidate.assessment.factors.name.score,
          areaScore: candidate.areaScore,
          reason: "manual_review_required",
        }
      : { reason: "no_google_candidate" }
    : null;

  const { error } = await supabase.from("amd_google_public_links").upsert({
    place_id: place.id,
    google_place_id: candidate?.candidate.googlePlaceId || null,
    status,
    confidence: candidate?.assessment.confidence ?? null,
    candidate: candidatePayload,
    candidate_expires_at: candidateExpiresAt,
    updated_at: now,
  }, { onConflict: "place_id" });
  if (error) throw error;
}

async function persistDiscoveryCandidate(placeId: string, candidate: GoogleDiscoveryCandidate) {
  if (!candidate.googlePlaceId || candidate.latitude == null || candidate.longitude == null) return;
  const fetchedAt = candidate.fetchedAt || new Date().toISOString();
  const expiresAt = new Date(new Date(fetchedAt).getTime() + GOOGLE_CLOUD_CACHE_TTL_MS).toISOString();
  const payload: GoogleCloudPlacePayload = {
    address: candidate.address,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    rating: candidate.rating,
    reviewCount: candidate.reviewCount,
    openNow: candidate.openNow,
    openingHoursText: [],
    phone: null,
    website: null,
    googleMapsUrl: candidate.googleMapsUrl,
    priceLevel: null,
    businessStatus: null,
    fetchedAt,
  };
  const { error } = await supabase.from("amd_google_public_cache").upsert({
    place_id: placeId,
    google_place_id: candidate.googlePlaceId,
    payload,
    fetched_at: fetchedAt,
    expires_at: expiresAt,
    source: "google_discovery_candidate",
    updated_at: new Date().toISOString(),
  }, { onConflict: "place_id" });
  if (error) throw error;
}

async function persistLiveDetails(placeId: string, googlePlaceId: string, live: GoogleLiveDetails) {
  const fetchedAt = live.fetchedAt || new Date().toISOString();
  const expiresAt = new Date(new Date(fetchedAt).getTime() + GOOGLE_CLOUD_CACHE_TTL_MS).toISOString();
  const payload = sanitizeGoogleLiveDetails(live);
  const { error } = await supabase.from("amd_google_public_cache").upsert({
    place_id: placeId,
    google_place_id: googlePlaceId,
    payload,
    fetched_at: fetchedAt,
    expires_at: expiresAt,
    source: "google_places_admin",
    updated_at: new Date().toISOString(),
  }, { onConflict: "place_id" });
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

  const runId = createGoogleEnrichmentRunId();
  await writeGoogleEnrichmentDiagnostic({
    runId,
    stage: "bulk_started",
    ok: true,
    meta: { totalPlaces: input.places.length, language: input.language },
  });

  const cloud = await loadSharedRows();
  const linksByPlace = new Map(cloud.links.map((row) => [row.place_id, row]));
  const cacheByPlace = new Map(cloud.cache.map((row) => [row.place_id, row]));
  const usedGooglePlaceIds = new Set<string>([
    ...input.places.map((place) => place.googlePlaceId).filter((value): value is string => Boolean(value)),
    ...cloud.links.filter((row) => row.status === "linked" && row.google_place_id).map((row) => row.google_place_id as string),
  ]);

  let current = 0;
  let networkRequests = 0;
  let linked = 0;
  let cached = 0;
  let review = 0;
  let failed = 0;
  let cancelled = false;
  let stoppedByLimit = false;
  let stoppedBySystemicError = false;
  let stoppedReason: string | null = null;
  let currentName: string | null = null;
  let lastError: string | null = null;

  const publish = () => input.onProgress?.({ current, total: input.places.length, currentName, networkRequests, linked, cached, review, failed, lastError });
  publish();

  for (const place of input.places) {
    if (input.isCancelled?.()) { cancelled = true; break; }
    currentName = place.name;
    publish();

    let abortAfterCurrent = false;
    try {
      const existingLink = linksByPlace.get(place.id);
      let googlePlaceId = place.googlePlaceId || (existingLink?.status === "linked" ? existingLink.google_place_id : null);

      if (!googlePlaceId && existingLink?.status === "review" && isFresh(existingLink.candidate_expires_at)) {
        review += 1;
        current += 1;
        publish();
        continue;
      }

      if (!googlePlaceId) {
        if (networkRequests >= GOOGLE_BULK_RUN_REQUEST_LIMIT) {
          stoppedByLimit = true;
          stoppedReason = `Bulk Google safety limit reached (${GOOGLE_BULK_RUN_REQUEST_LIMIT} requests)`;
          break;
        }

        const query = [buildGoogleMatchQuery(place), "Bangkok Thailand"].filter(Boolean).join(" ");
        const center = place.latitude != null && place.longitude != null ? { lat: place.latitude, lng: place.longitude } : DORM_CENTER;
        const radiusMeters = place.latitude != null && place.longitude != null ? (isChainPlace(place) ? 1500 : 4000) : 20000;
        const candidates = await runSharedGoogleTextSearch({
          apiKey: input.apiKey,
          query,
          center,
          radiusMeters,
          language: input.language,
          maxResults: 8,
          diagnostic: { runId, placeId: place.id, placeName: place.name },
        });
        networkRequests += 1;

        const assessed = assessCandidates(place, candidates, input.places, usedGooglePlaceIds);
        const automatic = chooseAutomaticGoogleMatch(place, assessed);
        if (!automatic) {
          await persistLink(place, assessed[0] || null, "review");
          if (assessed[0]) {
            await persistDiscoveryCandidate(place.id, assessed[0].candidate);
            cached += 1;
          }
          linksByPlace.set(place.id, {
            place_id: place.id,
            google_place_id: assessed[0]?.candidate.googlePlaceId || null,
            status: "review",
            confidence: assessed[0]?.assessment.confidence ?? null,
            candidate: null,
            candidate_expires_at: new Date(Date.now() + GOOGLE_CLOUD_CACHE_TTL_MS).toISOString(),
            updated_at: new Date().toISOString(),
          });
          review += 1;
          current += 1;
          publish();
          continue;
        }

        googlePlaceId = automatic.candidate.googlePlaceId;
        usedGooglePlaceIds.add(googlePlaceId);
        await persistLink(place, automatic, "linked");
        // Persist discovery coordinates immediately. If full Place Details is
        // unavailable, the shop still has a real Google position for its map pin.
        await persistDiscoveryCandidate(place.id, automatic.candidate);
        linksByPlace.set(place.id, {
          place_id: place.id,
          google_place_id: googlePlaceId,
          status: "linked",
          confidence: automatic.assessment.confidence,
          candidate: null,
          candidate_expires_at: null,
          updated_at: new Date().toISOString(),
        });
      }

      linked += 1;
      const existingCache = cacheByPlace.get(place.id);
      if (existingCache && existingCache.google_place_id === googlePlaceId && isFresh(existingCache.expires_at)) {
        cached += 1;
        current += 1;
        publish();
        continue;
      }

      if (networkRequests >= GOOGLE_BULK_RUN_REQUEST_LIMIT) {
        stoppedByLimit = true;
        stoppedReason = `Bulk Google safety limit reached (${GOOGLE_BULK_RUN_REQUEST_LIMIT} requests)`;
        break;
      }

      const live = await runSharedGooglePlaceDetails({
        apiKey: input.apiKey,
        googlePlaceId,
        diagnostic: { runId, placeId: place.id, placeName: place.name },
      });
      networkRequests += 1;
      await persistLiveDetails(place.id, googlePlaceId, live);
      cacheByPlace.set(place.id, {
        place_id: place.id,
        google_place_id: googlePlaceId,
        payload: sanitizeGoogleLiveDetails(live),
        fetched_at: live.fetchedAt,
        expires_at: new Date(new Date(live.fetchedAt).getTime() + GOOGLE_CLOUD_CACHE_TTL_MS).toISOString(),
      });
      cached += 1;
    } catch (error) {
      failed += 1;
      const code = classifyGoogleEnrichmentError(error);
      const safeError = sanitizeGoogleDiagnosticText(error);
      lastError = `[${code}] ${safeError}`;
      await writeGoogleEnrichmentDiagnostic({
        runId,
        stage: "place_failed",
        placeId: place.id,
        placeName: place.name,
        ok: false,
        error,
        meta: { code, networkRequests, linked, cached, review, failed },
      });
      if (isSystemicGoogleEnrichmentError(code)) {
        stoppedBySystemicError = true;
        stoppedReason = `Systemic Google error (${code}): ${safeError}`;
        abortAfterCurrent = true;
      }
    }

    current += 1;
    publish();
    if (abortAfterCurrent) break;
  }

  currentName = null;
  publish();
  await writeGoogleEnrichmentDiagnostic({
    runId,
    stage: "bulk_completed",
    ok: !stoppedBySystemicError && failed === 0,
    error: stoppedBySystemicError ? stoppedReason : null,
    meta: {
      current,
      total: input.places.length,
      networkRequests,
      linked,
      cached,
      review,
      failed,
      cancelled,
      stoppedByLimit,
      stoppedBySystemicError,
    },
  });
  return { current, total: input.places.length, currentName, networkRequests, linked, cached, review, failed, lastError, cancelled, stoppedByLimit, stoppedBySystemicError, stoppedReason };
}
