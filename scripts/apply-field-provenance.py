from pathlib import Path

ROOT = Path('.')

types_path = ROOT / 'types/place.ts'
types = types_path.read_text(encoding='utf-8')

source_types = '''export type FieldProvenanceSource =
  | "manual_verified"
  | "official"
  | "seed"
  | "approved_import"
  | "google_places_admin"
  | "google_places_live"
  | "fallback";

export type FieldProvenanceConfidence = "verified" | "high" | "medium" | "low";

export type FieldProvenanceEntry = {
  source: FieldProvenanceSource;
  checkedAt: string;
  verifiedAt?: string | null;
  confidence: FieldProvenanceConfidence;
  sourceId?: string | null;
  sourceUrl?: string | null;
};

'''
marker = 'export type Pricing = {'
if 'export type FieldProvenanceSource' not in types:
    if marker not in types:
        raise SystemExit('types marker missing')
    types = types.replace(marker, source_types + marker, 1)

field_marker = '  parkingVerifiedAt?: string | null;\n  notes: string | null;'
if 'fieldProvenance?: Record<string, FieldProvenanceEntry>;' not in types:
    if field_marker not in types:
        raise SystemExit('field provenance insertion marker missing')
    types = types.replace(field_marker, '  parkingVerifiedAt?: string | null;\n  fieldProvenance?: Record<string, FieldProvenanceEntry>;\n  notes: string | null;', 1)
types_path.write_text(types, encoding='utf-8')

module = r'''import type { FieldProvenanceEntry, FieldProvenanceSource, Place } from "@/types/place";

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
'''
(ROOT / 'lib/field-provenance.ts').write_text(module, encoding='utf-8')

db_path = ROOT / 'lib/database/places.ts'
db = db_path.read_text(encoding='utf-8')
import_marker = 'import type { Place } from "@/types/place";'
prov_import = 'import { prepareProvenancePatch } from "@/lib/field-provenance";'
if prov_import not in db:
    db = db.replace(import_marker, import_marker + '\n' + prov_import, 1)
old_fn_start = 'export function applyLocalPlacePatch(place: Place, patch: Partial<Place>, source = "manual_review") {'
start = db.find(old_fn_start)
end_marker = '\n\nexport function addReviewedLocalPlace'
end = db.find(end_marker, start)
if start == -1 or end == -1:
    raise SystemExit('applyLocalPlacePatch block not found')
new_fn = '''export type ApplyLocalPlacePatchResult = { appliedFields: string[]; blockedFields: string[] };

export function applyLocalPlacePatch(place: Place, patch: Partial<Place>, source = "manual_review"): ApplyLocalPlacePatchResult {
  if (typeof window === "undefined") return { appliedFields: [], blockedFields: [] };
  const overrides = parseLocal<Record<string, LocalPlaceOverride>>(OVERRIDES_KEY, {});
  const appliedAt = new Date().toISOString();
  const prepared = prepareProvenancePatch(place, patch, source, appliedAt);
  if (!prepared.appliedFields.length) return { appliedFields: [], blockedFields: prepared.blockedFields };

  const guardedPatch = prepared.patch;
  const previousData: Partial<Place> = {};
  for (const key of Object.keys(guardedPatch) as Array<keyof Place>) previousData[key] = place[key] as never;
  overrides[place.id] = { placeId: place.id, patch: { ...(overrides[place.id]?.patch || {}), ...guardedPatch }, appliedAt, source };
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));

  const history = parseLocal<LocalPlaceHistory[]>(HISTORY_KEY, []);
  const entry: LocalPlaceHistory = { id: `${place.id}-${Date.now()}`, placeId: place.id, placeName: place.name, changedAt: appliedAt, source, previousData, newData: guardedPatch };
  localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...history].slice(0, 200)));
  return { appliedFields: prepared.appliedFields, blockedFields: prepared.blockedFields };
}'''
db = db[:start] + new_fn + db[end:]
db_path.write_text(db, encoding='utf-8')

# Make safe auto-apply provenance-aware without changing explicit human field review semantics.
data_path = ROOT / 'components/DataManagement.tsx'
data = data_path.read_text(encoding='utf-8')
old = '''    const patch = Object.fromEntries(safeFields.map((field) => [field.field, field.incomingValue])) as Partial<Place>;
    applyLocalPlacePatch(place, patch, change.source);
    const next = pending.filter((item) => item.id !== changeId);
    savePendingPlaceChanges(next);
    setPending(next);
    setHistory(loadLocalPlaceHistory());
    onReload();'''
new = '''    const patch = Object.fromEntries(safeFields.map((field) => [field.field, field.incomingValue])) as Partial<Place>;
    const result = applyLocalPlacePatch(place, patch, change.source);
    if (!result.appliedFields.length) {
      setMessage(language === "en" ? "Protected higher-confidence fields were not overwritten." : "ไม่ได้เขียนทับฟิลด์ที่มีแหล่งข้อมูลความมั่นใจสูงกว่า");
      return;
    }
    const applied = new Set(result.appliedFields);
    const next = pending.flatMap((item) => {
      if (item.id !== changeId) return [item];
      const fields = item.fields.filter((field) => !applied.has(String(field.field)));
      if (!fields.length) return [];
      const risk = (fields.some((field) => field.risk === "high") ? "high" : fields.some((field) => field.risk === "review") ? "review" : "safe") as "safe" | "review" | "high";
      return [{ ...item, fields, risk }];
    });
    savePendingPlaceChanges(next);
    setPending(next);
    if (result.blockedFields.length) setMessage(language === "en" ? `${result.blockedFields.length} protected field(s) kept for review.` : `เก็บ ${result.blockedFields.length} ฟิลด์ที่มีแหล่งข้อมูลความมั่นใจสูงกว่าไว้ตรวจสอบ`);
    setHistory(loadLocalPlaceHistory());
    onReload();'''
if old not in data:
    raise SystemExit('safe apply block not found')
data = data.replace(old, new, 1)
old_single = '''    applyLocalPlacePatch(place, { [field.field]: field.incomingValue } as Partial<Place>, `${change.source}:field_review`);
    resolveFieldDecision(changeId, fieldName);
    setHistory(loadLocalPlaceHistory());
    onReload();'''
new_single = '''    const result = applyLocalPlacePatch(place, { [field.field]: field.incomingValue } as Partial<Place>, `${change.source}:field_review`);
    if (!result.appliedFields.includes(fieldName)) {
      setMessage(language === "en" ? "Field was protected and not changed." : "ฟิลด์นี้ถูกป้องกันและไม่ได้เปลี่ยนแปลง");
      return;
    }
    resolveFieldDecision(changeId, fieldName);
    setHistory(loadLocalPlaceHistory());
    onReload();'''
if old_single not in data:
    raise SystemExit('single field apply block not found')
data = data.replace(old_single, new_single, 1)
data_path.write_text(data, encoding='utf-8')

tests = r'''import { describe, expect, it } from "vitest";
import { evaluateFieldWrite, normalizeFieldSource, prepareProvenancePatch } from "@/lib/field-provenance";
import type { Place } from "@/types/place";

function place(overrides: Partial<Place> = {}) {
  return {
    id: "p1",
    name: "Verified Local Shop",
    source: ["seed"],
    verified: true,
    phone: "021234567",
    googlePlaceId: null,
    lastVerified: "2026-09-01T00:00:00.000Z",
    ...overrides,
  } as Place;
}

describe("field provenance", () => {
  it("normalizes explicit human review as highest-confidence provenance", () => {
    expect(normalizeFieldSource("google_places_admin:field_review")).toBe("manual_verified");
  });

  it("protects a known verified seed field from lower-priority Google enrichment", () => {
    const decision = evaluateFieldWrite(place(), "phone", "029999999", "google_places_admin");
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("protected_higher_confidence");
  });

  it("allows Google to fill a genuinely missing field", () => {
    const decision = evaluateFieldWrite(place({ phone: null }), "phone", "029999999", "google_places_admin");
    expect(decision.allowed).toBe(true);
  });

  it("allows an explicit reviewed field choice and records verified provenance", () => {
    const result = prepareProvenancePatch(place(), { phone: "029999999" }, "google_places_admin:field_review", "2026-09-08T00:00:00.000Z");
    expect(result.blockedFields).toEqual([]);
    expect(result.appliedFields).toContain("phone");
    expect(result.patch.fieldProvenance?.phone.source).toBe("manual_verified");
    expect(result.patch.fieldProvenance?.phone.confidence).toBe("verified");
  });

  it("does not downgrade a populated value to null through an automatic source", () => {
    const result = prepareProvenancePatch(place(), { phone: null }, "approved_import");
    expect(result.appliedFields).toEqual([]);
    expect(result.blockedFields).toContain("phone");
  });
});
'''
(ROOT / 'tests/field-provenance.test.ts').write_text(tests, encoding='utf-8')

print('Field-level provenance and overwrite protection staged')
