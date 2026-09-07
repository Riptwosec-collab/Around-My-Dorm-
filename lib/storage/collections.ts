import type { SavedCollection } from "@/types/app";
export const COLLECTIONS_KEY = "around-dorm-collections-v1";
export const DEFAULT_COLLECTIONS: SavedCollection[] = [
  { id: "wishlist", title: "อยากไป", icon: "🔖", placeIds: [] },
  { id: "regular", title: "ร้านประจำ", icon: "⭐", placeIds: [] },
  { id: "late", title: "ร้านดึก", icon: "🌙", placeIds: [] },
  { id: "work", title: "คาเฟ่นั่งทำงาน", icon: "💻", placeIds: [] },
];
export function loadCollections(): SavedCollection[] {
  if (typeof window === "undefined") return DEFAULT_COLLECTIONS;
  try { const value = JSON.parse(localStorage.getItem(COLLECTIONS_KEY) || "null"); return Array.isArray(value) && value.length ? value : DEFAULT_COLLECTIONS; } catch { return DEFAULT_COLLECTIONS; }
}
export function saveCollections(collections: SavedCollection[]) {
  if (typeof window !== "undefined") localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
}
