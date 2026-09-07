import { PLACES as EMBEDDED_PLACES } from "@/data/places";
import type { Place } from "@/types/place";

export type PlaceDatabaseSource = "supabase" | "embedded";

export type PlaceDatabaseResult = {
  places: Place[];
  source: PlaceDatabaseSource;
  loadedAt: string;
  warning: string | null;
};

const CACHE_KEY = "around-dorm-place-database-cache-v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function readClientCache(): Place[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; places: Place[] };
    if (!Array.isArray(parsed.places) || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
    return parsed.places;
  } catch {
    return null;
  }
}

function writeClientCache(places: Place[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), places }));
  } catch {}
}

async function loadFromSupabase(): Promise<Place[] | null> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!baseUrl || !anonKey) return null;

  const response = await fetch(`${baseUrl}/rest/v1/places?select=*&order=name.asc`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Place database request failed (${response.status})`);
  const rows = (await response.json()) as Place[];
  return Array.isArray(rows) ? rows : [];
}

/**
 * Primary runtime place loader.
 *
 * Normal browsing only reads the Around My Dorm database. It never performs
 * Google/Mapbox/other POI discovery. When Supabase is not configured yet, the
 * embedded normalized dataset is the durable database fallback.
 */
export async function loadPlacesFromDatabase(): Promise<PlaceDatabaseResult> {
  try {
    const remote = await loadFromSupabase();
    if (remote) {
      writeClientCache(remote);
      return { places: remote, source: "supabase", loadedAt: new Date().toISOString(), warning: null };
    }
  } catch (error) {
    const cached = readClientCache();
    if (cached?.length) {
      return {
        places: cached,
        source: "supabase",
        loadedAt: new Date().toISOString(),
        warning: error instanceof Error ? error.message : "Database unavailable; using cache",
      };
    }
  }

  return {
    places: EMBEDDED_PLACES,
    source: "embedded",
    loadedAt: new Date().toISOString(),
    warning: null,
  };
}

export function embeddedPlaces(): Place[] {
  return EMBEDDED_PLACES;
}
