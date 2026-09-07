import type { Place } from "@/types/place";
export const FAVORITES_KEY = "around-dorm-favorites-v2";
export function loadFavorites(): Place[] {
  if (typeof window === "undefined") return [];
  try { const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}
export function saveFavorites(places: Place[]) {
  if (typeof window !== "undefined") localStorage.setItem(FAVORITES_KEY, JSON.stringify(places.slice(0, 100)));
}
