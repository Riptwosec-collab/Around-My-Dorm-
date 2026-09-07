import type { Place } from "@/types/place";
import type { RecentView } from "@/types/app";

export const RECENT_VIEWS_KEY = "around-dorm-recent-views-v2";
const LEGACY_RECENT_KEY = "around-dorm-recent-v2";
const LEGACY_META_KEY = "around-dorm-recent-meta-v1";
const MAX_RECENT_VIEWS = 100;

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function loadRecentViews(centralPlaces: Place[]): RecentView[] {
  if (typeof window === "undefined") return [];
  const current = safeParse<RecentView[]>(localStorage.getItem(RECENT_VIEWS_KEY), []);
  if (Array.isArray(current) && current.length) {
    return current.filter((item) => item && typeof item.placeId === "string" && typeof item.viewedAt === "string").slice(0, MAX_RECENT_VIEWS);
  }

  const legacy = safeParse<Place[]>(localStorage.getItem(LEGACY_RECENT_KEY), []);
  const meta = safeParse<Record<string, string>>(localStorage.getItem(LEGACY_META_KEY), {});
  if (!Array.isArray(legacy) || !legacy.length) return [];
  const centralIds = new Set(centralPlaces.map((place) => place.id));
  const migrated = legacy.map((place, index): RecentView => ({
    placeId: place.id,
    viewedAt: meta[place.id] || new Date(Date.now() - index * 60_000).toISOString(),
    source: centralIds.has(place.id) ? "seed" : place.googlePlaceId ? "google" : "unknown",
    snapshot: centralIds.has(place.id) ? undefined : place,
  }));
  saveRecentViews(migrated);
  return migrated;
}

export function saveRecentViews(views: RecentView[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(RECENT_VIEWS_KEY, JSON.stringify(views.slice(0, MAX_RECENT_VIEWS)));
}

export function addRecentView(current: RecentView[], place: Place, central: boolean): RecentView[] {
  const view: RecentView = {
    placeId: place.id,
    viewedAt: new Date().toISOString(),
    source: central ? "seed" : place.googlePlaceId ? "google" : "unknown",
    snapshot: central ? undefined : place,
  };
  return [view, ...current].slice(0, MAX_RECENT_VIEWS);
}

export function resolveRecentPlaces(views: RecentView[], places: Place[]): Place[] {
  const byId = new Map(places.map((place) => [place.id, place]));
  const result: Place[] = [];
  const seen = new Set<string>();
  for (const view of views) {
    if (seen.has(view.placeId)) continue;
    const place = byId.get(view.placeId) || view.snapshot;
    if (!place) continue;
    seen.add(view.placeId);
    result.push(place);
  }
  return result;
}

export function bangkokDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function getTodayRecentStats(views: RecentView[], places: Place[], now = new Date()) {
  const todayKey = bangkokDateKey(now);
  const byId = new Map(places.map((place) => [place.id, place]));
  const today = views.filter((view) => {
    const time = new Date(view.viewedAt);
    return !Number.isNaN(time.getTime()) && bangkokDateKey(time) === todayKey;
  });
  const placeIds = new Set(today.map((view) => view.placeId));
  const categories = new Set<string>();
  const areas = new Set<string>();
  for (const view of today) {
    const place = byId.get(view.placeId) || view.snapshot;
    if (!place) continue;
    categories.add(place.category);
    if (place.area) areas.add(place.area);
  }
  return {
    viewCount: today.length,
    placeCount: placeIds.size,
    categoryCount: categories.size,
    areaCount: areas.size,
  };
}
