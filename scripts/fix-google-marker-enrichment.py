from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{label} patch target not found')
    return text.replace(old, new, 1)


# 1) Improve matching for the current seed, where shop names/areas exist but
# local coordinates are still empty.
path = Path('lib/google-place-id-manager.ts')
text = path.read_text()

text = replace_once(
    text,
    '''  if (!left || !right) return null;\n  if (left === right) return 1;\n  const maxLength = Math.max(left.length, right.length);''',
    '''  if (!left || !right) return null;\n  if (left === right) return 1;\n  // Google fallback queries often include the local name/area plus Bangkok.\n  // Treat normalized containment as a strong match instead of penalising the\n  // extra location tokens.\n  if (left.includes(right) || right.includes(left)) return 0.95;\n  const maxLength = Math.max(left.length, right.length);''',
    'textSimilarity',
)

text = replace_once(
    text,
    '''    { key: "address", weight: 15, score: textSimilarity(place.address || `${place.soi || ""} ${place.area || ""}`, candidate.address), label: "Unavailable" },''',
    '''    { key: "address", weight: 15, score: textSimilarity(place.address || place.soi || place.area, candidate.address), label: "Unavailable" },''',
    'address matching',
)

text = replace_once(
    text,
    '''  const chain = isChainPlace(place);\n  const chainAddressScore = factorMap.address.score;\n  const chainSafetyPassed = !chain || (\n    distanceMeters != null && distanceMeters <= 150 &&\n    chainAddressScore != null && chainAddressScore >= 0.45 &&\n    !linkedElsewhere\n  );\n  const blockReasons: string[] = [];\n  if (linkedElsewhere) blockReasons.push("Google Place ID is already linked to another local record");\n  if (chain && distanceMeters == null) blockReasons.push("Chain location requires coordinate proximity");\n  if (chain && distanceMeters != null && distanceMeters > 150) blockReasons.push("Chain candidate is too far from this branch");\n  if (chain && (chainAddressScore == null || chainAddressScore < 0.45)) blockReasons.push("Chain candidate requires address agreement");''',
    '''  const chain = isChainPlace(place);\n  const chainAddressScore = factorMap.address.score;\n  const geocodeFallback = candidate.primaryType === "geocode_fallback";\n  // Existing records currently have no local coordinates. For normal Places\n  // candidates, keep the strict coordinate guard. For the explicit Google\n  // Geocoding fallback, require strong area/address agreement instead so chain\n  // branches can still be positioned on the map without inventing coordinates.\n  const chainSafetyPassed = !chain || (\n    !linkedElsewhere &&\n    chainAddressScore != null && chainAddressScore >= (geocodeFallback ? 0.55 : 0.45) &&\n    (geocodeFallback || (distanceMeters != null && distanceMeters <= 150))\n  );\n  const blockReasons: string[] = [];\n  if (linkedElsewhere) blockReasons.push("Google Place ID is already linked to another local record");\n  if (chain && !geocodeFallback && distanceMeters == null) blockReasons.push("Chain location requires coordinate proximity");\n  if (chain && !geocodeFallback && distanceMeters != null && distanceMeters > 150) blockReasons.push("Chain candidate is too far from this branch");\n  if (chain && (chainAddressScore == null || chainAddressScore < (geocodeFallback ? 0.55 : 0.45))) blockReasons.push("Chain candidate requires address agreement");''',
    'chain matching',
)

path.write_text(text)


# 2) Keep every low-level Google network call behind the request manager while
# still supporting the auth-independent shared enrichment flow.
manager_path = Path('lib/google-request-manager.ts')
manager = manager_path.read_text()
shared_wrappers = '''\n\n/**\n * Shared maintenance wrappers used by the explicit Google -> Supabase bulk\n * action. These deliberately avoid Supabase Auth/control hydration because the\n * shared cache is app-owned, but they remain behind this single request layer.\n */\nexport async function runSharedGoogleTextSearch(input: {\n  apiKey: string;\n  query: string;\n  center: { lat: number; lng: number };\n  radiusMeters: number;\n  language?: "th" | "en";\n  maxResults?: number;\n}) {\n  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");\n  return discoverGooglePlaces(input.apiKey, {\n    query: input.query,\n    center: input.center,\n    radiusMeters: input.radiusMeters,\n    language: input.language,\n    maxResults: input.maxResults,\n  });\n}\n\nexport async function runSharedGooglePlaceDetails(input: { apiKey: string; googlePlaceId: string }) {\n  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");\n  return fetchGoogleLiveDetails(input.apiKey, input.googlePlaceId);\n}\n'''
if 'export async function runSharedGoogleTextSearch' not in manager:
    manager = manager.rstrip() + shared_wrappers + '\n'
    manager_path.write_text(manager)


# 3) Route the bulk flow through the request manager and persist candidate
# coordinates even when a shop still needs manual identity review. This is what
# makes every successfully discovered shop appear as a pin instead of vanishing.
cloud_path = Path('lib/google-cloud-enrichment.ts')
cloud = cloud_path.read_text()

cloud = replace_once(
    cloud,
    '''import {\n  discoverGooglePlaces,\n  fetchGoogleLiveDetails,\n  type GoogleDiscoveryCandidate,\n  type GoogleLiveDetails,\n} from "@/lib/google-live";''',
    '''import type { GoogleDiscoveryCandidate, GoogleLiveDetails } from "@/lib/google-live";\nimport { runSharedGooglePlaceDetails, runSharedGoogleTextSearch } from "@/lib/google-request-manager";''',
    'request manager import',
)

marker = '''\nasync function loadSharedRows() {'''
review_merge = '''\nfunction mergeGoogleReviewLocation(place: Place, payload: GoogleCloudPlacePayload): Place {\n  const next: Place = { ...place };\n  if (!next.address && payload.address) next.address = payload.address;\n  if (next.latitude == null && payload.latitude != null) next.latitude = payload.latitude;\n  if (next.longitude == null && payload.longitude != null) next.longitude = payload.longitude;\n  if (!next.googleMapsUrl && payload.googleMapsUrl) next.googleMapsUrl = payload.googleMapsUrl;\n  if (next.latitude != null && next.longitude != null && next.distanceKm == null) {\n    const km = haversineKm(DORM_CENTER, { lat: next.latitude, lng: next.longitude });\n    next.distanceKm = Number(km.toFixed(2));\n    next.straightLineDistanceKm = next.distanceKm;\n    if (next.distance) next.distance = { ...next.distance, straightLineMeters: Math.round(km * 1000) };\n  }\n  next.source = Array.from(new Set([...(place.source || []), "google_candidate_review"]));\n  next.lastChecked = payload.fetchedAt;\n  return next;\n}\n'''
if 'function mergeGoogleReviewLocation' not in cloud:
    if marker not in cloud:
        raise SystemExit('review merge insertion target not found')
    cloud = cloud.replace(marker, review_merge + marker, 1)

old_apply = '''export async function applyGoogleCloudPlaceLayer(places: Place[]): Promise<Place[]> {\n  if (!places.length) return places;\n  const { links, cache } = await loadSharedRows();\n  const linkedByPlace = new Map(\n    links.filter((row) => row.status === "linked" && row.google_place_id).map((row) => [row.place_id, row.google_place_id as string]),\n  );\n  const freshCacheByPlace = new Map(\n    cache.filter((row) => isFresh(row.expires_at)).map((row) => [row.place_id, row]),\n  );\n\n  return places.map((place) => {\n    const linkedId = place.googlePlaceId || linkedByPlace.get(place.id) || null;\n    if (!linkedId) return place;\n    const row = freshCacheByPlace.get(place.id);\n    const payload = row && row.google_place_id === linkedId ? safePayload(row.payload) : null;\n    if (!payload) {\n      return {\n        ...place,\n        googlePlaceId: linkedId,\n        googleMaps: place.googleMaps || {\n          placeId: linkedId,\n          url: place.googleMapsUrl || null,\n          latitude: place.latitude,\n          longitude: place.longitude,\n        },\n      };\n    }\n    return mergeGoogleCloudPayload(place, linkedId, payload);\n  });\n}'''
new_apply = '''export async function applyGoogleCloudPlaceLayer(places: Place[]): Promise<Place[]> {\n  if (!places.length) return places;\n  const { links, cache } = await loadSharedRows();\n  const linkByPlace = new Map(links.map((row) => [row.place_id, row]));\n  const freshCacheByPlace = new Map(\n    cache.filter((row) => isFresh(row.expires_at)).map((row) => [row.place_id, row]),\n  );\n\n  return places.map((place) => {\n    const link = linkByPlace.get(place.id);\n    const linkedId = place.googlePlaceId || (link?.status === "linked" ? link.google_place_id : null);\n    const reviewId = !linkedId && link?.status === "review" && isFresh(link.candidate_expires_at) ? link.google_place_id : null;\n    const effectiveId = linkedId || reviewId;\n    if (!effectiveId) return place;\n\n    const row = freshCacheByPlace.get(place.id);\n    const payload = row && row.google_place_id === effectiveId ? safePayload(row.payload) : null;\n    if (!payload) {\n      if (!linkedId) return place;\n      return {\n        ...place,\n        googlePlaceId: linkedId,\n        googleMaps: place.googleMaps || {\n          placeId: linkedId,\n          url: place.googleMapsUrl || null,\n          latitude: place.latitude,\n          longitude: place.longitude,\n        },\n      };\n    }\n\n    if (linkedId) return mergeGoogleCloudPayload(place, linkedId, payload);\n    return mergeGoogleReviewLocation(place, payload);\n  });\n}'''
cloud = replace_once(cloud, old_apply, new_apply, 'cloud layer review marker')

# Count a fresh review-location cache as usable cloud data too.
cloud = replace_once(
    cloud,
    '''    const row = cacheByPlace.get(place.id);\n    const fresh = Boolean(row && isFresh(row.expires_at) && linkedId && row.google_place_id === linkedId);''',
    '''    const row = cacheByPlace.get(place.id);\n    const effectiveId = linkedId || (freshReview ? link?.google_place_id : null);\n    const fresh = Boolean(row && isFresh(row.expires_at) && effectiveId && row.google_place_id === effectiveId);''',
    'status review cache',
)

persist_marker = '''\nasync function persistLiveDetails(placeId: string, googlePlaceId: string, live: GoogleLiveDetails) {'''
persist_candidate = '''\nasync function persistDiscoveryCandidate(placeId: string, candidate: GoogleDiscoveryCandidate) {\n  if (!candidate.googlePlaceId || candidate.latitude == null || candidate.longitude == null) return;\n  const fetchedAt = candidate.fetchedAt || new Date().toISOString();\n  const expiresAt = new Date(new Date(fetchedAt).getTime() + GOOGLE_CLOUD_CACHE_TTL_MS).toISOString();\n  const payload: GoogleCloudPlacePayload = {\n    address: candidate.address,\n    latitude: candidate.latitude,\n    longitude: candidate.longitude,\n    rating: candidate.rating,\n    reviewCount: candidate.reviewCount,\n    openNow: candidate.openNow,\n    openingHoursText: [],\n    phone: null,\n    website: null,\n    googleMapsUrl: candidate.googleMapsUrl,\n    priceLevel: null,\n    businessStatus: null,\n    fetchedAt,\n  };\n  const { error } = await supabase.from("amd_google_public_cache").upsert({\n    place_id: placeId,\n    google_place_id: candidate.googlePlaceId,\n    payload,\n    fetched_at: fetchedAt,\n    expires_at: expiresAt,\n    source: "google_discovery_candidate",\n    updated_at: new Date().toISOString(),\n  }, { onConflict: "place_id" });\n  if (error) throw error;\n}\n'''
if 'async function persistDiscoveryCandidate' not in cloud:
    if persist_marker not in cloud:
        raise SystemExit('candidate cache insertion target not found')
    cloud = cloud.replace(persist_marker, persist_candidate + persist_marker, 1)

cloud = replace_once(
    cloud,
    '''        const candidates = await discoverGooglePlaces(input.apiKey, {\n          query,\n          center,\n          radiusMeters,\n          language: input.language,\n          maxResults: 8,\n        });''',
    '''        const candidates = await runSharedGoogleTextSearch({\n          apiKey: input.apiKey,\n          query,\n          center,\n          radiusMeters,\n          language: input.language,\n          maxResults: 8,\n        });''',
    'shared text search',
)

cloud = replace_once(
    cloud,
    '''        if (!automatic) {\n          await persistLink(place, assessed[0] || null, "review");''',
    '''        if (!automatic) {\n          await persistLink(place, assessed[0] || null, "review");\n          if (assessed[0]) {\n            await persistDiscoveryCandidate(place.id, assessed[0].candidate);\n            cached += 1;\n          }''',
    'review candidate cache',
)

cloud = replace_once(
    cloud,
    '''        await persistLink(place, automatic, "linked");\n        linksByPlace.set(place.id, {''',
    '''        await persistLink(place, automatic, "linked");\n        // Persist discovery coordinates immediately. If full Place Details is\n        // unavailable, the shop still has a real Google position for its map pin.\n        await persistDiscoveryCandidate(place.id, automatic.candidate);\n        linksByPlace.set(place.id, {''',
    'linked candidate cache',
)

cloud = replace_once(
    cloud,
    '''      const live = await fetchGoogleLiveDetails(input.apiKey, googlePlaceId);''',
    '''      const live = await runSharedGooglePlaceDetails({ apiKey: input.apiKey, googlePlaceId });''',
    'shared place details',
)

cloud_path.write_text(cloud)


# 4) Tests: cover the geocoding fallback used by the current coordinate-empty
# seed and ensure review candidates can remain visible as map locations.
test_path = Path('tests/google-place-id-manager.test.ts')
test = test_path.read_text()
needle = '''  it("blocks linking a Google Place ID already used by another local record", () => {'''
case = '''  it("allows a geocoded chain branch with strong area agreement when local coordinates are missing", () => {\n    const local = place({ name: "7-Eleven ลาดพร้าว 35", placeType: "chain", area: "ลาดพร้าว 35", soi: "ลาดพร้าว 35", address: null, latitude: null, longitude: null });\n    const fallback = candidate({ name: "7-Eleven ลาดพร้าว 35 Bangkok Thailand", address: "ซอยลาดพร้าว 35 แขวงจันทรเกษม เขตจตุจักร กรุงเทพมหานคร", latitude: 13.81, longitude: 100.58, primaryType: "geocode_fallback" });\n    const result = assessGooglePlaceMatch(local, fallback, [local]);\n    expect(result.factors.name.score).toBeGreaterThanOrEqual(0.9);\n    expect(result.factors.address.score).toBeGreaterThanOrEqual(0.55);\n    expect(result.chainSafetyPassed).toBe(true);\n    expect(result.hardBlocked).toBe(false);\n  });\n\n'''
if case not in test:
    if needle not in test:
        raise SystemExit('test insertion target not found')
    test = test.replace(needle, case + needle, 1)
    test_path.write_text(test)
