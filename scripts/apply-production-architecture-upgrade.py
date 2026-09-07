from __future__ import annotations

from pathlib import Path
import json
import re
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]


def write_text(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.strip() + "\n", encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Patch target not found: {label}")
    return text.replace(old, new, 1)


def png_bytes(size: int, maskable: bool = False) -> bytes:
    # Tiny dependency-free RGBA PNG generator for PWA icons.
    rows = bytearray()
    cx = cy = (size - 1) / 2
    radius = size * (0.31 if maskable else 0.40)
    ring = size * 0.025
    for y in range(size):
        rows.append(0)
        for x in range(size):
            dx, dy = x - cx, y - cy
            d = (dx * dx + dy * dy) ** 0.5
            # midnight background + electric-blue locator motif
            if d <= radius:
                if d >= radius - ring:
                    rgba = (0, 217, 255, 255)
                else:
                    t = max(0.0, min(1.0, d / radius))
                    rgba = (0, int(122 + 40 * (1 - t)), 255, 255)
            else:
                rgba = (2, 6, 13, 255)
            rows.extend(rgba)
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    raw = zlib.compress(bytes(rows), 9)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


# ---------------------------------------------------------------------------
# Shared application types / localization
# ---------------------------------------------------------------------------
write_text("types/app.ts", r'''
import type { CategoryId, Place } from "@/types/place";

export type Language = "th" | "en";
export type ThemeMode = "light" | "dark" | "system";
export type HomeMode = "dorm" | "me" | "custom";

export type CustomHomeLocation = {
  name: string;
  latitude: number;
  longitude: number;
};

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
  homeMode: HomeMode;
  customHomeLocation: CustomHomeLocation | null;
};

export type SavedCollection = {
  id: string;
  title: string;
  icon: string;
  placeIds: string[];
};

export type RecentView = {
  placeId: string;
  viewedAt: string;
  source?: "seed" | "google" | "unknown";
  snapshot?: Place;
};
''')

write_text("locales/th.ts", r'''
const th: Record<string, string> = {
  explore: "สำรวจ", map: "แผนที่", saved: "บันทึก", recent: "ดูล่าสุด", settings: "ตั้งค่า",
  exploreSubtitle: "ร้านและบริการรอบบ้านสุภา", mapSubtitle: "สถานที่รอบ บ้านสุภาอพาร์ทเม้นต์",
  savedSubtitle: "ร้านและสถานที่ที่คุณเก็บไว้", recentSubtitle: "ตามรอยที่คุณสนใจ ไปต่อได้เลย",
  settingsSubtitle: "ปรับแอปให้เหมาะกับการใช้รอบหอ", search: "ค้นหาร้านค้า คาเฟ่ หรือบริการ",
  searchMap: "ค้นหาสถานที่, ร้านค้า หรือบริการ", openNow: "เปิดอยู่ตอนนี้", near: "ใกล้หอ",
  cafe: "คาเฟ่", late: "ร้านดึก", parking: "ที่จอดรถ", localPick: "Local Pick", nearby: "ใกล้บ้านสุภา",
  viewAll: "ดูทั้งหมด", navigate: "นำทาง", details: "รายละเอียด", emptySaved: "ยังไม่มีร้านที่บันทึก",
  emptyRecent: "ยังไม่มีประวัติการดู", discoverAroundDorm: "ค้นพบรอบหอ", heroLine1: "ทุกที่รอบหอ",
  heroLine2: "ครบ จบ ในแอปเดียว", heroSub: "อัปเดตร้านใหม่ ข้อมูลจริง และทางลัดสำหรับชีวิตรอบหอ",
  viewDormMap: "ดูแผนที่รอบหอ", moreFilters: "+ ตัวกรอง", noMatches: "ไม่พบร้านที่ตรงกับเงื่อนไข",
  clearFilters: "ล้างตัวกรอง", foodNow: "กินอะไรดีตอนนี้", myLocation: "ตำแหน่งของฉัน", currentLocation: "ตำแหน่งปัจจุบัน",
  searchThisArea: "ค้นหาบริเวณนี้", mapRadius: "รัศมีแผนที่", myCollections: "คอลเลกชันของฉัน",
  addItem: "เพิ่มรายการ", latestSaved: "บันทึกล่าสุด", manageCollections: "จัดคอลเลกชัน", rename: "เปลี่ยนชื่อ",
  delete: "ลบ", todayRecent: "ดูล่าสุดวันนี้", places: "สถานที่", categories: "หมวดหมู่", areas: "ทำเล",
  yourLocation: "ตำแหน่งของคุณ", viewOnMap: "ดูบนแผนที่", startLocation: "ตำแหน่งเริ่มต้น",
  startLocationSub: "ใช้เพื่อแนะนำสถานที่รอบหอ", suggestedRadius: "รัศมีค้นหาที่แนะนำ", notifications: "การแจ้งเตือน",
  notificationPreferenceOnly: "บันทึกความต้องการแจ้งเตือนไว้ก่อน — Web Push ยังไม่ได้สมัครใช้งานบนอุปกรณ์นี้",
  newPlaceAlerts: "แจ้งเตือนร้านใหม่", promoAlerts: "แจ้งเตือนโปรโมชั่น", parkingAlerts: "แจ้งเตือนที่จอดรถ",
  theme: "ธีมแอป", themeSub: "เลือกโหมดการแสดงผล", light: "สว่าง", dark: "มืด", system: "ตามระบบ",
  interestedCategories: "หมวดหมู่ที่สนใจ", interestedCategoriesSub: "ใช้เพื่อจัดอันดับคำแนะนำให้ตรงกับคุณ",
  manageCategories: "จัดการหมวดหมู่", verifiedOnly: "แสดงเฉพาะร้านที่ยืนยันแล้ว",
  verifiedOnlySub: "มีผลกับ Explore, Map, Search และคำแนะนำ", language: "ภาษา (Language)", languageSub: "เปลี่ยนภาษาหลักของแอป",
  helpCenter: "ศูนย์ช่วยเหลือ", helpSub: "FAQ และการติดต่อทีมงาน", about: "เกี่ยวกับ Around My Dorm",
  aboutSub: "ข้อมูลแอป นโยบายความเป็นส่วนตัว และข้อกำหนด", savedCount: "ร้านที่บันทึก", recentCount: "ดูล่าสุด",
  placeData: "ข้อมูลร้าน", createCollection: "สร้างคอลเลกชัน", collectionName: "ชื่อคอลเลกชัน", save: "บันทึก",
  cancel: "ยกเลิก", deleteCollection: "ลบคอลเลกชัน", deleteConfirm: "ต้องการลบคอลเลกชันนี้หรือไม่?",
  chooseCollections: "เลือกคอลเลกชัน", categoryPreferences: "หมวดหมู่ที่สนใจ", done: "เสร็จสิ้น",
  homeLocation: "ตำแหน่งเริ่มต้น", dorm: "บ้านสุภาอพาร์ทเม้นต์", useCurrentLocation: "ใช้ตำแหน่งปัจจุบัน",
  customLocation: "ตำแหน่งที่บันทึกเอง", locationName: "ชื่อตำแหน่ง", latitude: "ละติจูด", longitude: "ลองจิจูด",
  helpTitle: "ศูนย์ช่วยเหลือ", faq1: "ทำไมบางร้านไม่มีราคา/เวลา?", faq1Body: "แอปไม่เดาข้อมูลที่ยังไม่มีแหล่งยืนยัน ข้อมูลที่ไม่ทราบจะแสดงว่า ‘ยังไม่มีข้อมูลยืนยัน’",
  faq2: "ทำไมแผนที่บางครั้งไม่โหลด?", faq2Body: "แผนที่สดต้องใช้อินเทอร์เน็ตและ Google Maps API key ที่ถูกต้อง ส่วน Saved/Recent/Seed data ยังเปิดได้แบบออฟไลน์",
  aboutTitle: "เกี่ยวกับ Around My Dorm", aboutBody: "Around My Dorm คือ local discovery app รอบบ้านสุภา เน้นข้อมูลที่ตรวจสอบได้และไม่สร้างข้อมูลร้านขึ้นเอง",
  offline: "ออฟไลน์", offlineBody: "กำลังแสดงข้อมูลที่บันทึกไว้", networkRequired: "ฟังก์ชันนี้ต้องใช้อินเทอร์เน็ต",
  budget: "งบประมาณ", distance: "ระยะทาง", unlimited: "ไม่จำกัด", localOnly: "ร้าน Local เท่านั้น",
  chooseFood: "แนะนำร้านให้ฉัน", noFoodMatch: "ยังไม่พบร้านที่ตรงเงื่อนไข", verified: "ยืนยันแล้ว", unverified: "ยังไม่ยืนยัน",
  close: "ปิด", phone: "โทร", share: "แชร์", mapAction: "แผนที่", aboutPlace: "เกี่ยวกับร้าน", area: "พื้นที่",
  address: "ที่อยู่", walkTime: "เวลาเดิน", motorcycle: "มอเตอร์ไซค์", driveTime: "รถยนต์", price: "ราคา",
  phoneNumber: "เบอร์โทร", parkingInfo: "ที่จอดรถ", popularMenu: "เมนูเด่น", delivery: "สั่ง Delivery",
  amenities: "สิ่งอำนวยความสะดวก", photos: "รูปภาพ", openingHours: "เวลาเปิด", everyDay: "ทุกวัน",
  openingData: "เวลาที่มีข้อมูล", dataVerified: "ข้อมูลผ่านการตรวจสอบ", dataPartial: "ข้อมูลบางส่วนยังไม่ได้ยืนยัน",
  lastVerified: "ตรวจสอบล่าสุด", source: "แหล่งข้อมูล", notes: "หมายเหตุ", reportWrong: "ข้อมูลร้านไม่ถูกต้อง?",
  openGoogleMaps: "เปิด Google Maps", unknownVerified: "ยังไม่มี", unknownData: "ยังไม่มีข้อมูลยืนยัน", unknownRoute: "ยังไม่มีข้อมูล Route",
  noPhone: "ไม่มีเบอร์", monday: "จันทร์", tuesday: "อังคาร", wednesday: "พุธ", thursday: "พฤหัสบดี",
  friday: "ศุกร์", saturday: "เสาร์", sunday: "อาทิตย์", open24: "เปิด 24 ชั่วโมง", popular: "ขายดี",
  food: "อาหาร", service: "บริการ", preferencesOnly: "การตั้งค่านี้เป็น preference เท่านั้นจนกว่าจะสมัคร Web Push",
};
export default th;
''')

write_text("locales/en.ts", r'''
const en: Record<string, string> = {
  explore: "Explore", map: "Map", saved: "Saved", recent: "Recent", settings: "Settings",
  exploreSubtitle: "Places and services around Baan Supar", mapSubtitle: "Places around Baan Supar Apartment",
  savedSubtitle: "Places you have saved", recentSubtitle: "Pick up where you left off",
  settingsSubtitle: "Personalize your local discovery app", search: "Search shops, cafes or services",
  searchMap: "Search places, shops or services", openNow: "Open now", near: "Near dorm", cafe: "Cafe", late: "Late night",
  parking: "Parking", localPick: "Local Pick", nearby: "Near Baan Supar", viewAll: "View all", navigate: "Navigate",
  details: "Details", emptySaved: "No saved places yet", emptyRecent: "No recent history yet", discoverAroundDorm: "Discover nearby",
  heroLine1: "Everything nearby", heroLine2: "One app for dorm life", heroSub: "New places, verified data and shortcuts for daily life around your dorm",
  viewDormMap: "View dorm map", moreFilters: "+ Filters", noMatches: "No places match these filters", clearFilters: "Clear filters",
  foodNow: "What should I eat now?", myLocation: "My location", currentLocation: "Current location", searchThisArea: "Search this area",
  mapRadius: "Map radius", myCollections: "My collections", addItem: "Add", latestSaved: "Recently saved", manageCollections: "Manage collections",
  rename: "Rename", delete: "Delete", todayRecent: "Viewed today", places: "places", categories: "categories", areas: "areas",
  yourLocation: "Your location", viewOnMap: "View on map", startLocation: "Start location", startLocationSub: "Used for nearby recommendations",
  suggestedRadius: "Suggested search radius", notifications: "Notifications", notificationPreferenceOnly: "Notification preferences are saved, but this device is not subscribed to Web Push yet",
  newPlaceAlerts: "New place alerts", promoAlerts: "Promotion alerts", parkingAlerts: "Parking alerts", theme: "App theme", themeSub: "Choose display mode",
  light: "Light", dark: "Dark", system: "System", interestedCategories: "Interested categories", interestedCategoriesSub: "Used to personalize recommendation ranking",
  manageCategories: "Manage categories", verifiedOnly: "Show verified places only", verifiedOnlySub: "Affects Explore, Map, Search and recommendations",
  language: "Language", languageSub: "Change the app language", helpCenter: "Help Center", helpSub: "FAQ and support",
  about: "About Around My Dorm", aboutSub: "App information, privacy and terms", savedCount: "Saved places", recentCount: "Recent", placeData: "Place data",
  createCollection: "Create collection", collectionName: "Collection name", save: "Save", cancel: "Cancel", deleteCollection: "Delete collection",
  deleteConfirm: "Delete this collection?", chooseCollections: "Choose collections", categoryPreferences: "Interested categories", done: "Done",
  homeLocation: "Home location", dorm: "Baan Supar Apartment", useCurrentLocation: "Use current location", customLocation: "Custom saved location",
  locationName: "Location name", latitude: "Latitude", longitude: "Longitude", helpTitle: "Help Center",
  faq1: "Why are price or hours missing?", faq1Body: "The app does not invent unverified business data. Unknown fields remain clearly marked as unverified.",
  faq2: "Why is the map sometimes unavailable?", faq2Body: "Live maps require internet access and a valid Google Maps API key. Saved, Recent and seed data remain available offline.",
  aboutTitle: "About Around My Dorm", aboutBody: "Around My Dorm is a local discovery app for the Baan Supar area, focused on verifiable information rather than fabricated business details.",
  offline: "Offline", offlineBody: "Showing saved and cached information", networkRequired: "This feature requires an internet connection",
  budget: "Budget", distance: "Distance", unlimited: "Unlimited", localOnly: "Local only", chooseFood: "Recommend a place", noFoodMatch: "No place matches these choices",
  verified: "Verified", unverified: "Unverified", close: "Close", phone: "Call", share: "Share", mapAction: "Map", aboutPlace: "About this place",
  area: "Area", address: "Address", walkTime: "Walking time", motorcycle: "Motorcycle", driveTime: "Driving time", price: "Price", phoneNumber: "Phone",
  parkingInfo: "Parking", popularMenu: "Popular menu", delivery: "Delivery", amenities: "Amenities", photos: "Photos", openingHours: "Opening hours",
  everyDay: "Every day", openingData: "Available hours", dataVerified: "Information verified", dataPartial: "Some information is still unverified",
  lastVerified: "Last verified", source: "Source", notes: "Notes", reportWrong: "Incorrect business information?", openGoogleMaps: "Open Google Maps",
  unknownVerified: "Not available", unknownData: "No verified data yet", unknownRoute: "No routing data yet", noPhone: "No phone", monday: "Monday",
  tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
  open24: "Open 24 hours", popular: "Popular", food: "Food", service: "Services", preferencesOnly: "This setting is preference-only until Web Push is subscribed",
};
export default en;
''')

write_text("locales/index.ts", r'''
import en from "./en";
import th from "./th";
import type { Language } from "@/types/app";

export function getCopy(language: Language): Record<string, string> {
  return language === "en" ? en : th;
}
''')

# ---------------------------------------------------------------------------
# Storage + recent history model
# ---------------------------------------------------------------------------
write_text("lib/storage/recent.ts", r'''
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
''')

write_text("lib/storage/settings.ts", r'''
import type { AppSettings } from "@/types/app";

export const SETTINGS_KEY = "around-dorm-settings-v3";
export const DEFAULT_APP_SETTINGS: AppSettings = {
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

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_APP_SETTINGS;
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") as Partial<AppSettings> | null;
    return { ...DEFAULT_APP_SETTINGS, ...(parsed || {}), preferredCategories: Array.isArray(parsed?.preferredCategories) ? parsed!.preferredCategories! : [] };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  if (typeof window !== "undefined") localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
''')

write_text("lib/storage/favorites.ts", r'''
import type { Place } from "@/types/place";
export const FAVORITES_KEY = "around-dorm-favorites-v2";
export function loadFavorites(): Place[] {
  if (typeof window === "undefined") return [];
  try { const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}
export function saveFavorites(places: Place[]) {
  if (typeof window !== "undefined") localStorage.setItem(FAVORITES_KEY, JSON.stringify(places.slice(0, 100)));
}
''')

write_text("lib/storage/collections.ts", r'''
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
''')

# ---------------------------------------------------------------------------
# Places cache / map styling
# ---------------------------------------------------------------------------
write_text("lib/google-places-cache.ts", r'''
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
''')

write_text("lib/map-style.ts", r'''
export const LEGACY_DARK_MAP_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#06101d" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#06101d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7f8ea3" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#a8b2c4" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6f8198" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#071b20" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#0d2035" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#07121f" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#12335b" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#0a1728" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#020a14" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#41627d" }] },
];
''')

# ---------------------------------------------------------------------------
# Reusable production sheets/components
# ---------------------------------------------------------------------------
write_text("components/CollectionEditorSheet.tsx", r'''
"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { getCopy } from "@/locales";
import type { Language, SavedCollection } from "@/types/app";

export function CollectionEditorSheet({ mode, collection, language, onClose, onSubmit }: {
  mode: "create" | "rename" | "delete";
  collection?: SavedCollection;
  language: Language;
  onClose: () => void;
  onSubmit: (value?: string) => void;
}) {
  const copy = getCopy(language);
  const [value, setValue] = useState(collection?.title || "");
  useEffect(() => setValue(collection?.title || ""), [collection]);
  return <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/65 backdrop-blur-sm">
    <button type="button" aria-label={copy.close} onClick={onClose} className="absolute inset-0" />
    <section role="dialog" aria-modal="true" className="amd-glass-strong relative w-full max-w-[520px] rounded-t-[30px] p-4 pb-[calc(18px+env(safe-area-inset-bottom))]">
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" />
      <div className="flex items-center justify-between"><h3 className="text-[20px] font-bold">{mode === "create" ? copy.createCollection : mode === "rename" ? copy.rename : copy.deleteCollection}</h3><button type="button" onClick={onClose} className="amd-btn grid h-11 w-11 place-items-center rounded-full"><X className="h-4 w-4" /></button></div>
      {mode === "delete" ? <div className="mt-4 rounded-2xl border border-rose-300/15 bg-rose-300/[0.05] p-4"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-rose-300" /><div><p className="font-semibold">{collection?.title}</p><p className="mt-1 text-[12px] text-[var(--amd-text-2)]">{copy.deleteConfirm}</p></div></div></div> : <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={copy.collectionName} className="amd-input mt-4 h-12 w-full px-4 text-[14px] outline-none" />}
      <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={onClose} className="amd-btn h-12 rounded-2xl border border-[rgba(120,160,210,.18)]">{copy.cancel}</button><button type="button" disabled={mode !== "delete" && !value.trim()} onClick={() => onSubmit(mode === "delete" ? undefined : value.trim())} className={`amd-btn h-12 rounded-2xl font-bold ${mode === "delete" ? "border border-rose-300/20 bg-rose-400/10 text-rose-200" : "amd-btn-primary"}`}>{mode === "delete" ? copy.delete : copy.save}</button></div>
    </section>
  </div>;
}
''')

write_text("components/CollectionSelectorSheet.tsx", r'''
"use client";
import { Check, X } from "lucide-react";
import { getCopy } from "@/locales";
import type { Language, SavedCollection } from "@/types/app";
import type { Place } from "@/types/place";

export function CollectionSelectorSheet({ place, collections, language, onToggle, onClose }: {
  place: Place; collections: SavedCollection[]; language: Language; onToggle: (collectionId: string) => void; onClose: () => void;
}) {
  const copy = getCopy(language);
  return <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/65 backdrop-blur-sm"><button type="button" onClick={onClose} aria-label={copy.close} className="absolute inset-0" /><section role="dialog" aria-modal="true" className="amd-glass-strong relative w-full max-w-[520px] rounded-t-[30px] p-4 pb-[calc(18px+env(safe-area-inset-bottom))]"><div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" /><div className="flex items-center justify-between"><div><h3 className="text-[20px] font-bold">{copy.chooseCollections}</h3><p className="mt-1 truncate text-[11px] text-[var(--amd-text-2)]">{place.name}</p></div><button type="button" onClick={onClose} className="amd-btn grid h-11 w-11 place-items-center rounded-full"><X className="h-4 w-4" /></button></div><div className="mt-4 space-y-2">{collections.map((collection) => { const active = collection.placeIds.includes(place.id); return <button key={collection.id} type="button" role="checkbox" aria-checked={active} onClick={() => onToggle(collection.id)} className="amd-glass flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left"><span className="text-xl">{collection.icon}</span><span className="flex-1 text-[13px] font-semibold">{collection.title}</span><span className={`grid h-7 w-7 place-items-center rounded-lg border ${active ? "border-[#00D9FF] bg-[#007AFF] text-white" : "border-[rgba(120,160,210,.2)] text-transparent"}`}><Check className="h-4 w-4" /></span></button>; })}</div><button type="button" onClick={onClose} className="amd-btn amd-btn-primary mt-5 h-12 w-full rounded-2xl font-bold">{copy.done}</button></section></div>;
}
''')

write_text("components/CategoryPreferenceSheet.tsx", r'''
"use client";
import { Check, X } from "lucide-react";
import { CATEGORIES } from "@/data/categories";
import { getCopy } from "@/locales";
import type { Language } from "@/types/app";
import type { CategoryId } from "@/types/place";

export function CategoryPreferenceSheet({ value, language, onChange, onClose }: { value: CategoryId[]; language: Language; onChange: (next: CategoryId[]) => void; onClose: () => void }) {
  const copy = getCopy(language);
  const selected = new Set(value);
  return <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/65 backdrop-blur-sm"><button type="button" onClick={onClose} aria-label={copy.close} className="absolute inset-0" /><section role="dialog" aria-modal="true" className="amd-glass-strong relative max-h-[82dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[30px] p-4 pb-[calc(18px+env(safe-area-inset-bottom))]"><div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" /><div className="flex items-center justify-between"><div><h3 className="text-[20px] font-bold">{copy.categoryPreferences}</h3><p className="mt-1 text-[11px] text-[var(--amd-text-2)]">{copy.interestedCategoriesSub}</p></div><button type="button" onClick={onClose} className="amd-btn grid h-11 w-11 place-items-center rounded-full"><X className="h-4 w-4" /></button></div><div className="mt-4 grid grid-cols-2 gap-2">{CATEGORIES.filter((item) => item.id !== "all").map((item) => { const id = item.id as CategoryId; const active = selected.has(id); return <button key={id} type="button" aria-pressed={active} onClick={() => onChange(active ? value.filter((x) => x !== id) : [...value, id])} className={`amd-chip flex min-h-12 items-center gap-2 px-3 text-left text-[11px] font-semibold ${active ? "amd-chip-active" : ""}`}><span>{item.icon}</span><span className="min-w-0 flex-1 truncate">{item.name}</span>{active && <Check className="h-4 w-4" />}</button>; })}</div><button type="button" onClick={onClose} className="amd-btn amd-btn-primary mt-5 h-12 w-full rounded-2xl font-bold">{copy.done}</button></section></div>;
}
''')

write_text("components/InfoSheet.tsx", r'''
"use client";
import { HelpCircle, Info, X } from "lucide-react";
import { getCopy } from "@/locales";
import type { Language } from "@/types/app";
export function InfoSheet({ kind, language, onClose }: { kind: "help" | "about"; language: Language; onClose: () => void }) {
  const copy = getCopy(language);
  return <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/65 backdrop-blur-sm"><button type="button" onClick={onClose} aria-label={copy.close} className="absolute inset-0" /><section role="dialog" aria-modal="true" className="amd-glass-strong relative w-full max-w-[520px] rounded-t-[30px] p-4 pb-[calc(18px+env(safe-area-inset-bottom))]"><div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" /><div className="flex items-center justify-between"><div className="flex items-center gap-2">{kind === "help" ? <HelpCircle className="h-5 w-5 text-[#00D9FF]" /> : <Info className="h-5 w-5 text-[#00D9FF]" />}<h3 className="text-[20px] font-bold">{kind === "help" ? copy.helpTitle : copy.aboutTitle}</h3></div><button type="button" onClick={onClose} className="amd-btn grid h-11 w-11 place-items-center rounded-full"><X className="h-4 w-4" /></button></div>{kind === "help" ? <div className="mt-4 space-y-3"><div className="amd-glass rounded-2xl p-4"><p className="text-[13px] font-semibold">{copy.faq1}</p><p className="mt-2 text-[11px] leading-5 text-[var(--amd-text-2)]">{copy.faq1Body}</p></div><div className="amd-glass rounded-2xl p-4"><p className="text-[13px] font-semibold">{copy.faq2}</p><p className="mt-2 text-[11px] leading-5 text-[var(--amd-text-2)]">{copy.faq2Body}</p></div></div> : <div className="amd-glass mt-4 rounded-2xl p-4"><p className="text-[12px] leading-6 text-[var(--amd-text-2)]">{copy.aboutBody}</p><p className="mt-3 text-[10px] text-[var(--amd-text-3)]">Around My Dorm • v2.2.0</p></div>}<button type="button" onClick={onClose} className="amd-btn amd-btn-primary mt-5 h-12 w-full rounded-2xl font-bold">{copy.done}</button></section></div>;
}
''')

write_text("components/HomeLocationSheet.tsx", r'''
"use client";
import { useState } from "react";
import { Crosshair, Home, MapPin, X } from "lucide-react";
import { getCopy } from "@/locales";
import type { CustomHomeLocation, Language } from "@/types/app";
export function HomeLocationSheet({ language, custom, onDorm, onCurrent, onCustom, onClose }: { language: Language; custom: CustomHomeLocation | null; onDorm: () => void; onCurrent: () => void; onCustom: (value: CustomHomeLocation) => void; onClose: () => void }) {
  const copy = getCopy(language);
  const [name, setName] = useState(custom?.name || "");
  const [lat, setLat] = useState(custom?.latitude?.toString() || "");
  const [lng, setLng] = useState(custom?.longitude?.toString() || "");
  const valid = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180 && name.trim().length > 0;
  return <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/65 backdrop-blur-sm"><button type="button" onClick={onClose} aria-label={copy.close} className="absolute inset-0" /><section role="dialog" aria-modal="true" className="amd-glass-strong relative w-full max-w-[520px] rounded-t-[30px] p-4 pb-[calc(18px+env(safe-area-inset-bottom))]"><div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" /><div className="flex items-center justify-between"><h3 className="text-[20px] font-bold">{copy.homeLocation}</h3><button type="button" onClick={onClose} className="amd-btn grid h-11 w-11 place-items-center rounded-full"><X className="h-4 w-4" /></button></div><div className="mt-4 grid gap-2"><button type="button" onClick={onDorm} className="amd-glass flex min-h-12 items-center gap-3 rounded-2xl px-4 text-left"><Home className="h-5 w-5 text-[#00D9FF]" /><span className="font-semibold">{copy.dorm}</span></button><button type="button" onClick={onCurrent} className="amd-glass flex min-h-12 items-center gap-3 rounded-2xl px-4 text-left"><Crosshair className="h-5 w-5 text-[#00D9FF]" /><span className="font-semibold">{copy.useCurrentLocation}</span></button></div><div className="mt-4 rounded-2xl border border-[rgba(120,160,210,.14)] p-3"><div className="mb-3 flex items-center gap-2"><MapPin className="h-4 w-4 text-[#9B6CFF]" /><p className="text-[13px] font-semibold">{copy.customLocation}</p></div><input value={name} onChange={(e) => setName(e.target.value)} placeholder={copy.locationName} className="amd-input h-11 w-full px-3 text-[12px] outline-none" /><div className="mt-2 grid grid-cols-2 gap-2"><input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder={copy.latitude} className="amd-input h-11 w-full px-3 text-[12px] outline-none" /><input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder={copy.longitude} className="amd-input h-11 w-full px-3 text-[12px] outline-none" /></div><button type="button" disabled={!valid} onClick={() => valid && onCustom({ name: name.trim(), latitude: Number(lat), longitude: Number(lng) })} className="amd-btn amd-btn-primary mt-3 h-11 w-full rounded-xl disabled:opacity-40">{copy.save}</button></div></section></div>;
}
''')

write_text("components/FoodNowSheet.tsx", r'''
"use client";
import { useState } from "react";
import { Utensils, X } from "lucide-react";
import { getCopy } from "@/locales";
import type { Language } from "@/types/app";
export type FoodNowOptions = { budget: number | null; radius: number; localOnly: boolean; openNow: boolean; lateOnly: boolean };
export function FoodNowSheet({ language, defaultRadius, onClose, onSubmit }: { language: Language; defaultRadius: number; onClose: () => void; onSubmit: (value: FoodNowOptions) => void }) {
  const copy = getCopy(language); const [budget, setBudget] = useState<number | null>(200); const [radius, setRadius] = useState(Math.min(defaultRadius, 2000)); const [localOnly, setLocalOnly] = useState(false); const [openNow, setOpenNow] = useState(true); const [lateOnly, setLateOnly] = useState(false);
  return <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/65 backdrop-blur-sm"><button type="button" onClick={onClose} aria-label={copy.close} className="absolute inset-0" /><section role="dialog" aria-modal="true" className="amd-glass-strong relative w-full max-w-[520px] rounded-t-[30px] p-4 pb-[calc(18px+env(safe-area-inset-bottom))]"><div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" /><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Utensils className="h-5 w-5 text-[#00D9FF]" /><h3 className="text-[20px] font-bold">{copy.foodNow}</h3></div><button type="button" onClick={onClose} className="amd-btn grid h-11 w-11 place-items-center rounded-full"><X className="h-4 w-4" /></button></div><p className="mt-4 text-[11px] font-semibold text-[var(--amd-text-2)]">{copy.budget}</p><div className="mt-2 grid grid-cols-4 gap-2">{[100,200,300,null].map((value) => <button key={String(value)} type="button" onClick={() => setBudget(value)} className={`amd-chip min-h-11 px-2 text-[10px] ${budget === value ? "amd-chip-active" : ""}`}>{value == null ? copy.unlimited : `≤ ${value}`}</button>)}</div><p className="mt-4 text-[11px] font-semibold text-[var(--amd-text-2)]">{copy.distance}</p><div className="mt-2 grid grid-cols-3 gap-2">{[[500,"500 ม."],[1000,"1 กม."],[2000,"2 กม."]] .map(([value,label]) => <button key={String(value)} type="button" onClick={() => setRadius(Number(value))} className={`amd-chip min-h-11 text-[10px] ${radius === value ? "amd-chip-active" : ""}`}>{label}</button>)}</div><div className="mt-4 grid grid-cols-3 gap-2"><button type="button" aria-pressed={localOnly} onClick={() => setLocalOnly(!localOnly)} className={`amd-chip min-h-11 px-2 text-[9px] ${localOnly ? "amd-chip-active" : ""}`}>{copy.localOnly}</button><button type="button" aria-pressed={openNow} onClick={() => setOpenNow(!openNow)} className={`amd-chip min-h-11 px-2 text-[9px] ${openNow ? "amd-chip-active" : ""}`}>{copy.openNow}</button><button type="button" aria-pressed={lateOnly} onClick={() => setLateOnly(!lateOnly)} className={`amd-chip min-h-11 px-2 text-[9px] ${lateOnly ? "amd-chip-active" : ""}`}>{copy.late}</button></div><button type="button" onClick={() => onSubmit({ budget, radius, localOnly, openNow, lateOnly })} className="amd-btn amd-btn-primary mt-5 h-12 w-full rounded-2xl font-bold">{copy.chooseFood}</button></section></div>;
}
''')

write_text("components/MapBottomSheet.tsx", r'''
"use client";
import { useRef, useState } from "react";
import { ChevronUp, Navigation, ShieldCheck, Star } from "lucide-react";
import { CATEGORY_MAP } from "@/data/categories";
import { getCopy } from "@/locales";
import { formatDistance, formatPrice, getPlaceOpenStatus, googleMapsDirectionsUrl } from "@/lib/place-utils";
import type { Language } from "@/types/app";
import type { Place } from "@/types/place";
type SheetSize = "collapsed" | "half" | "expanded";
export function MapBottomSheet({ place, language, onDetails }: { place: Place; language: Language; onDetails: () => void }) {
  const copy = getCopy(language); const [size, setSize] = useState<SheetSize>("half"); const startY = useRef<number | null>(null); const status = getPlaceOpenStatus(place); const category = CATEGORY_MAP[place.category];
  function endDrag(y: number) { if (startY.current == null) return; const delta = y - startY.current; startY.current = null; if (delta > 55) setSize(size === "expanded" ? "half" : "collapsed"); if (delta < -55) setSize(size === "collapsed" ? "half" : "expanded"); }
  const heightClass = size === "collapsed" ? "max-h-[126px]" : size === "half" ? "max-h-[290px]" : "max-h-[68dvh] overflow-y-auto";
  return <section className={`amd-glass-strong absolute bottom-3 left-3 right-3 z-30 rounded-[24px] p-3.5 transition-[max-height] duration-200 ${heightClass}`}><button type="button" aria-label="Resize place sheet" onPointerDown={(e) => { startY.current = e.clientY; e.currentTarget.setPointerCapture?.(e.pointerId); }} onPointerUp={(e) => endDrag(e.clientY)} className="mx-auto mb-2 block h-6 w-20 touch-none"><span className="mx-auto block h-1.5 w-12 rounded-full bg-white/18" /></button><div className="flex gap-3">{place.coverImage || place.image ? <img src={place.coverImage || place.image || ""} alt="" loading="lazy" decoding="async" className="h-[104px] w-[104px] shrink-0 rounded-[16px] object-cover" /> : <div className="grid h-[104px] w-[104px] shrink-0 place-items-center rounded-[16px] bg-white/[0.04] text-4xl">{category?.icon || "📍"}</div>}<div className="min-w-0 flex-1"><div className="flex items-start gap-2"><h3 className="min-w-0 flex-1 truncate text-[17px] font-bold">{place.name}</h3>{place.verified && <span className="flex items-center gap-1 rounded-md border border-[rgba(0,229,195,.25)] px-2 py-1 text-[8px] font-bold text-[#00E5C3]"><ShieldCheck className="h-3 w-3" /> VERIFIED</span>}</div><p className="mt-1 text-[10px] text-[var(--amd-text-2)]">{category?.name} • {place.area}</p><p className="mt-2 text-[11px]"><span className={status.isOpen ? "text-[#00E5C3]" : "text-[var(--amd-text-3)]"}>{status.label}</span>{status.secondaryText ? ` • ${status.secondaryText}` : ""}</p><p className="mt-1 text-[10px] text-[var(--amd-text-2)]">{formatPrice(place)} • {formatDistance(place.distanceKm)}{place.rating != null ? ` • ★ ${place.rating.toFixed(1)}${place.reviewCount != null ? ` (${place.reviewCount})` : ""}` : ""}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={onDetails} className="amd-btn h-11 rounded-xl border border-[rgba(120,160,210,.22)] text-[10px] font-semibold">{copy.details}</button><a href={googleMapsDirectionsUrl(place)} target="_blank" rel="noreferrer" className="amd-btn amd-btn-primary flex h-11 items-center justify-center gap-1.5 rounded-xl text-[10px] font-bold"><Navigation className="h-4 w-4" />{copy.navigate}</a></div></div></div>{size === "expanded" && <div className="mt-3 border-t border-[rgba(120,160,210,.12)] pt-3 text-[11px] leading-5 text-[var(--amd-text-2)]"><p>{place.shortDescription}</p><div className="mt-2 flex flex-wrap gap-1.5">{place.tags.slice(0,6).map((tag) => <span key={tag} className="rounded-lg bg-white/[0.05] px-2 py-1 text-[9px]">{tag}</span>)}</div></div>}{size === "collapsed" && <ChevronUp className="pointer-events-none absolute right-4 top-3 h-4 w-4 text-[var(--amd-text-3)]" />}</section>;
}
''')

write_text("components/PwaRuntime.tsx", r'''
"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { loadSettings } from "@/lib/storage/settings";
import { getCopy } from "@/locales";
export function PwaRuntime() {
  const [online, setOnline] = useState(true);
  const [language, setLanguage] = useState<"th" | "en">("th");
  useEffect(() => {
    setOnline(navigator.onLine); setLanguage(loadSettings().language);
    const onOnline = () => setOnline(true); const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline); window.addEventListener("offline", onOffline);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const storage = (event: StorageEvent) => { if (event.key === "around-dorm-settings-v3") setLanguage(loadSettings().language); };
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); window.removeEventListener("storage", storage); };
  }, []);
  if (online) return null; const copy = getCopy(language);
  return <div role="status" className="fixed left-1/2 top-[max(8px,env(safe-area-inset-top))] z-[200] flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-300/20 bg-[#0a1424]/95 px-4 py-2 text-[10px] font-semibold text-amber-100 shadow-xl backdrop-blur-xl"><WifiOff className="h-4 w-4" /><span>{copy.offline} • {copy.offlineBody}</span></div>;
}
''')

write_text("components/PlaceRouteClient.tsx", r'''
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlaceDetail } from "@/components/PlaceDetail";
import { loadFavorites, saveFavorites } from "@/lib/storage/favorites";
import { loadSettings } from "@/lib/storage/settings";
import { addRecentView, loadRecentViews, saveRecentViews } from "@/lib/storage/recent";
import { PLACES } from "@/data/places";
import type { Place } from "@/types/place";
export function PlaceRouteClient({ place }: { place: Place }) {
  const router = useRouter(); const [saved, setSaved] = useState(false); const [language, setLanguage] = useState<"th"|"en">("th");
  useEffect(() => { const favorites = loadFavorites(); setSaved(favorites.some((item) => item.id === place.id)); setLanguage(loadSettings().language); const views = addRecentView(loadRecentViews(PLACES), place, true); saveRecentViews(views); }, [place]);
  function toggle() { const current = loadFavorites(); const exists = current.some((item) => item.id === place.id); const next = exists ? current.filter((item) => item.id !== place.id) : [place, ...current].slice(0,100); saveFavorites(next); setSaved(!exists); }
  return <main className="amd-app"><div className="amd-shell"><div className="amd-content"><PlaceDetail place={place} saved={saved} language={language} onClose={() => router.back()} onSave={toggle} onMap={() => router.push(`/map/?place=${encodeURIComponent(place.slug)}`)} /></div></div></main>;
}
''')

# ---------------------------------------------------------------------------
# Real routes
# ---------------------------------------------------------------------------
write_text("app/saved/page.tsx", r'''
import { AroundMyDormApp } from "@/components/AroundMyDormApp";
export default function SavedPage() { return <AroundMyDormApp initialTab="favorites" />; }
''')
write_text("app/recent/page.tsx", r'''
import { AroundMyDormApp } from "@/components/AroundMyDormApp";
export default function RecentPage() { return <AroundMyDormApp initialTab="recent" />; }
''')
write_text("app/settings/page.tsx", r'''
import { AroundMyDormApp } from "@/components/AroundMyDormApp";
export default function SettingsPage() { return <AroundMyDormApp initialTab="settings" />; }
''')
write_text("app/favorites/page.tsx", r'''
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function FavoritesRedirectPage() { const router = useRouter(); useEffect(() => { router.replace("/saved/"); }, [router]); return <main className="amd-app grid min-h-[100dvh] place-items-center text-[12px] text-[var(--amd-text-2)]">Redirecting to Saved…</main>; }
''')
write_text("app/place/[slug]/page.tsx", r'''
import { notFound } from "next/navigation";
import { PLACES } from "@/data/places";
import { PlaceRouteClient } from "@/components/PlaceRouteClient";
export const dynamic = "force-static";
export function generateStaticParams() { return PLACES.map((place) => ({ slug: place.slug })); }
export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const place = PLACES.find((item) => item.slug === slug); if (!place) notFound(); return <PlaceRouteClient place={place} />; }
''')

# ---------------------------------------------------------------------------
# PWA / offline assets
# ---------------------------------------------------------------------------
write_text("public/sw.js", r'''
const VERSION = "amd-v2.2.0";
const APP_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const APP_SHELL = ["/", "/saved/", "/recent/", "/settings/", "/parking/", "/manifest.webmanifest", "/offline.html"];
self.addEventListener("install", (event) => { event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => ![APP_CACHE,RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (event) => {
  const request = event.request; if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.hostname.includes("googleapis.com") || url.hostname.includes("gstatic.com") || url.hostname.includes("google.com/maps")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => { const clone=response.clone(); caches.open(RUNTIME_CACHE).then((cache)=>cache.put(request,clone)); return response; }).catch(async () => (await caches.match(request)) || (await caches.match("/offline.html"))));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => { if (response.ok) { const clone=response.clone(); caches.open(RUNTIME_CACHE).then((cache)=>cache.put(request,clone)); } return response; })));
  }
});
''')
write_text("public/offline.html", r'''
<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#02060D"><title>Around My Dorm — Offline</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#02060D;color:#F7F9FC;font-family:system-ui,-apple-system,sans-serif}.c{max-width:340px;padding:28px;text-align:center;border:1px solid rgba(120,160,210,.18);border-radius:24px;background:rgba(8,18,33,.82)}p{color:#A8B2C4;line-height:1.6}</style><body><div class="c"><h1>ออฟไลน์</h1><p>กำลังแสดงข้อมูลที่บันทึกไว้ เมื่อเชื่อมต่ออินเทอร์เน็ตอีกครั้ง ฟังก์ชันสดจะกลับมาทำงาน</p><a href="/saved/" style="color:#19E6FF">เปิดรายการที่บันทึก</a></div></body></html>
''')

public = ROOT / "public"
public.mkdir(exist_ok=True)
(public / "icon-192.png").write_bytes(png_bytes(192))
(public / "icon-512.png").write_bytes(png_bytes(512))
(public / "icon-maskable-512.png").write_bytes(png_bytes(512, True))
(public / "apple-touch-icon.png").write_bytes(png_bytes(180))

# ---------------------------------------------------------------------------
# Data validation + tests
# ---------------------------------------------------------------------------
write_text("scripts/validate-data.ts", r'''
import { PLACES } from "../data/places-product";
import { CATEGORIES } from "../data/categories-expanded";
const errors: string[] = [];
const ids = new Set<string>(); const slugs = new Set<string>(); const categoryIds = new Set(CATEGORIES.map((item) => item.id));
const timeRegex = /(?:^|[^\d])(\d{1,2}):(\d{2})(?:[^\d]|$)/g;
for (const place of PLACES) {
  if (!place.id || ids.has(place.id)) errors.push(`duplicate/empty id: ${place.id}`); ids.add(place.id);
  if (!place.slug || slugs.has(place.slug)) errors.push(`duplicate/empty slug: ${place.slug}`); slugs.add(place.slug);
  if (!categoryIds.has(place.category)) errors.push(`${place.id}: invalid category ${place.category}`);
  for (const category of place.categories) if (!categoryIds.has(category)) errors.push(`${place.id}: invalid categories[] ${category}`);
  if (place.latitude != null && (place.latitude < -90 || place.latitude > 90)) errors.push(`${place.id}: latitude out of range`);
  if (place.longitude != null && (place.longitude < -180 || place.longitude > 180)) errors.push(`${place.id}: longitude out of range`);
  if (place.rating != null && (place.rating < 0 || place.rating > 5)) errors.push(`${place.id}: rating out of range`);
  if (place.reviewCount != null && place.reviewCount < 0) errors.push(`${place.id}: negative review count`);
  for (const value of [place.minPrice, place.maxPrice, place.averagePricePerPerson, place.pricing?.min, place.pricing?.max, place.pricing?.fixed, place.parkingDetails?.hourlyPrice, place.parkingDetails?.dailyPrice, place.parkingDetails?.monthlyPrice]) if (value != null && value < 0) errors.push(`${place.id}: negative price`);
  if (place.minPrice != null && place.maxPrice != null && place.minPrice > place.maxPrice) errors.push(`${place.id}: minPrice > maxPrice`);
  for (const raw of Object.values(place.openingHours || {})) if (raw) { for (const match of raw.matchAll(timeRegex)) { const h=Number(match[1]), m=Number(match[2]); if (h > 24 || m > 59) errors.push(`${place.id}: invalid opening time ${match[1]}:${match[2]}`); } }
  for (const stamp of [place.lastVerified, place.openingHoursVerifiedAt, place.priceVerifiedAt, place.locationVerifiedAt, place.phoneVerifiedAt, place.imageVerifiedAt, place.deliveryVerifiedAt, place.parkingVerifiedAt]) if (stamp && Number.isNaN(Date.parse(stamp))) errors.push(`${place.id}: invalid timestamp ${stamp}`);
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Validated ${PLACES.length} places: IDs, slugs, categories, coordinates, ratings, prices, hours and verification timestamps OK.`);
''')

write_text("vitest.config.ts", r'''
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "jsdom", setupFiles: ["./tests/setup.ts"] }, resolve: { alias: { "@": new URL("./", import.meta.url).pathname } } });
''')
write_text("tests/setup.ts", r'''
import "@testing-library/jest-dom/vitest";
''')
write_text("tests/recent.test.ts", r'''
import { describe, expect, it } from "vitest";
import { bangkokDateKey, getTodayRecentStats } from "@/lib/storage/recent";
import type { Place } from "@/types/place";
const place = { id: "p1", category: "cafe", area: "ลาดพร้าว" } as Place;
describe("recent history Thailand day grouping", () => {
  it("uses Asia/Bangkok local day", () => { expect(bangkokDateKey(new Date("2026-09-07T17:30:00Z"))).toBe("2026-09-08"); });
  it("counts only today's unique places/categories/areas", () => {
    const now = new Date("2026-09-08T05:00:00Z");
    const stats = getTodayRecentStats([{ placeId: "p1", viewedAt: "2026-09-08T04:00:00Z" }, { placeId: "p1", viewedAt: "2026-09-08T03:00:00Z" }, { placeId: "p1", viewedAt: "2026-09-06T03:00:00Z" }], [place], now);
    expect(stats.viewCount).toBe(2); expect(stats.placeCount).toBe(1); expect(stats.categoryCount).toBe(1); expect(stats.areaCount).toBe(1);
  });
});
''')
write_text("tests/place-utils.test.ts", r'''
import { describe, expect, it } from "vitest";
import { haversineKm } from "@/lib/place-utils";
describe("haversineKm", () => { it("returns zero for identical points", () => expect(haversineKm({lat:13.8,lng:100.5},{lat:13.8,lng:100.5})).toBe(0)); it("returns a positive distance", () => expect(haversineKm({lat:13.8,lng:100.5},{lat:13.81,lng:100.51})).toBeGreaterThan(1)); });
''')

write_text("playwright.config.ts", r'''
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({ testDir: "./e2e", timeout: 30_000, use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" }, webServer: { command: "npm run dev", url: "http://127.0.0.1:3000", reuseExistingServer: true }, projects: [{ name: "chromium-mobile", use: { ...devices["iPhone 13"] } }] });
''')
write_text("e2e/routing.spec.ts", r'''
import { expect, test } from "@playwright/test";
test("recent is a real refresh-safe route and filters stay in place", async ({ page }) => { await page.goto("/recent/"); await expect(page.getByRole("heading", { name: "ดูล่าสุด" })).toBeVisible(); await page.reload(); await expect(page).toHaveURL(/\/recent\/$/); const filter = page.getByRole("button", { name: /เปิดอยู่ตอนนี้/ }).first(); if (await filter.isVisible()) await filter.click(); await expect(page).toHaveURL(/\/recent\/$/); });
test("settings route persists through refresh", async ({ page }) => { await page.goto("/settings/"); await expect(page.getByRole("heading", { name: "ตั้งค่า" })).toBeVisible(); await page.reload(); await expect(page).toHaveURL(/\/settings\/$/); });
test("legacy favorites redirects to saved", async ({ page }) => { await page.goto("/favorites/"); await page.waitForURL(/\/saved\/$/); });
test("deep-linked place route renders and survives refresh", async ({ page }) => { await page.goto("/place/rung-mah-pah/"); await expect(page.getByText("Rung-Mah-Pah").first()).toBeVisible(); await page.reload(); await expect(page).toHaveURL(/\/place\/rung-mah-pah\/$/); });
test("saved route is real", async ({ page }) => { await page.goto("/saved/"); await expect(page.getByRole("heading", { name: "บันทึก" })).toBeVisible(); await page.reload(); await expect(page).toHaveURL(/\/saved\/$/); });
test("map route is real", async ({ page }) => { await page.goto("/map/"); await expect(page.getByRole("heading", { name: "แผนที่" })).toBeVisible(); await page.reload(); await expect(page).toHaveURL(/\/map\/$/); });
''')

write_text("eslint.config.mjs", r'''
import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: [".next/**", "out/**", "node_modules/**", "public/sw.js"] },
  ...tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-explicit-any": "off", "@typescript-eslint/no-unused-vars": "off", "@typescript-eslint/no-empty-object-type": "off" } },
);
''')

# ---------------------------------------------------------------------------
# Patch package.json / env / manifest / layout / CI
# ---------------------------------------------------------------------------
pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
pkg.setdefault("dependencies", {})["@googlemaps/markerclusterer"] = "^2.6.2"
pkg.setdefault("devDependencies", {}).update({
    "@playwright/test": "^1.55.0",
    "@testing-library/jest-dom": "^6.8.0",
    "@testing-library/react": "^16.3.0",
    "eslint": "^9.35.0",
    "jsdom": "^26.1.0",
    "tsx": "^4.20.5",
    "typescript-eslint": "^8.43.0",
    "vitest": "^3.2.4",
})
pkg["scripts"].update({
    "lint": "eslint .",
    "validate:data": "tsx scripts/validate-data.ts",
    "test": "vitest run",
    "test:e2e": "playwright test",
})
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

write_text(".env.example", r'''
# Google Cloud Console:
# 1) Enable Maps JavaScript API
# 2) Enable Places API (New)
# 3) Create a Google Maps Map ID with the premium dark cloud style
# 4) Enable billing and restrict the API key to production domains
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
NEXT_PUBLIC_GOOGLE_MAP_ID=YOUR_GOOGLE_MAP_ID
''')

write_text("app/manifest.ts", r'''
import type { MetadataRoute } from "next";
export const dynamic = "force-static";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Around My Dorm", short_name: "Around Dorm", description: "ค้นหาร้านและบริการรอบบ้านสุภาอพาร์ทเม้นต์",
    start_url: "/", display: "standalone", background_color: "#02060D", theme_color: "#02060D", orientation: "portrait-primary", lang: "th",
    categories: ["navigation", "food", "lifestyle", "travel"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
''')

layout_path = ROOT / "app/layout.tsx"
layout = layout_path.read_text(encoding="utf-8")
if 'import { PwaRuntime }' not in layout:
    layout = layout.replace('import "./globals.css";', 'import "./globals.css";\nimport { PwaRuntime } from "@/components/PwaRuntime";')
layout = layout.replace('  maximumScale: 1,\n  userScalable: false,\n', '')
layout = layout.replace('      <body>{children}</body>', '      <body>{children}<PwaRuntime /></body>')
layout_path.write_text(layout, encoding="utf-8")

build_path = ROOT / ".github/workflows/build.yml"
build_path.write_text('''name: Build Check

on:
  push:
  pull_request:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Lint
        run: npm run lint
      - name: Type check
        run: npm run typecheck
      - name: Validate production data
        run: npm run validate:data
      - name: Unit tests
        run: npm run test
      - name: Build production
        run: npm run build
      - name: Validate Cloudflare Workers bundle
        run: npx wrangler deploy --dry-run
''', encoding="utf-8")

# ---------------------------------------------------------------------------
# Patch PlaceCard image/accessibility/localization performance
# ---------------------------------------------------------------------------
card_path = ROOT / "components/PlaceCard.tsx"
card = card_path.read_text(encoding="utf-8")
if 'getCopy' not in card:
    card = card.replace('import { CATEGORY_MAP } from "@/data/categories";', 'import { CATEGORY_MAP } from "@/data/categories";\nimport { getCopy } from "@/locales";')
card = card.replace('  const navigateLabel = language === "en" ? "Navigate" : "นำทาง";\n  const detailLabel = language === "en" ? "Details" : "รายละเอียด";', '  const copy = getCopy(language);\n  const navigateLabel = copy.navigate;\n  const detailLabel = copy.details;')
card = card.replace('loading="lazy"\n              className=', 'loading="lazy"\n              decoding="async"\n              className=')
card = card.replace('>ยังไม่มีรูปยืนยัน</p>', '>{copy.unknownData}</p>')
card = card.replace('aria-label={saved ? "นำออกจากรายการโปรด" : "บันทึกร้าน"}', 'aria-label={saved ? (language === "en" ? "Remove from saved" : "นำออกจากรายการโปรด") : (language === "en" ? "Save place" : "บันทึกร้าน")}')
card = card.replace('{category?.name || "สถานที่"}', '{category?.name || (language === "en" ? "Place" : "สถานที่")}')
card = card.replace('{place.walkingMinutes != null && <span>เดิน {place.walkingMinutes} นาที</span>}', '{place.walkingMinutes != null && <span>{language === "en" ? "Walk" : "เดิน"} {place.walkingMinutes} {language === "en" ? "min" : "นาที"}</span>}')
card = card.replace('{place.distance?.motorcycleMinutes != null && <span>มอเตอร์ไซค์ {place.distance.motorcycleMinutes} นาที</span>}', '{place.distance?.motorcycleMinutes != null && <span>{language === "en" ? "Motorcycle" : "มอเตอร์ไซค์"} {place.distance.motorcycleMinutes} {language === "en" ? "min" : "นาที"}</span>}')
card = card.replace('{place.drivingMinutes != null && <span>รถยนต์ {place.drivingMinutes} นาที</span>}', '{place.drivingMinutes != null && <span>{language === "en" ? "Drive" : "รถยนต์"} {place.drivingMinutes} {language === "en" ? "min" : "นาที"}</span>}')
card = card.replace('aria-label="ดูบนแผนที่"', 'aria-label={language === "en" ? "View on map" : "ดูบนแผนที่"}')
card_path.write_text(card, encoding="utf-8")

# ---------------------------------------------------------------------------
# Patch PlaceDetail for route use + localization/image performance
# ---------------------------------------------------------------------------
detail_path = ROOT / "components/PlaceDetail.tsx"
detail = detail_path.read_text(encoding="utf-8")
if 'getCopy' not in detail:
    detail = detail.replace('import { CATEGORY_MAP } from "@/data/categories";', 'import { CATEGORY_MAP } from "@/data/categories";\nimport { getCopy } from "@/locales";')
detail = detail.replace('  onMap,\n}: {', '  onMap,\n  language = "th",\n}: {')
detail = detail.replace('  onMap: () => void;\n}) {', '  onMap: () => void;\n  language?: "th" | "en";\n}) {')
detail = detail.replace('  const [reportOpen, setReportOpen] = useState(false);', '  const [reportOpen, setReportOpen] = useState(false);\n  const copy = getCopy(language);')
detail = detail.replace('loading="lazy" className="h-full w-full object-cover"', 'loading="lazy" decoding="async" className="h-full w-full object-cover"')
detail = detail.replace('loading="lazy" className="aspect-[4/3]', 'loading="lazy" decoding="async" className="aspect-[4/3]')
repls = {
    'aria-label="ปิดรายละเอียด"': 'aria-label={copy.close}',
    '>ยังไม่มีรูปจริงที่ยืนยัน</p>': '>{copy.unknownData}</p>',
    '{category?.name || "สถานที่"}': '{category?.name || (language === "en" ? "Place" : "สถานที่")}',
    '<MapPin className="h-4 w-4" />แผนที่': '<MapPin className="h-4 w-4" />{copy.mapAction}',
    '<Navigation className="h-4 w-4" />นำทาง': '<Navigation className="h-4 w-4" />{copy.navigate}',
    '<Phone className="h-4 w-4" />โทร': '<Phone className="h-4 w-4" />{copy.phone}',
    '<Phone className="h-4 w-4" />ไม่มีเบอร์': '<Phone className="h-4 w-4" />{copy.noPhone}',
    '<Share2 className="h-4 w-4" />แชร์': '<Share2 className="h-4 w-4" />{copy.share}',
    '>เกี่ยวกับร้าน</p>': '>{copy.aboutPlace}</p>',
    'label="พื้นที่"': 'label={copy.area}', 'label="ที่อยู่"': 'label={copy.address}', 'label="ระยะทาง"': 'label={copy.distance}',
    'label="เวลาเดิน"': 'label={copy.walkTime}', 'label="มอเตอร์ไซค์"': 'label={copy.motorcycle}', 'label="รถยนต์"': 'label={copy.driveTime}',
    'label="ราคา"': 'label={copy.price}', 'label="เบอร์โทร"': 'label={copy.phoneNumber}', 'label="ที่จอดรถ"': 'label={copy.parkingInfo}',
    '>เมนูเด่น</p>': '>{copy.popularMenu}</p>', '>สั่ง Delivery</p>': '>{copy.delivery}</p>', '>สิ่งอำนวยความสะดวก</p>': '>{copy.amenities}</p>', '>รูปภาพ</p>': '>{copy.photos}</p>',
    '>เวลาเปิด</p>': '>{copy.openingHours}</p>', 'label="ทุกวัน" value="เปิด 24 ชั่วโมง"': 'label={copy.everyDay} value={copy.open24}',
    'label="เวลาที่มีข้อมูล"': 'label={copy.openingData}',
    '{place.verified ? "ข้อมูลผ่านการตรวจสอบ" : "ข้อมูลบางส่วนยังไม่ได้ยืนยัน"}': '{place.verified ? copy.dataVerified : copy.dataPartial}',
    '>ข้อมูลร้านไม่ถูกต้อง?</button>': '>{copy.reportWrong}</button>',
    'เปิด Google Maps <ArrowUpRight': '{copy.openGoogleMaps} <ArrowUpRight',
}
for old, new in repls.items():
    detail = detail.replace(old, new)
detail = detail.replace('place.address || "ยังไม่มีข้อมูลยืนยัน"', 'place.address || copy.unknownData')
detail = detail.replace('place.phone || "ยังไม่มีข้อมูลยืนยัน"', 'place.phone || copy.unknownData')
detail = detail.replace('"ยังไม่มีข้อมูล Route"', 'copy.unknownRoute')
detail = detail.replace('"ยังไม่มีข้อมูลยืนยัน"', 'copy.unknownData')
detail = detail.replace('item.price != null ? `${item.price.toLocaleString()} บาท` : "ยังไม่มีราคายืนยัน"', 'item.price != null ? `${item.price.toLocaleString()} ${language === "en" ? "THB" : "บาท"}` : copy.unknownData')
detail = detail.replace('>ขายดี</span>', '>{copy.popular}</span>')
detail = detail.replace('Last verified: {place.lastVerified || "ยังไม่มี"}', '{copy.lastVerified}: {place.lastVerified || copy.unknownVerified}')
detail = detail.replace('Source: {place.source.length ? place.source.join(" • ") : "ยังไม่มี"}', '{copy.source}: {place.source.length ? place.source.join(" • ") : copy.unknownVerified}')
detail = detail.replace('หมายเหตุ: {place.notes}', '{copy.notes}: {place.notes}')
# Day labels in English mode.
for th_day, key in [("จันทร์","monday"),("อังคาร","tuesday"),("พุธ","wednesday"),("พฤหัสบดี","thursday"),("ศุกร์","friday"),("เสาร์","saturday"),("อาทิตย์","sunday")]:
    detail = detail.replace(f'{{ key: "{key}", label: "{th_day}" }}', f'{{ key: "{key}", label: "{th_day}" }}')
detail = detail.replace('DAYS.map(({ key, label }) => <ValueRow key={key} label={label}', 'DAYS.map(({ key, label }) => <ValueRow key={key} label={language === "en" ? copy[key] : label}')
detail_path.write_text(detail, encoding="utf-8")

# ---------------------------------------------------------------------------
# Main app targeted production refactor
# ---------------------------------------------------------------------------
app_path = ROOT / "components/AroundMyDormApp.tsx"
s = app_path.read_text(encoding="utf-8")

# Imports
s = replace_once(s, 'import React, { useEffect, useMemo, useRef, useState } from "react";','import React, { useEffect, useMemo, useRef, useState } from "react";\nimport { useRouter } from "next/navigation";\nimport { MarkerClusterer } from "@googlemaps/markerclusterer";', 'router/cluster imports')
s = s.replace('import { PlaceDetail } from "@/components/PlaceDetail";', 'import { PlaceDetail } from "@/components/PlaceDetail";\nimport { CollectionEditorSheet } from "@/components/CollectionEditorSheet";\nimport { CollectionSelectorSheet } from "@/components/CollectionSelectorSheet";\nimport { CategoryPreferenceSheet } from "@/components/CategoryPreferenceSheet";\nimport { FoodNowSheet, type FoodNowOptions } from "@/components/FoodNowSheet";\nimport { HomeLocationSheet } from "@/components/HomeLocationSheet";\nimport { InfoSheet } from "@/components/InfoSheet";\nimport { MapBottomSheet } from "@/components/MapBottomSheet";')
s = s.replace('import { GOOGLE_PLACE_FIELDS, loadGoogleMaps, mapGooglePlace } from "@/lib/google-maps";', 'import { GOOGLE_PLACE_FIELDS, loadGoogleMaps, mapGooglePlace } from "@/lib/google-maps";\nimport { getCopy } from "@/locales";\nimport { getGooglePlacesCache, makeGooglePlacesCacheKey, setGooglePlacesCache } from "@/lib/google-places-cache";\nimport { LEGACY_DARK_MAP_STYLES } from "@/lib/map-style";\nimport { addRecentView, getTodayRecentStats, loadRecentViews, resolveRecentPlaces, saveRecentViews } from "@/lib/storage/recent";\nimport type { RecentView } from "@/types/app";')

s = s.replace('type OriginMode = "dorm" | "me";', 'type OriginMode = "dorm" | "me" | "custom";')
s = s.replace('  defaultRadius: number;\n};', '  defaultRadius: number;\n  preferredCategories: CategoryId[];\n  homeMode: OriginMode;\n  customHomeLocation: { name: string; latitude: number; longitude: number } | null;\n};')
s = s.replace('  defaultRadius: 500,\n};', '  defaultRadius: 500,\n  preferredCategories: [],\n  homeMode: "dorm",\n  customHomeLocation: null,\n};')

# Remove in-component localization objects and switch to resources.
s = re.sub(r'const TH = \{.*?\} as const;\n\nconst EN = \{.*?\} as const;\n\n', '', s, flags=re.S)

# Personalized recommended sorting.
s = s.replace('function sortPlaces(places: Place[], mode: SortMode) {', 'function sortPlaces(places: Place[], mode: SortMode, preferred = new Set<CategoryId>()) {')
s = s.replace('    return (\n      Number(b.recommended) - Number(a.recommended) ||', '    return (\n      Number(preferred.has(b.category)) - Number(preferred.has(a.category)) ||\n      Number(b.recommended) - Number(a.recommended) ||')

# State/ref block.
s = s.replace('  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";\n  const [tab, setTab] = useState<Tab>(initialTab);', '  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";\n  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "";\n  const router = useRouter();\n  const [tab, setTab] = useState<Tab>(initialTab);')
s = s.replace('  const [recent, setRecent] = useState<Place[]>([]);\n  const [recentMeta, setRecentMeta] = useState<Record<string, string>>({});', '  const [recentViews, setRecentViews] = useState<RecentView[]>([]);\n  const [recentQuickFilter, setRecentQuickFilter] = useState<QuickFilter>(null);')
s = s.replace('  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);', '  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);\n  const [collectionEditor, setCollectionEditor] = useState<{ mode: "create" | "rename" | "delete"; collection?: SavedCollection } | null>(null);\n  const [collectionSelectorPlace, setCollectionSelectorPlace] = useState<Place | null>(null);\n  const [categoryPreferenceOpen, setCategoryPreferenceOpen] = useState(false);\n  const [infoSheet, setInfoSheet] = useState<"help" | "about" | null>(null);\n  const [homeLocationOpen, setHomeLocationOpen] = useState(false);\n  const [foodNowOpen, setFoodNowOpen] = useState(false);\n  const [mapSearchCenter, setMapSearchCenter] = useState(DORM_CENTER);\n  const [pendingMapCenter, setPendingMapCenter] = useState<{ lat: number; lng: number } | null>(null);\n  const [showSearchArea, setShowSearchArea] = useState(false);')
s = s.replace('  const markersRef = useRef<any[]>([]);\n  const copy = settings.language === "en" ? EN : TH;', '  const markersRef = useRef<any[]>([]);\n  const clustererRef = useRef<MarkerClusterer | null>(null);\n  const radiusCircleRef = useRef<any>(null);\n  const mapIdleListenerRef = useRef<any>(null);\n  const requestIdRef = useRef(0);\n  const copy = getCopy(settings.language);')

# Initial storage migration.
s = s.replace('      const viewed = JSON.parse(localStorage.getItem("around-dorm-recent-v2") || "[]") as Place[];\n      const recentTimes = JSON.parse(localStorage.getItem(RECENT_META_KEY) || "{}") as Record<string, string>;', '      const recentHistory = loadRecentViews(PLACES);')
s = s.replace('      setRecent(Array.isArray(viewed) ? viewed.slice(0, 10) : []);\n      setRecentMeta(recentTimes && typeof recentTimes === "object" ? recentTimes : {});', '      setRecentViews(recentHistory);')
s = s.replace('      setSettings(mergedSettings);\n      setRadiusMeters(mergedSettings.defaultRadius);', '      setSettings({ ...mergedSettings, preferredCategories: Array.isArray(mergedSettings.preferredCategories) ? mergedSettings.preferredCategories : [] });\n      setRadiusMeters(mergedSettings.defaultRadius);\n      if (mergedSettings.homeMode === "custom" && mergedSettings.customHomeLocation) {\n        const customCenter = { lat: mergedSettings.customHomeLocation.latitude, lng: mergedSettings.customHomeLocation.longitude };\n        setOrigin(customCenter); setOriginMode("custom"); setMapSearchCenter(customCenter);\n      }')

# Lazy Google maps/places load.
old = '''  useEffect(() => {\n    if (!apiKey) return;\n    loadGoogleMaps(apiKey)\n      .then(() => setApiReady(true))\n      .catch(() => setApiReady(false));\n  }, [apiKey]);'''
new = '''  useEffect(() => {\n    if (!apiKey || !navigator.onLine) return;\n    const shouldLoad = tab === "map" || Boolean(debouncedQuery) || category !== "all" || quickFilter != null;\n    if (!shouldLoad) return;\n    loadGoogleMaps(apiKey).then(() => setApiReady(true)).catch(() => setApiReady(false));\n  }, [apiKey, tab, debouncedQuery, category, quickFilter]);'''
s = replace_once(s, old, new, 'lazy google loader')

# Google Places request cache + stale request protection.
pattern = re.compile(r'  useEffect\(\(\) => \{\n    if \(!apiReady\) return;\n    let cancelled = false;\n\n    async function fetchPlaces\(\) \{.*?\n  \}, \[apiReady, category, debouncedQuery, radiusMeters, origin\.lat, origin\.lng, settings\.language\]\);', re.S)
replacement = '''  useEffect(() => {\n    if (!apiReady || !navigator.onLine) return;\n    let cancelled = false;\n    const requestId = ++requestIdRef.current;\n    const cacheKey = makeGooglePlacesCacheKey({ query: debouncedQuery, category, radius: radiusMeters, lat: mapSearchCenter.lat, lng: mapSearchCenter.lng, language: settings.language });\n    const cached = getGooglePlacesCache(cacheKey);\n    if (cached?.data?.length) setLivePlaces(cached.data);\n    if (cached && !cached.stale) return;\n\n    async function fetchPlaces() {\n      setLoadingPlaces(true);\n      try {\n        const { Place: GooglePlace } = await window.google.maps.importLibrary("places");\n        const active = CATEGORIES.find((item) => item.id === category);\n        let result: any;\n        if (debouncedQuery) {\n          const request: any = { textQuery: debouncedQuery, fields: GOOGLE_PLACE_FIELDS, locationBias: { center: mapSearchCenter, radius: radiusMeters }, language: settings.language, region: "TH", maxResultCount: 20, rankPreference: "RELEVANCE" };\n          if (category !== "all" && active?.googleTypes?.[0]) request.includedType = active.googleTypes[0];\n          result = await GooglePlace.searchByText(request);\n        } else {\n          const request: any = { fields: GOOGLE_PLACE_FIELDS, locationRestriction: { center: mapSearchCenter, radius: radiusMeters }, maxResultCount: 20, rankPreference: "DISTANCE", language: settings.language, region: "TH" };\n          if (category === "all") request.includedTypes = TARGET_GOOGLE_TYPES; else if (active?.googleTypes?.length) request.includedTypes = active.googleTypes;\n          result = await GooglePlace.searchNearby(request);\n        }\n        const mapped = (result.places || []).map(mapGooglePlace);\n        if (!cancelled && requestId === requestIdRef.current) { setLivePlaces(mapped); setGooglePlacesCache(cacheKey, mapped); }\n      } catch {\n        if (!cancelled && requestId === requestIdRef.current && !cached) setLivePlaces([]);\n      } finally {\n        if (!cancelled && requestId === requestIdRef.current) setLoadingPlaces(false);\n      }\n    }\n    void fetchPlaces();\n    return () => { cancelled = true; };\n  }, [apiReady, category, debouncedQuery, radiusMeters, mapSearchCenter.lat, mapSearchCenter.lng, settings.language]);'''
s, count = pattern.subn(replacement, s, count=1)
if count != 1: raise RuntimeError('Google Places effect patch failed')

# Recommendation sort uses preferences.
s = s.replace('    return sortPlaces(data, sortMode);', '    return sortPlaces(data, sortMode, new Set(settings.preferredCategories || []));')
s = s.replace('  }, [allPlaces, category, debouncedQuery, filters, radiusMeters, originMode, sortMode, settings.verifiedOnly]);', '  }, [allPlaces, category, debouncedQuery, filters, radiusMeters, originMode, sortMode, settings.verifiedOnly, settings.preferredCategories]);')

# Recent derivation.
old_recent = '''  const recentPlaces = useMemo(() => {\n    return recent.map((saved) => allPlaces.find((place) => place.id === saved.id || (saved.googlePlaceId && place.googlePlaceId === saved.googlePlaceId)) || saved);\n  }, [recent, allPlaces]);'''
new_recent = '''  const recentPlaces = useMemo(() => resolveRecentPlaces(recentViews, allPlaces), [recentViews, allPlaces]);\n  const recentViewByPlaceId = useMemo(() => { const map = new Map<string, RecentView>(); for (const view of recentViews) if (!map.has(view.placeId)) map.set(view.placeId, view); return map; }, [recentViews]);\n  const recentTodayStats = useMemo(() => getTodayRecentStats(recentViews, allPlaces), [recentViews, allPlaces]);\n  const filteredRecentPlaces = useMemo(() => {\n    if (!recentQuickFilter) return recentPlaces;\n    if (recentQuickFilter === "open") return recentPlaces.filter((place) => getPlaceOpenStatus(place).isOpen === true);\n    if (recentQuickFilter === "near") return recentPlaces.filter((place) => place.distanceKm != null && place.distanceKm <= 1).sort((a,b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));\n    if (recentQuickFilter === "cafe") return recentPlaces.filter((place) => place.categories.includes("cafe"));\n    if (recentQuickFilter === "late") return recentPlaces.filter((place) => place.openLate === true);\n    if (recentQuickFilter === "parking") return recentPlaces.filter((place) => place.categories.includes("parking") || place.categories.includes("monthly_parking"));\n    return recentPlaces;\n  }, [recentPlaces, recentQuickFilter]);'''
s = replace_once(s, old_recent, new_recent, 'recent derivation')

# Recent writes.
pattern = re.compile(r'  function addRecent\(place: Place\) \{.*?\n  \}\n\n  function openDetail', re.S)
replacement = '''  function addRecent(place: Place) {\n    setRecentViews((current) => { const next = addRecentView(current, place, PLACES.some((item) => item.id === place.id)); saveRecentViews(next); return next; });\n  }\n\n  function openDetail'''
s, count = pattern.subn(replacement, s, count=1)
if count != 1: raise RuntimeError('addRecent patch failed')

# Real routing.
s = s.replace('  function openDetail(place: Place) {\n    addRecent(place);\n    setDetailPlace(place);\n  }', '  function openDetail(place: Place) {\n    addRecent(place);\n    if (PLACES.some((item) => item.slug === place.slug)) router.push(`/place/${encodeURIComponent(place.slug)}/`);\n    else setDetailPlace(place);\n  }')
pattern = re.compile(r'  function changeTab\(next: Tab\) \{.*?\n  \}\n\n  function openMap\(place: Place\) \{.*?\n  \}', re.S)
replacement = '''  function changeTab(next: Tab) {\n    setSelectedPlace(null); setTab(next);\n    const routes: Record<Tab, string> = { explore: "/", map: "/map/", favorites: "/saved/", recent: "/recent/", settings: "/settings/" };\n    router.push(routes[next]);\n  }\n\n  function openMap(place: Place) {\n    addRecent(place); setTab("map"); setSelectedPlace(place); router.push(`/map/?place=${encodeURIComponent(place.slug)}`);\n  }'''
s, count = pattern.subn(replacement, s, count=1)
if count != 1: raise RuntimeError('routing patch failed')

# Map deep link selection.
insert_after = '  const nearbyPicks = useMemo(() => sortPlaces(visiblePlaces, "distanceAsc").slice(0, 5), [visiblePlaces]);\n'
if insert_after in s:
    s = s.replace(insert_after, insert_after + '''\n  useEffect(() => {\n    if (tab !== "map" || typeof window === "undefined") return;\n    const slug = new URLSearchParams(window.location.search).get("place");\n    if (!slug) return;\n    const place = allPlaces.find((item) => item.slug === slug);\n    if (place) setSelectedPlace(place);\n  }, [tab, allPlaces]);\n''', 1)
else: raise RuntimeError('map deep link insertion failed')

# Location management updates search center/settings.
s = s.replace('        setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude });\n        setOriginMode("me");', '        const center = { lat: position.coords.latitude, lng: position.coords.longitude };\n        setOrigin(center); setMapSearchCenter(center); setOriginMode("me"); setSettings((current) => ({ ...current, homeMode: "me" }));')
s = s.replace('    setOrigin(DORM_CENTER);\n    setOriginMode("dorm");', '    setOrigin(DORM_CENTER); setMapSearchCenter(DORM_CENTER);\n    setOriginMode("dorm"); setSettings((current) => ({ ...current, homeMode: "dorm" }));')

# Food Now decision sheet and weighted ranking.
pattern = re.compile(r'  function pickFoodNow\(\) \{.*?\n  \}\n\n  function createCollection', re.S)
replacement = '''  function pickFoodNow() { setFoodNowOpen(true); }\n\n  function recommendFoodNow(options: FoodNowOptions) {\n    const preferred = new Set(settings.preferredCategories || []);\n    const candidates = allPlaces.filter((place) => FOOD_CATEGORIES.has(place.category)).filter((place) => place.distanceKm == null || place.distanceKm * 1000 <= options.radius).filter((place) => !settings.verifiedOnly || place.verified).filter((place) => !options.openNow || getPlaceOpenStatus(place).isOpen === true).filter((place) => !options.localOnly || place.placeType === "local" || place.placeType === "independent" || place.localFavorite).filter((place) => !options.lateOnly || place.openLate === true).filter((place) => { if (options.budget == null) return true; const ceiling = explicitPriceCeiling(place); return ceiling != null && ceiling <= options.budget; });\n    const ranked = candidates.map((place) => {\n      const isOpen = getPlaceOpenStatus(place).isOpen === true; const distance = place.distanceKm == null ? 0 : Math.max(0, 1 - (place.distanceKm * 1000) / options.radius); const budget = options.budget == null ? 1 : explicitPriceCeiling(place) != null && explicitPriceCeiling(place)! <= options.budget ? 1 : 0; const rating = (place.rating ?? 0) / 5; const local = Math.min(1, (place.localScore ?? (place.localFavorite ? 80 : 0)) / 100); const preference = preferred.has(place.category) ? 1 : 0; const hour = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" })).getHours(); const timeFit = hour >= 21 ? (place.openLate ? 1 : .2) : 1;\n      return { place, score: (isOpen ? .25 : 0) + distance * .20 + budget * .15 + rating * .15 + local * .10 + preference * .10 + timeFit * .05 };\n    }).sort((a,b) => b.score - a.score);\n    setFoodNowOpen(false); if (ranked[0]) openDetail(ranked[0].place);\n  }\n\n  function createCollection'''
s, count = pattern.subn(replacement, s, count=1)
if count != 1: raise RuntimeError('food now patch failed')

# Collection sheets / multi-collection behavior.
pattern = re.compile(r'  function createCollection\(\) \{.*?\n  function moveFavoriteToCollection\(place: Place, collectionId: string\) \{.*?\n  \}', re.S)
replacement = '''  function createCollection() { setCollectionEditor({ mode: "create" }); }\n  function renameCollection(collection: SavedCollection) { setCollectionEditor({ mode: "rename", collection }); }\n  function deleteCollection(collection: SavedCollection) { if (!["wishlist", "regular", "late", "work"].includes(collection.id)) setCollectionEditor({ mode: "delete", collection }); }\n  function submitCollectionEditor(value?: string) {\n    if (!collectionEditor) return;\n    if (collectionEditor.mode === "create" && value) { const id = `collection-${Date.now()}`; setCollections((current) => [...current, { id, title: value, icon: "📌", placeIds: [] }]); setSelectedCollection(id); }\n    if (collectionEditor.mode === "rename" && collectionEditor.collection && value) setCollections((current) => current.map((item) => item.id === collectionEditor.collection!.id ? { ...item, title: value } : item));\n    if (collectionEditor.mode === "delete" && collectionEditor.collection) { const id = collectionEditor.collection.id; setCollections((current) => current.filter((item) => item.id !== id)); if (selectedCollection === id) setSelectedCollection(null); }\n    setCollectionEditor(null);\n  }\n  function toggleFavoriteCollection(place: Place, collectionId: string) {\n    setCollections((current) => current.map((collection) => collection.id !== collectionId ? collection : { ...collection, placeIds: collection.placeIds.includes(place.id) ? collection.placeIds.filter((id) => id !== place.id) : Array.from(new Set([place.id, ...collection.placeIds])) }));\n  }'''
s, count = pattern.subn(replacement, s, count=1)
if count != 1: raise RuntimeError('collection patch failed')

# Map engine: map ID env, legacy fallback, clustering, radius circle, idle search area.
pattern = re.compile(r'  useEffect\(\(\) => \{\n    if \(tab !== "map" \|\| !apiReady \|\| !mapEl\.current\) return;.*?\n  \}, \[tab, apiReady, origin, originMode, radiusMeters, visiblePlaces, selectedPlace\]\);', re.S)
replacement = '''  useEffect(() => {\n    if (tab !== "map" || !apiReady || !mapEl.current) return;\n    let cancelled = false;\n    void (async () => {\n      await window.google.maps.importLibrary("maps");\n      const markerLib = mapId ? await window.google.maps.importLibrary("marker") : null;\n      if (cancelled || !mapEl.current) return;\n      if (!mapRef.current) {\n        const options: any = { center: mapSearchCenter, zoom: 15, backgroundColor: "#02060D", disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy" };\n        if (mapId) options.mapId = mapId; else options.styles = LEGACY_DARK_MAP_STYLES;\n        mapRef.current = new window.google.maps.Map(mapEl.current, options);\n        mapIdleListenerRef.current = mapRef.current.addListener("idle", () => { const center = mapRef.current?.getCenter?.(); if (!center) return; const next = { lat: center.lat(), lng: center.lng() }; const moved = Math.abs(next.lat - mapSearchCenter.lat) > 0.0008 || Math.abs(next.lng - mapSearchCenter.lng) > 0.0008; if (moved) { setPendingMapCenter(next); setShowSearchArea(true); } });\n      }\n      const target = selectedPlace?.latitude != null && selectedPlace.longitude != null ? { lat: selectedPlace.latitude, lng: selectedPlace.longitude } : mapSearchCenter;\n      mapRef.current.setCenter(target);\n      mapRef.current.setZoom(selectedPlace?.latitude != null ? 17 : radiusMeters <= 500 ? 16 : radiusMeters <= 1000 ? 15 : radiusMeters <= 3000 ? 14 : 13);\n      if (!radiusCircleRef.current) radiusCircleRef.current = new window.google.maps.Circle({ map: mapRef.current, center: origin, radius: radiusMeters, strokeColor: "#00D9FF", strokeOpacity: .38, strokeWeight: 1, fillColor: "#007AFF", fillOpacity: .07, clickable: false });\n      else { radiusCircleRef.current.setCenter(origin); radiusCircleRef.current.setRadius(radiusMeters); }\n      clustererRef.current?.clearMarkers(); clustererRef.current = null;\n      markersRef.current.forEach((marker) => { if ("map" in marker) marker.map = null; else marker.setMap?.(null); }); markersRef.current = [];\n      const placeMarkers: any[] = [];\n      const makeMarker = (position: {lat:number;lng:number}, title: string, color: string, selected = false) => {\n        if (mapId && markerLib) { const pin = new markerLib.PinElement({ background: selected ? "#ffffff" : color, borderColor: selected ? "#00D9FF" : "#d8e4f5", glyphColor: selected ? "#007AFF" : "#07101b", scale: selected ? 1.2 : .9 }); return new markerLib.AdvancedMarkerElement({ map: mapRef.current, position, title, content: pin.element }); }\n        return new window.google.maps.Marker({ map: mapRef.current, position, title, icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: selected ? 10 : 7, fillColor: selected ? "#ffffff" : color, fillOpacity: 1, strokeColor: selected ? "#00D9FF" : "#d8e4f5", strokeWeight: 2 } });\n      };\n      const originMarker = makeMarker(origin, originMode === "dorm" ? DORM_NAME : copy.yourLocation, "#007AFF", true); markersRef.current.push(originMarker);\n      visiblePlaces.forEach((place) => { if (place.latitude == null || place.longitude == null) return; const marker = makeMarker({lat:place.latitude,lng:place.longitude}, place.name, MARKER_COLORS[place.category] || "#8ca0bb", selectedPlace?.id === place.id); marker.addListener("click", () => { addRecent(place); setSelectedPlace(place); }); placeMarkers.push(marker); markersRef.current.push(marker); });\n      if (placeMarkers.length) clustererRef.current = new MarkerClusterer({ map: mapRef.current, markers: placeMarkers });\n    })();\n    return () => { cancelled = true; };\n  }, [tab, apiReady, mapId, origin, originMode, radiusMeters, visiblePlaces, selectedPlace, mapSearchCenter, copy.yourLocation]);'''
s, count = pattern.subn(replacement, s, count=1)
if count != 1: raise RuntimeError('map effect patch failed')

# Today summary variables obsolete.
s = s.replace('  const recentCategoryCount = new Set(recentPlaces.map((place) => place.category)).size;\n  const recentAreaCount = new Set(recentPlaces.map((place) => place.area).filter(Boolean)).size;\n', '')

# Main screen text localization / map search-area / collection UI / recent UX.
s = s.replace('<Sparkles className="h-3 w-3" /> ค้นพบรอบหอ', '<Sparkles className="h-3 w-3" /> {copy.discoverAroundDorm}')
s = s.replace('<span className="text-[#19E6FF]">ทุกที่รอบหอ</span><br />ครบ จบ ในแอปเดียว', '<span className="text-[#19E6FF]">{copy.heroLine1}</span><br />{copy.heroLine2}')
s = s.replace('>อัปเดตร้านใหม่ ข้อมูลจริง และทางลัดสำหรับชีวิตรอบหอ</p>', '>{copy.heroSub}</p>')
s = s.replace('<MapIcon className="h-4 w-4 text-[#00D9FF]" /> ดูแผนที่รอบหอ', '<MapIcon className="h-4 w-4 text-[#00D9FF]" /> {copy.viewDormMap}')
s = s.replace('>+ ตัวกรอง</button>', '>{copy.moreFilters}</button>')
s = s.replace('>ไม่พบร้านที่ตรงกับเงื่อนไข</p>', '>{copy.noMatches}</p>')
s = s.replace('>ล้างตัวกรอง</button>', '>{copy.clearFilters}</button>')
s = s.replace('<Utensils className="h-4 w-4" /> กินอะไรดีตอนนี้', '<Utensils className="h-4 w-4" /> {copy.foodNow}')
s = s.replace('settings.language === "en" ? "My location" : "ตำแหน่งของฉัน"', 'copy.myLocation')

# Inject Search This Area button after radius selector line.
needle = '<ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" /></div>'
if needle in s:
    s = s.replace(needle, needle + '{showSearchArea && pendingMapCenter && <button type="button" onClick={() => { setMapSearchCenter(pendingMapCenter); setShowSearchArea(false); }} className="amd-btn amd-btn-primary absolute left-1/2 top-[64px] z-20 -translate-x-1/2 rounded-full px-4 py-2 text-[10px] font-bold shadow-xl">{copy.searchThisArea}</button>}', 1)
else: raise RuntimeError('search this area insertion target missing')

# Replace inline selected map card single line with reusable draggable sheet.
lines = s.splitlines()
changed_line = False
for i, line in enumerate(lines):
    if line.strip().startswith('{selectedPlace && <div className="amd-glass-strong absolute bottom-3'):
        lines[i] = '                {selectedPlace && <MapBottomSheet place={selectedPlace} language={settings.language} onDetails={() => openDetail(selectedPlace)} />}'
        changed_line = True
        break
if not changed_line: raise RuntimeError('map bottom sheet line not found')
s = "\n".join(lines) + "\n"

# Saved strings + collection selector.
s = s.replace('><Plus className="h-4 w-4" /> เพิ่มรายการ</button>', '><Plus className="h-4 w-4" /> {copy.addItem}</button>')
s = s.replace('>คอลเลกชันของฉัน</h2>', '>{copy.myCollections}</h2>')
s = s.replace('>ดูทั้งหมด <ChevronRight', '>{copy.viewAll} <ChevronRight')
s = s.replace('>เปลี่ยนชื่อ</button>', '>{copy.rename}</button>')
s = s.replace('<Trash2 className="h-3.5 w-3.5" /> ลบ</button>', '<Trash2 className="h-3.5 w-3.5" /> {copy.delete}</button>')
s = s.replace('>บันทึกล่าสุด</h2>', '>{copy.latestSaved}</h2>')
select_pattern = re.compile(r'<div className="mt-1 flex justify-end"><select aria-label="ย้ายคอลเลกชัน".*?</select></div>')
s, n = select_pattern.subn('<div className="mt-1 flex justify-end"><button type="button" onClick={() => setCollectionSelectorPlace(place)} className="amd-chip h-9 min-h-0 px-3 text-[9px] font-semibold text-[#149CFF]">{copy.manageCollections}</button></div>', s)
if n != 1: raise RuntimeError('collection select replacement failed')
s = s.replace('>สำรวจร้านรอบหอ</button>', '>{copy.explore}</button>')

# Recent today values + in-place quick filters.
s = s.replace('>ดูล่าสุดวันนี้</p>', '>{copy.todayRecent}</p>')
s = s.replace('>{recentPlaces.length}</p><p className="mt-1 text-[11px] text-[var(--amd-text-2)]">สถานที่</p>', '>{recentTodayStats.placeCount}</p><p className="mt-1 text-[11px] text-[var(--amd-text-2)]">{copy.places}</p>')
s = s.replace('>{recentCategoryCount}</p><p className="mt-1 text-[11px] text-[var(--amd-text-2)]">หมวดหมู่</p>', '>{recentTodayStats.categoryCount}</p><p className="mt-1 text-[11px] text-[var(--amd-text-2)]">{copy.categories}</p>')
s = s.replace('>{recentAreaCount}</p><p className="mt-1 text-[11px] text-[var(--amd-text-2)]">ทำเล</p>', '>{recentTodayStats.areaCount}</p><p className="mt-1 text-[11px] text-[var(--amd-text-2)]">{copy.areas}</p>')
s = s.replace('onClick={() => { applyQuickFilter(item.key); changeTab("explore"); }} className="amd-chip flex items-center gap-2 px-4 text-[11px] font-semibold"', 'onClick={() => setRecentQuickFilter((current) => current === item.key ? null : item.key)} className={`amd-chip flex items-center gap-2 px-4 text-[11px] font-semibold ${recentQuickFilter === item.key ? "amd-chip-active" : ""}`}')
s = s.replace('{recentPlaces.map((place) => <PlaceCard key={place.id}', '{filteredRecentPlaces.map((place) => <PlaceCard key={place.id}')
s = s.replace('relativeViewedLabel(recentMeta[place.id], settings.language)', 'relativeViewedLabel(recentViewByPlaceId.get(place.id)?.viewedAt, settings.language)')
s = s.replace('>ตำแหน่งของคุณ</p>', '>{copy.yourLocation}</p>')
s = s.replace('<MapIcon className="h-4 w-4" /> ดูบนแผนที่', '<MapIcon className="h-4 w-4" /> {copy.viewOnMap}')

# Settings rows and dead ends.
s = s.replace('title="ตำแหน่งเริ่มต้น" subtitle="ใช้เพื่อแนะนำที่รอบหอ"', 'title={copy.startLocation} subtitle={copy.startLocationSub}')
s = s.replace('onClick={originMode === "dorm" ? useMyLocation : useDormLocation}', 'onClick={() => setHomeLocationOpen(true)}', 1)  # top Explore location selector intentionally becomes manager too
# Replace settings occurrence as well.
s = s.replace('onClick={originMode === "dorm" ? useMyLocation : useDormLocation}', 'onClick={() => setHomeLocationOpen(true)}')
s = s.replace('title="การแจ้งเตือน" subtitle="รับการแจ้งเตือนร้านใหม่ โปรโมชั่น และที่จอดรถ"', 'title={copy.notifications} subtitle={copy.notificationPreferenceOnly}')
s = s.replace('title="แจ้งเตือนร้านใหม่"', 'title={copy.newPlaceAlerts}')
s = s.replace('title="แจ้งเตือนโปรโมชั่น"', 'title={copy.promoAlerts}')
s = s.replace('title="แจ้งเตือนที่จอดรถ"', 'title={copy.parkingAlerts}')
s = s.replace('<p className="text-[14px] font-semibold">ธีมแอป</p><p className="mt-0.5 text-[11px] text-[var(--amd-text-3)]">เลือกโหมดการแสดงผล</p>', '<p className="text-[14px] font-semibold">{copy.theme}</p><p className="mt-0.5 text-[11px] text-[var(--amd-text-3)]">{copy.themeSub}</p>')
s = s.replace('{theme === "light" ? "สว่าง" : theme === "dark" ? "มืด" : "ตามระบบ"}', '{theme === "light" ? copy.light : theme === "dark" ? copy.dark : copy.system}')
s = s.replace('title="หมวดหมู่ที่สนใจ" subtitle="เลือกหมวดที่คุณอยากเห็นเป็นพิเศษ" action={<button type="button" onClick={() => setFilterOpen(true)} className="flex items-center gap-1 text-[11px] font-semibold text-[#149CFF]">จัดการหมวดหมู่', 'title={copy.interestedCategories} subtitle={copy.interestedCategoriesSub} action={<button type="button" onClick={() => setCategoryPreferenceOpen(true)} className="flex items-center gap-1 text-[11px] font-semibold text-[#149CFF]">{copy.manageCategories}')
s = s.replace('title="แสดงเฉพาะร้านที่ยืนยันแล้ว" subtitle="มีผลกับ Explore, Map, Search และคำแนะนำ"', 'title={copy.verifiedOnly} subtitle={copy.verifiedOnlySub}')
s = s.replace('title="ภาษา (Language)" subtitle="เปลี่ยนภาษาหลักของแอป"', 'title={copy.language} subtitle={copy.languageSub}')
s = s.replace('title="ศูนย์ช่วยเหลือ" subtitle="FAQ และการติดต่อทีมงาน" action={<ChevronRight', 'title={copy.helpCenter} subtitle={copy.helpSub} action={<button type="button" aria-label={copy.helpCenter} onClick={() => setInfoSheet("help")} className="grid h-11 w-11 place-items-center"><ChevronRight')
s = s.replace('text-[var(--amd-text-2)]" />} />', 'text-[var(--amd-text-2)]" /></button>} />', 1)
s = s.replace('title="เกี่ยวกับ Around My Dorm" subtitle="ข้อมูลแอป นโยบายความเป็นส่วนตัว และข้อกำหนด" action={<ChevronRight', 'title={copy.about} subtitle={copy.aboutSub} action={<button type="button" aria-label={copy.about} onClick={() => setInfoSheet("about")} className="grid h-11 w-11 place-items-center"><ChevronRight')
# second closing Chevron action
idx = s.find('title={copy.about}')
if idx != -1:
    tail = s[idx:]
    tail = tail.replace('text-[var(--amd-text-2)]" />} />', 'text-[var(--amd-text-2)]" /></button>} />', 1)
    s = s[:idx] + tail
s = s.replace('>ร้านที่บันทึก</p>', '>{copy.savedCount}</p>').replace('>ดูล่าสุด</p>', '>{copy.recentCount}</p>').replace('>ข้อมูลร้าน</p>', '>{copy.placeData}</p>')
s = s.replace('Around My Dorm • v2.1.0', 'Around My Dorm • v2.2.0')

# Custom home helper function inserted before applyQuickFilter.
home_helper = '''\n  function useCustomHomeLocation(value: { name: string; latitude: number; longitude: number }) {\n    const center = { lat: value.latitude, lng: value.longitude }; setOrigin(center); setMapSearchCenter(center); setOriginMode("custom"); setSettings((current) => ({ ...current, homeMode: "custom", customHomeLocation: value })); setHomeLocationOpen(false);\n  }\n'''
s = s.replace('  function applyQuickFilter(key: Exclude<QuickFilter, null>) {', home_helper + '\n  function applyQuickFilter(key: Exclude<QuickFilter, null>) {', 1)

# Bottom overlays.
needle = '      {filterOpen && <FilterSheet value={filters} onChange={setFilters} onClose={() => setFilterOpen(false)} />}\n      {detailPlace && <PlaceDetail place={detailPlace} saved={isFavorite(detailPlace)} onClose={() => setDetailPlace(null)} onSave={() => toggleFavorite(detailPlace)} onMap={() => { setDetailPlace(null); openMap(detailPlace); }} />}\n'
replacement = '''      {filterOpen && <FilterSheet value={filters} onChange={setFilters} onClose={() => setFilterOpen(false)} />}\n      {detailPlace && <PlaceDetail place={detailPlace} saved={isFavorite(detailPlace)} language={settings.language} onClose={() => setDetailPlace(null)} onSave={() => toggleFavorite(detailPlace)} onMap={() => { setDetailPlace(null); openMap(detailPlace); }} />}\n      {collectionEditor && <CollectionEditorSheet mode={collectionEditor.mode} collection={collectionEditor.collection} language={settings.language} onClose={() => setCollectionEditor(null)} onSubmit={submitCollectionEditor} />}\n      {collectionSelectorPlace && <CollectionSelectorSheet place={collectionSelectorPlace} collections={collections} language={settings.language} onToggle={(collectionId) => toggleFavoriteCollection(collectionSelectorPlace, collectionId)} onClose={() => setCollectionSelectorPlace(null)} />}\n      {categoryPreferenceOpen && <CategoryPreferenceSheet value={settings.preferredCategories || []} language={settings.language} onChange={(preferredCategories) => setSettings((current) => ({ ...current, preferredCategories }))} onClose={() => setCategoryPreferenceOpen(false)} />}\n      {infoSheet && <InfoSheet kind={infoSheet} language={settings.language} onClose={() => setInfoSheet(null)} />}\n      {homeLocationOpen && <HomeLocationSheet language={settings.language} custom={settings.customHomeLocation} onDorm={() => { useDormLocation(); setHomeLocationOpen(false); }} onCurrent={() => { useMyLocation(); setHomeLocationOpen(false); }} onCustom={useCustomHomeLocation} onClose={() => setHomeLocationOpen(false)} />}\n      {foodNowOpen && <FoodNowSheet language={settings.language} defaultRadius={radiusMeters} onClose={() => setFoodNowOpen(false)} onSubmit={recommendFoodNow} />}\n'''
s = replace_once(s, needle, replacement, 'overlay components')

# Navigation accessible selection state.
s = s.replace('return <button key={item.id} type="button" onClick={() => changeTab(item.id)}', 'return <button key={item.id} type="button" aria-current={active ? "page" : undefined} onClick={() => changeTab(item.id)}')

app_path.write_text(s, encoding="utf-8")

# ---------------------------------------------------------------------------
# Remove confirmed dead deployment trigger files (not referenced by build/workers config).
# Old one-shot restore/apply workflows are also migration-only and unsafe to retain.
# ---------------------------------------------------------------------------
for dead in [
    ".deploy-trigger",
    ".cloudflare-deploy-trigger-20260904-0818.txt",
    ".github/workflows/restore-mobile-app-shell.yml",
    ".github/workflows/apply-product-upgrade.yml",
    "scripts/apply-main-upgrade.mjs",
    "components/NewPlacesSpotlight.tsx",
]:
    path = ROOT / dead
    if path.exists(): path.unlink()

print("Production architecture upgrade applied.")
