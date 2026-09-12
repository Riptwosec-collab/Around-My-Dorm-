import { supabase } from "@/lib/cloud/supabase";

export type GoogleEnrichmentErrorCode =
  | "places_api_not_enabled"
  | "geocoding_api_not_enabled"
  | "request_denied"
  | "quota_exceeded"
  | "invalid_request"
  | "maps_load_failed"
  | "network_error"
  | "supabase_write_failed"
  | "unknown";

export type GoogleEnrichmentDiagnosticInput = {
  runId: string;
  stage: string;
  placeId?: string | null;
  placeName?: string | null;
  ok: boolean;
  error?: unknown;
  meta?: Record<string, unknown>;
};

const MAX_ERROR_LENGTH = 4000;

export function sanitizeGoogleDiagnosticText(value: unknown) {
  const raw = value instanceof Error ? value.message : String(value ?? "");
  return raw
    .replace(/([?&]key=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED_GOOGLE_API_KEY]")
    .slice(0, MAX_ERROR_LENGTH);
}

function sanitizeMetaValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[MAX_DEPTH]";
  if (typeof value === "string") return sanitizeGoogleDiagnosticText(value).slice(0, 1000);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMetaValue(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      if (/api.?key|authorization|token|secret/i.test(key)) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = sanitizeMetaValue(item, depth + 1);
      }
    }
    return output;
  }
  return String(value).slice(0, 500);
}

export function classifyGoogleEnrichmentError(error: unknown): GoogleEnrichmentErrorCode {
  const text = sanitizeGoogleDiagnosticText(error).toLowerCase();

  if (/places api \(new\).*not.*(enabled|used)|places api.*not.*(enabled|used)|apinotactivatedmaperror.*place/.test(text)) {
    return "places_api_not_enabled";
  }
  if (/geocod.*not.*(enabled|used)|apinotactivatedmaperror.*geocod/.test(text)) {
    return "geocoding_api_not_enabled";
  }
  if (/over_query_limit|resource_exhausted|quota.*(exceed|limit)|rate.?limit/.test(text)) {
    return "quota_exceeded";
  }
  if (/request_denied|referer|referrer|not authorized|permission_denied|api key.*(invalid|restricted|not valid)|keyinvalid/.test(text)) {
    return "request_denied";
  }
  if (/invalid_request|invalid argument|bad request|malformed/.test(text)) {
    return "invalid_request";
  }
  if (/google maps load failed|maps.*unavailable|script loaded without maps|initialized without maps/.test(text)) {
    return "maps_load_failed";
  }
  if (/failed to fetch|networkerror|network request failed|load failed|timeout|timed out/.test(text)) {
    return "network_error";
  }
  if (/row-level security|postgrest|supabase|duplicate key|violates.*constraint|permission denied for table/.test(text)) {
    return "supabase_write_failed";
  }
  return "unknown";
}

export function isSystemicGoogleEnrichmentError(code: GoogleEnrichmentErrorCode) {
  return [
    "places_api_not_enabled",
    "geocoding_api_not_enabled",
    "request_denied",
    "quota_exceeded",
    "invalid_request",
    "maps_load_failed",
    "network_error",
  ].includes(code);
}

export function createGoogleEnrichmentRunId() {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `google-bulk-${Date.now()}-${suffix}`;
}

/**
 * Best-effort diagnostic write. It intentionally never throws because logging
 * must not become another failure source in the user-confirmed enrichment run.
 * The table is insert-only for browser roles; diagnostics are readable only by
 * trusted/admin tooling.
 */
export async function writeGoogleEnrichmentDiagnostic(input: GoogleEnrichmentDiagnosticInput) {
  try {
    const errorMessage = input.error == null ? null : sanitizeGoogleDiagnosticText(input.error);
    const meta = sanitizeMetaValue(input.meta || {}) as Record<string, unknown>;
    const { error } = await supabase.from("amd_google_enrichment_diagnostics").insert({
      run_id: input.runId.slice(0, 160),
      stage: input.stage.slice(0, 64),
      place_id: input.placeId?.slice(0, 200) || null,
      place_name: input.placeName?.slice(0, 300) || null,
      ok: input.ok,
      error_message: errorMessage,
      meta,
    });
    return !error;
  } catch {
    return false;
  }
}
