import type { FieldProvenanceEntry, FieldProvenanceSource, Place } from "@/types/place";

const PRIORITY: Record<FieldProvenanceSource, number> = {
  manual_verified: 100,
  official: 90,
  seed: 80,
  approved_import: 65,
  google_places_admin: 45,
  google_places_live: 35,
  fallback: 0,
};

const META_FIELDS = new Set(["fieldProvenance", "lastUpdated", "lastChecked", "lastVerified", "dataSources", "source"]);

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function normalizeFieldSource(label: string): FieldProvenanceSource {
  const value = label.toLowerCase();
  if (value.includes("field_review") || value.includes("manual") || value.includes("rollback")) return "manual_verified";
  if (value.includes("official")) return "official";
  if (value.includes("seed")) return "seed";
  if (value.includes("google_places_admin")) return "google_places_admin";
  if (value.includes("google_places_live") || value === "google_places") return "google_places_live";
  if (value.includes("fallback")) return "fallback";
  return "approved_import";
}

function bestExistingSource(place: Place): FieldProvenanceSource {
  const sources = (place.source || []).map(normalizeFieldSource);
  if (!sources.length) return place.verified ? "seed" : "approved_import";
  return sources.sort((a, b) => PRIORITY[b] - PRIORITY[a])[0];
}

export function inferFieldProvenance(place: Place, field: string): FieldProvenanceEntry {
  const stored = place.fieldProvenance?.[field];
  if (stored) return stored;
  const source = bestExistingSource(place);
  const checkedAt = place.lastChecked || place.lastUpdated || place.lastVerified || new Date(0).toISOString();
  return {
    source,
    checkedAt,
    verifiedAt: place.lastVerified,
    confidence: place.verified ? "high" : source === "fallback" ? "low" : "medium",
    sourceId: place.sourceId ?? null,
    sourceUrl: place.sourceUrl ?? null,
  };
}

export type FieldWriteDecision = {
  allowed: boolean;
  reason: "empty_target" | "manual_review" | "higher_or_equal_priority" | "protected_higher_confidence" | "null_downgrade";
  current: FieldProvenanceEntry;
  incomingSource: FieldProvenanceSource;
};

export function evaluateFieldWrite(place: Place, field: string, incomingValue: unknown, sourceLabel: string): FieldWriteDecision {
  const currentValue = (place as unknown as Record<string, unknown>)[field];
  const current = inferFieldProvenance(place, field);
  const incomingSource = normalizeFieldSource(sourceLabel);

  if (!hasValue(currentValue)) return { allowed: true, reason: "empty_target", current, incomingSource };
  if (incomingSource === "manual_verified") return { allowed: true, reason: "manual_review", current, incomingSource };
  if (!hasValue(incomingValue)) return { allowed: false, reason: "null_downgrade", current, incomingSource };
  if (PRIORITY[incomingSource] >= PRIORITY[current.source]) return { allowed: true, reason: "higher_or_equal_priority", current, incomingSource };
  return { allowed: false, reason: "protected_higher_confidence", current, incomingSource };
}

export type PreparedProvenancePatch = {
  patch: Partial<Place>;
  appliedFields: string[];
  blockedFields: string[];
};

export function prepareProvenancePatch(place: Place, patch: Partial<Place>, sourceLabel: string, checkedAt = new Date().toISOString()): PreparedProvenancePatch {
  const accepted: Record<string, unknown> = {};
  const appliedFields: string[] = [];
  const blockedFields: string[] = [];
  const provenance: Record<string, FieldProvenanceEntry> = { ...(place.fieldProvenance || {}) };
  const normalizedSource = normalizeFieldSource(sourceLabel);

  for (const [field, value] of Object.entries(patch)) {
    if (META_FIELDS.has(field)) {
      if (field !== "fieldProvenance") accepted[field] = value;
      continue;
    }
    const decision = evaluateFieldWrite(place, field, value, sourceLabel);
    if (!decision.allowed) {
      blockedFields.push(field);
      continue;
    }
    accepted[field] = value;
    appliedFields.push(field);
    provenance[field] = {
      source: normalizedSource,
      checkedAt,
      verifiedAt: normalizedSource === "manual_verified" || normalizedSource === "official" ? checkedAt : null,
      confidence: normalizedSource === "manual_verified" ? "verified" : normalizedSource === "official" || normalizedSource === "seed" ? "high" : normalizedSource === "fallback" ? "low" : "medium",
      sourceId: place.sourceId ?? null,
      sourceUrl: place.sourceUrl ?? null,
    };
  }

  if (appliedFields.length) accepted.fieldProvenance = provenance;
  return { patch: accepted as Partial<Place>, appliedFields, blockedFields };
}

export function provenancePriority(source: FieldProvenanceSource) {
  return PRIORITY[source];
}
