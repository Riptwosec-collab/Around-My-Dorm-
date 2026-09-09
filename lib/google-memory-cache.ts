type CacheEnvelope<T> = { expiresAt: number; value: T };
const cache = new Map<string, CacheEnvelope<unknown>>();

export function readGoogleMemoryCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEnvelope<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.value;
}

export function writeGoogleMemoryCache<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

export function clearGoogleMemoryCache() { cache.clear(); }
