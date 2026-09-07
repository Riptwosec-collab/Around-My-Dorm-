import type { Place } from "@/types/place";

type CacheEntry = { storedAt: number; expiresAt: number; staleUntil: number; data: Place[] };
const memory = new Map<string, CacheEntry>();
const PREFIX = "amd-google-places-cache:";

export function makeGooglePlacesCacheKey(input: {
  query: string; category: string; radius: number; lat: number; lng: number; language: string;
}) {
  const roundedLat = Math.round(input.lat * 10000) / 10000;
  const roundedLng = Math.round(input.lng * 10000) / 10000;
  return JSON.stringify([input.query.trim().toLowerCase(), input.category, input.radius, roundedLat, roundedLng, input.language]);
}

export function getGooglePlacesCache(key: string): { data: Place[]; stale: boolean } | null {
  const now = Date.now();
  let entry = memory.get(key) || null;
  if (!entry && typeof sessionStorage !== "undefined") {
    try { entry = JSON.parse(sessionStorage.getItem(PREFIX + key) || "null") as CacheEntry | null; } catch { entry = null; }
    if (entry) memory.set(key, entry);
  }
  if (!entry || now > entry.staleUntil) return null;
  return { data: entry.data, stale: now > entry.expiresAt };
}

export function setGooglePlacesCache(key: string, data: Place[], ttlMs = 10 * 60_000) {
  const now = Date.now();
  const entry: CacheEntry = { storedAt: now, expiresAt: now + ttlMs, staleUntil: now + ttlMs * 3, data };
  memory.set(key, entry);
  if (typeof sessionStorage !== "undefined") {
    try { sessionStorage.setItem(PREFIX + key, JSON.stringify(entry)); } catch {}
  }
}
