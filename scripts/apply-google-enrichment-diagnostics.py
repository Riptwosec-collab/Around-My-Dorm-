from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label}: patch target not found")
    return text.replace(old, new, 1)


# Instrument the shared Google request boundary. This is the critical blind spot:
# shared bulk calls intentionally bypass the authenticated request-log table.
request_path = Path("lib/google-request-manager.ts")
request = request_path.read_text()
request = replace_once(
    request,
    'import { readGoogleMemoryCache } from "@/lib/google-memory-cache";\n',
    'import { readGoogleMemoryCache } from "@/lib/google-memory-cache";\nimport { classifyGoogleEnrichmentError, writeGoogleEnrichmentDiagnostic } from "@/lib/google-enrichment-diagnostics";\n',
    "request-manager diagnostics import",
)
old_wrappers = '''export async function runSharedGoogleTextSearch(input: {\n  apiKey: string;\n  query: string;\n  center: { lat: number; lng: number };\n  radiusMeters: number;\n  language?: "th" | "en";\n  maxResults?: number;\n}) {\n  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");\n  return discoverGooglePlaces(input.apiKey, {\n    query: input.query,\n    center: input.center,\n    radiusMeters: input.radiusMeters,\n    language: input.language,\n    maxResults: input.maxResults,\n  });\n}\n\nexport async function runSharedGooglePlaceDetails(input: { apiKey: string; googlePlaceId: string }) {\n  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");\n  return fetchGoogleLiveDetails(input.apiKey, input.googlePlaceId);\n}\n'''
new_wrappers = '''type SharedGoogleDiagnosticContext = {\n  runId: string;\n  placeId?: string;\n  placeName?: string;\n};\n\nexport async function runSharedGoogleTextSearch(input: {\n  apiKey: string;\n  query: string;\n  center: { lat: number; lng: number };\n  radiusMeters: number;\n  language?: "th" | "en";\n  maxResults?: number;\n  diagnostic?: SharedGoogleDiagnosticContext;\n}) {\n  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");\n  const started = nowMs();\n  try {\n    return await discoverGooglePlaces(input.apiKey, {\n      query: input.query,\n      center: input.center,\n      radiusMeters: input.radiusMeters,\n      language: input.language,\n      maxResults: input.maxResults,\n    });\n  } catch (error) {\n    if (input.diagnostic) {\n      await writeGoogleEnrichmentDiagnostic({\n        runId: input.diagnostic.runId,\n        stage: "text_search_failed",\n        placeId: input.diagnostic.placeId,\n        placeName: input.diagnostic.placeName,\n        ok: false,\n        error,\n        meta: {\n          code: classifyGoogleEnrichmentError(error),\n          durationMs: Math.round(nowMs() - started),\n          radiusMeters: input.radiusMeters,\n          language: input.language || "th",\n        },\n      });\n    }\n    throw error;\n  }\n}\n\nexport async function runSharedGooglePlaceDetails(input: {\n  apiKey: string;\n  googlePlaceId: string;\n  diagnostic?: SharedGoogleDiagnosticContext;\n}) {\n  if (GOOGLE_REQUEST_MODE !== "manual") throw new Error("Google request policy is not manual");\n  const started = nowMs();\n  try {\n    return await fetchGoogleLiveDetails(input.apiKey, input.googlePlaceId);\n  } catch (error) {\n    if (input.diagnostic) {\n      await writeGoogleEnrichmentDiagnostic({\n        runId: input.diagnostic.runId,\n        stage: "place_details_failed",\n        placeId: input.diagnostic.placeId,\n        placeName: input.diagnostic.placeName,\n        ok: false,\n        error,\n        meta: {\n          code: classifyGoogleEnrichmentError(error),\n          durationMs: Math.round(nowMs() - started),\n          googlePlaceId: input.googlePlaceId,\n        },\n      });\n    }\n    throw error;\n  }\n}\n'''
request = replace_once(request, old_wrappers, new_wrappers, "shared Google wrappers")
request_path.write_text(request)


# Instrument the bulk orchestration, correlate all errors by a run id, and stop
# after the first systemic configuration/quota/network failure instead of
# repeating the same failing Google request for all 91 shops.
cloud_path = Path("lib/google-cloud-enrichment.ts")
cloud = cloud_path.read_text()
cloud = replace_once(
    cloud,
    'import { runSharedGooglePlaceDetails, runSharedGoogleTextSearch } from "@/lib/google-request-manager";\n',
    'import { runSharedGooglePlaceDetails, runSharedGoogleTextSearch } from "@/lib/google-request-manager";\nimport {\n  classifyGoogleEnrichmentError,\n  createGoogleEnrichmentRunId,\n  isSystemicGoogleEnrichmentError,\n  sanitizeGoogleDiagnosticText,\n  writeGoogleEnrichmentDiagnostic,\n} from "@/lib/google-enrichment-diagnostics";\n',
    "cloud diagnostics import",
)
cloud = replace_once(
    cloud,
    '''export type GoogleCloudEnrichmentResult = GoogleCloudEnrichmentProgress & {\n  cancelled: boolean;\n  stoppedByLimit: boolean;\n  stoppedReason: string | null;\n};''',
    '''export type GoogleCloudEnrichmentResult = GoogleCloudEnrichmentProgress & {\n  cancelled: boolean;\n  stoppedByLimit: boolean;\n  stoppedBySystemicError: boolean;\n  stoppedReason: string | null;\n};''',
    "result systemic-error flag",
)
cloud = replace_once(
    cloud,
    '''  if (!input.apiKey) throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing");\n\n  const cloud = await loadSharedRows();''',
    '''  if (!input.apiKey) throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing");\n\n  const runId = createGoogleEnrichmentRunId();\n  await writeGoogleEnrichmentDiagnostic({\n    runId,\n    stage: "bulk_started",\n    ok: true,\n    meta: { totalPlaces: input.places.length, language: input.language },\n  });\n\n  const cloud = await loadSharedRows();''',
    "bulk run start diagnostics",
)
cloud = replace_once(
    cloud,
    '''  let stoppedByLimit = false;\n  let stoppedReason: string | null = null;''',
    '''  let stoppedByLimit = false;\n  let stoppedBySystemicError = false;\n  let stoppedReason: string | null = null;''',
    "bulk systemic state",
)
cloud = replace_once(
    cloud,
    '''    try {\n      const existingLink = linksByPlace.get(place.id);''',
    '''    let abortAfterCurrent = false;\n    try {\n      const existingLink = linksByPlace.get(place.id);''',
    "per-place abort state",
)
cloud = replace_once(
    cloud,
    '''        const candidates = await runSharedGoogleTextSearch({\n          apiKey: input.apiKey,\n          query,\n          center,\n          radiusMeters,\n          language: input.language,\n          maxResults: 8,\n        });''',
    '''        const candidates = await runSharedGoogleTextSearch({\n          apiKey: input.apiKey,\n          query,\n          center,\n          radiusMeters,\n          language: input.language,\n          maxResults: 8,\n          diagnostic: { runId, placeId: place.id, placeName: place.name },\n        });''',
    "text search diagnostic context",
)
cloud = replace_once(
    cloud,
    '''      const live = await runSharedGooglePlaceDetails({ apiKey: input.apiKey, googlePlaceId });''',
    '''      const live = await runSharedGooglePlaceDetails({\n        apiKey: input.apiKey,\n        googlePlaceId,\n        diagnostic: { runId, placeId: place.id, placeName: place.name },\n      });''',
    "details diagnostic context",
)
old_catch = '''    } catch (error) {\n      failed += 1;\n      lastError = error instanceof Error ? error.message : "Google enrichment failed";\n    }\n\n    current += 1;\n    publish();\n  }\n\n  currentName = null;\n  publish();\n  return { current, total: input.places.length, currentName, networkRequests, linked, cached, review, failed, lastError, cancelled, stoppedByLimit, stoppedReason };\n}'''
new_catch = '''    } catch (error) {\n      failed += 1;\n      const code = classifyGoogleEnrichmentError(error);\n      const safeError = sanitizeGoogleDiagnosticText(error);\n      lastError = `[${code}] ${safeError}`;\n      await writeGoogleEnrichmentDiagnostic({\n        runId,\n        stage: "place_failed",\n        placeId: place.id,\n        placeName: place.name,\n        ok: false,\n        error,\n        meta: { code, networkRequests, linked, cached, review, failed },\n      });\n      if (isSystemicGoogleEnrichmentError(code)) {\n        stoppedBySystemicError = true;\n        stoppedReason = `Systemic Google error (${code}): ${safeError}`;\n        abortAfterCurrent = true;\n      }\n    }\n\n    current += 1;\n    publish();\n    if (abortAfterCurrent) break;\n  }\n\n  currentName = null;\n  publish();\n  await writeGoogleEnrichmentDiagnostic({\n    runId,\n    stage: "bulk_completed",\n    ok: !stoppedBySystemicError && failed === 0,\n    error: stoppedBySystemicError ? stoppedReason : null,\n    meta: {\n      current,\n      total: input.places.length,\n      networkRequests,\n      linked,\n      cached,\n      review,\n      failed,\n      cancelled,\n      stoppedByLimit,\n      stoppedBySystemicError,\n    },\n  });\n  return { current, total: input.places.length, currentName, networkRequests, linked, cached, review, failed, lastError, cancelled, stoppedByLimit, stoppedBySystemicError, stoppedReason };\n}'''
cloud = replace_once(cloud, old_catch, new_catch, "bulk catch and completion diagnostics")
cloud_path.write_text(cloud)


# Make the UI distinguish an actual systemic Google/configuration failure from a
# normal safety-cap stop. The exact sanitized failure is visible immediately.
component_path = Path("components/GoogleCloudAutoEnrichment.tsx")
component = component_path.read_text()
component = replace_once(
    component,
    '''      if (next.stoppedByLimit) {\n        setMessage(''',
    '''      if (next.stoppedBySystemicError) {\n        setMessage(\n          language === "en"\n            ? `Stopped after the first systemic Google error to avoid repeating failed requests. ${next.stoppedReason || next.lastError || "See diagnostics."}`\n            : `หยุดหลังพบ Google error ที่เป็นปัญหาระดับระบบครั้งแรก เพื่อไม่ยิงซ้ำทั้ง 91 ร้าน • ${next.stoppedReason || next.lastError || "ดู Diagnostics"}`,\n        );\n      } else if (next.stoppedByLimit) {\n        setMessage(''',
    "component systemic error message",
)
component_path.write_text(component)
