import { PLACES as EMBEDDED_PLACES } from "@/data/places";
import type { Place } from "@/types/place";

export type PlaceDatabaseSource = "supabase" | "embedded";

export type PlaceDatabaseResult = {
  places: Place[];
  source: PlaceDatabaseSource;
  loadedAt: string;
  warning: string | null;
};

export type LocalPlaceOverride = {
  placeId: string;
  patch: Partial<Place>;
  appliedAt: string;
  source: string;
};

export type LocalPlaceHistory = {
  id: string;
  placeId: string;
  placeName: string;
  changedAt: string;
  source: string;
  previousData: Partial<Place>;
  newData: Partial<Place>;
};

const CACHE_KEY = "around-dorm-place-database-cache-v1";
const OVERRIDES_KEY = "around-dorm-place-database-overrides-v1";
const ADDITIONS_KEY = "around-dorm-place-database-additions-v1";
const HISTORY_KEY = "around-dorm-place-update-history-v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function parseLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readClientCache(): Place[] | null {
  const parsed = parseLocal<{ savedAt: number; places: Place[] } | null>(CACHE_KEY, null);
  if (!parsed || !Array.isArray(parsed.places) || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
  return parsed.places;
}

function writeClientCache(places: Place[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), places })); } catch {}
}

function applyLocalDatabaseLayer(places: Place[]) {
  const overrides = parseLocal<Record<string, LocalPlaceOverride>>(OVERRIDES_KEY, {});
  const additions = parseLocal<Place[]>(ADDITIONS_KEY, []);
  const base = places.map((place) => {
    const override = overrides[place.id];
    if (!override) return place;
    return {
      ...place,
      ...override.patch,
      source: Array.from(new Set([...(place.source || []), override.source])),
      lastUpdated: override.appliedAt,
    };
  });
  const known = new Set(base.map((place) => place.id));
  return [...base, ...additions.filter((place) => !known.has(place.id))];
}

function isPlaceRecord(value: unknown): value is Place {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Place>;
  return typeof record.id === "string" && typeof record.name === "string" && typeof record.slug === "string" && Array.isArray(record.categories);
}

async function loadFromSupabase(): Promise<Place[] | null> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!baseUrl || !anonKey) return null;

  // The persistent schema stores the complete normalized Place object in `record`.
  // This prevents SQL naming conventions from leaking into the TypeScript domain model.
  const response = await fetch(`${baseUrl}/rest/v1/places?select=record&order=name.asc`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Place database request failed (${response.status})`);
  const rows = (await response.json()) as Array<{ record?: unknown }>;
  if (!Array.isArray(rows)) return null;
  const places = rows.map((row) => row.record).filter(isPlaceRecord);
  // An empty/unseeded table should not blank the app; use the embedded database until seeded.
  return places.length ? places : null;
}

/** Primary runtime place loader. No external POI discovery is performed here. */
export async function loadPlacesFromDatabase(): Promise<PlaceDatabaseResult> {
  try {
    const remote = await loadFromSupabase();
    if (remote) {
      writeClientCache(remote);
      return { places: applyLocalDatabaseLayer(remote), source: "supabase", loadedAt: new Date().toISOString(), warning: null };
    }
  } catch (error) {
    const cached = readClientCache();
    if (cached?.length) {
      return {
        places: applyLocalDatabaseLayer(cached),
        source: "supabase",
        loadedAt: new Date().toISOString(),
        warning: error instanceof Error ? error.message : "Database unavailable; using cache",
      };
    }
  }

  return { places: applyLocalDatabaseLayer(EMBEDDED_PLACES), source: "embedded", loadedAt: new Date().toISOString(), warning: null };
}

export function applyLocalPlacePatch(place: Place, patch: Partial<Place>, source = "manual_review") {
  if (typeof window === "undefined") return;
  const overrides = parseLocal<Record<string, LocalPlaceOverride>>(OVERRIDES_KEY, {});
  const appliedAt = new Date().toISOString();
  const previousData: Partial<Place> = {};
  for (const key of Object.keys(patch) as Array<keyof Place>) previousData[key] = place[key] as never;
  overrides[place.id] = { placeId: place.id, patch: { ...(overrides[place.id]?.patch || {}), ...patch }, appliedAt, source };
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));

  const history = parseLocal<LocalPlaceHistory[]>(HISTORY_KEY, []);
  const entry: LocalPlaceHistory = { id: `${place.id}-${Date.now()}`, placeId: place.id, placeName: place.name, changedAt: appliedAt, source, previousData, newData: patch };
  localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...history].slice(0, 200)));
}

export function addReviewedLocalPlace(place: Place, source = "manual") {
  if (typeof window === "undefined") return;
  const additions = parseLocal<Place[]>(ADDITIONS_KEY, []);
  if (additions.some((item) => item.id === place.id)) return;
  const now = new Date().toISOString();
  const next: Place = {
    ...place,
    source: Array.from(new Set([...(place.source || []), source])),
    sourceId: place.sourceId ?? null,
    sourceUrl: place.sourceUrl ?? null,
    lastChecked: place.lastChecked ?? now,
    lastUpdated: now,
  };
  localStorage.setItem(ADDITIONS_KEY, JSON.stringify([next, ...additions].slice(0, 500)));
  const history = parseLocal<LocalPlaceHistory[]>(HISTORY_KEY, []);
  const entry: LocalPlaceHistory = { id: `${place.id}-${Date.now()}`, placeId: place.id, placeName: place.name, changedAt: now, source, previousData: {}, newData: next };
  localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...history].slice(0, 200)));
}

export function loadLocalPlaceHistory() {
  return parseLocal<LocalPlaceHistory[]>(HISTORY_KEY, []);
}

export function rollbackLocalPlaceHistory(entry: LocalPlaceHistory) {
  if (typeof window === "undefined") return;
  if (Object.keys(entry.previousData).length === 0) {
    const additions = parseLocal<Place[]>(ADDITIONS_KEY, []);
    localStorage.setItem(ADDITIONS_KEY, JSON.stringify(additions.filter((place) => place.id !== entry.placeId)));
  } else {
    const overrides = parseLocal<Record<string, LocalPlaceOverride>>(OVERRIDES_KEY, {});
    const current = overrides[entry.placeId];
    if (current) {
      overrides[entry.placeId] = { ...current, patch: { ...current.patch, ...entry.previousData }, appliedAt: new Date().toISOString(), source: "rollback" };
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
    }
  }
  localStorage.setItem(HISTORY_KEY, JSON.stringify(loadLocalPlaceHistory().filter((item) => item.id !== entry.id)));
}

export function embeddedPlaces(): Place[] {
  return EMBEDDED_PLACES;
}
