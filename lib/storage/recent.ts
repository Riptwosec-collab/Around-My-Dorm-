import type { Place } from "@/types/place";
import type { RecentView } from "@/types/app";

const MAX_RECENT_VIEWS = 100;

export function addRecentView(current: RecentView[], place: Place, central: boolean): RecentView[] {
  const view: RecentView = { placeId: place.id, viewedAt: new Date().toISOString(), source: central ? "seed" : place.googlePlaceId ? "google" : "unknown", snapshot: central ? undefined : place };
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
    seen.add(view.placeId); result.push(place);
  }
  return result;
}

export function bangkokDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

export function getTodayRecentStats(views: RecentView[], places: Place[], now = new Date()) {
  const todayKey = bangkokDateKey(now); const byId = new Map(places.map((place) => [place.id, place]));
  const today = views.filter((view) => { const time = new Date(view.viewedAt); return !Number.isNaN(time.getTime()) && bangkokDateKey(time) === todayKey; });
  const placeIds = new Set(today.map((view) => view.placeId)); const categories = new Set<string>(); const areas = new Set<string>();
  for (const view of today) { const place = byId.get(view.placeId) || view.snapshot; if (!place) continue; categories.add(place.category); if (place.area) areas.add(place.area); }
  return { viewCount: today.length, placeCount: placeIds.size, categoryCount: categories.size, areaCount: areas.size };
}
