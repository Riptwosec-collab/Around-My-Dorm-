import type { CategoryId, SortMode } from "@/types/place";

export type Tab = "explore" | "map" | "favorites" | "recent" | "settings";
export type OriginMode = "dorm" | "me" | "custom";
export type Language = "th" | "en";
export type ThemeMode = "light" | "dark" | "system";
export type QuickFilter = "open" | "near" | "cafe" | "late" | "parking" | null;
export type MapLoadState = "idle" | "loading" | "ready" | "missing" | "error";

export type AppSettings = {
  theme: ThemeMode;
  language: Language;
  notifications: boolean;
  newPlaceAlerts: boolean;
  promoAlerts: boolean;
  parkingAlerts: boolean;
  verifiedOnly: boolean;
  defaultRadius: number;
  preferredCategories: CategoryId[];
  homeMode: OriginMode;
  customHomeLocation: { name: string; latitude: number; longitude: number } | null;
};

export type SavedCollection = {
  id: string;
  title: string;
  icon: string;
  placeIds: string[];
};

export const SETTINGS_KEY = "around-dorm-settings-v3";
export const COLLECTIONS_KEY = "around-dorm-collections-v1";
export const RECENT_META_KEY = "around-dorm-recent-meta-v1";

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  language: "th",
  notifications: true,
  newPlaceAlerts: true,
  promoAlerts: true,
  parkingAlerts: true,
  verifiedOnly: false,
  defaultRadius: 500,
  preferredCategories: [],
  homeMode: "dorm",
  customHomeLocation: null,
};

export const DEFAULT_COLLECTIONS: SavedCollection[] = [
  { id: "wishlist", title: "อยากไป", icon: "🔖", placeIds: [] },
  { id: "regular", title: "ร้านประจำ", icon: "⭐", placeIds: [] },
  { id: "late", title: "ร้านดึก", icon: "🌙", placeIds: [] },
  { id: "work", title: "คาเฟ่นั่งทำงาน", icon: "💻", placeIds: [] },
];

export const RADII = [
  { label: "250 ม.", value: 250 },
  { label: "500 ม.", value: 500 },
  { label: "1 กม.", value: 1000 },
  { label: "2 กม.", value: 2000 },
  { label: "3 กม.", value: 3000 },
  { label: "5 กม.", value: 5000 },
] as const;

export const FOOD_CATEGORIES = new Set<CategoryId>([
  "food",
  "local_food",
  "noodle",
  "thai_food",
  "isan_food",
  "mookata",
  "japanese",
  "korean_food",
  "vietnamese_food",
  "hotpot",
  "bbq",
  "chinese_food",
  "night_food",
]);

export const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: "recommended", label: "แนะนำ" },
  { id: "distanceAsc", label: "ใกล้ที่สุด" },
  { id: "distanceDesc", label: "ไกลที่สุด" },
  { id: "rating", label: "คะแนนสูงสุด" },
  { id: "reviews", label: "รีวิวเยอะ" },
  { id: "price", label: "ราคาถูก" },
  { id: "openNow", label: "เปิดอยู่" },
  { id: "local", label: "Local" },
  { id: "late", label: "ร้านดึก" },
];

export const TAB_ROUTES: Record<Tab, string> = {
  explore: "/",
  map: "/map/",
  favorites: "/saved/",
  recent: "/recent/",
  settings: "/settings/",
};

export function tabFromPath(pathname: string): Tab {
  if (pathname.startsWith("/map")) return "map";
  if (pathname.startsWith("/saved") || pathname.startsWith("/favorites")) return "favorites";
  if (pathname.startsWith("/recent")) return "recent";
  if (pathname.startsWith("/settings")) return "settings";
  return "explore";
}
