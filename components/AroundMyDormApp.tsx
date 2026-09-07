"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Bell,
  BellRing,
  Bookmark,
  BriefcaseBusiness,
  Car,
  ChevronDown,
  ChevronRight,
  Clock3,
  Coffee,
  Compass,
  Filter,
  Grid2X2,
  Heart,
  HelpCircle,
  History,
  Home,
  Info,
  Languages,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Moon,
  Navigation,
  Palette,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Tag,
  Trash2,
  UserRound,
  Utensils,
  X,
} from "lucide-react";
import { CATEGORIES, CATEGORY_MAP } from "@/data/categories";
import { PLACES } from "@/data/places";
import { FilterSheet, EMPTY_FILTERS, type FilterState } from "@/components/FilterSheet";
import { PlaceCard } from "@/components/PlaceCard";
import { PlaceDetail } from "@/components/PlaceDetail";
import { GOOGLE_PLACE_FIELDS, loadGoogleMaps, mapGooglePlace } from "@/lib/google-maps";
import {
  DORM_CENTER,
  DORM_NAME,
  dedupePlaces,
  formatDistance,
  getPlaceOpenStatus,
  googleMapsDirectionsUrl,
  matchesSearch,
  normalizeText,
  withDistance,
} from "@/lib/place-utils";
import type { CategoryId, Place, SortMode } from "@/types/place";

type Tab = "explore" | "map" | "favorites" | "recent" | "settings";
type OriginMode = "dorm" | "me";
type Language = "th" | "en";
type ThemeMode = "light" | "dark" | "system";
type QuickFilter = "open" | "near" | "cafe" | "late" | "parking" | null;

type AppSettings = {
  theme: ThemeMode;
  language: Language;
  notifications: boolean;
  newPlaceAlerts: boolean;
  promoAlerts: boolean;
  parkingAlerts: boolean;
  verifiedOnly: boolean;
  defaultRadius: number;
};

type SavedCollection = {
  id: string;
  title: string;
  icon: string;
  placeIds: string[];
};

const SETTINGS_KEY = "around-dorm-settings-v3";
const COLLECTIONS_KEY = "around-dorm-collections-v1";
const RECENT_META_KEY = "around-dorm-recent-meta-v1";

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  language: "th",
  notifications: true,
  newPlaceAlerts: true,
  promoAlerts: true,
  parkingAlerts: true,
  verifiedOnly: false,
  defaultRadius: 500,
};

const DEFAULT_COLLECTIONS: SavedCollection[] = [
  { id: "wishlist", title: "อยากไป", icon: "🔖", placeIds: [] },
  { id: "regular", title: "ร้านประจำ", icon: "⭐", placeIds: [] },
  { id: "late", title: "ร้านดึก", icon: "🌙", placeIds: [] },
  { id: "work", title: "คาเฟ่นั่งทำงาน", icon: "💻", placeIds: [] },
];

const RADII = [
  { label: "250 ม.", value: 250 },
  { label: "500 ม.", value: 500 },
  { label: "1 กม.", value: 1000 },
  { label: "2 กม.", value: 2000 },
  { label: "3 กม.", value: 3000 },
  { label: "5 กม.", value: 5000 },
];

const TARGET_GOOGLE_TYPES = [
  "restaurant",
  "cafe",
  "bar",
  "convenience_store",
  "supermarket",
  "pharmacy",
  "laundry",
  "hair_salon",
  "gym",
  "parking",
];

const FOOD_CATEGORIES = new Set<CategoryId>([
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

const MARKER_COLORS: Record<string, string> = {
  food: "#ff9d3c",
  local_food: "#ff9d3c",
  noodle: "#ff9d3c",
  thai_food: "#ff9d3c",
  isan_food: "#ff8a3d",
  mookata: "#ff7043",
  japanese: "#f0f4ff",
  korean_food: "#ff875e",
  vietnamese_food: "#66dfbd",
  hotpot: "#ff7f50",
  bbq: "#ff7043",
  chinese_food: "#f59e0b",
  night_food: "#9b6cff",
  cafe: "#e8eef8",
  bar: "#9b6cff",
  convenience: "#8f6cff",
  supermarket: "#8f6cff",
  shopping: "#8f6cff",
  pharmacy: "#00e5c3",
  clinic: "#00d9ff",
  laundry: "#00d9ff",
  barber: "#00d9ff",
  salon: "#9b6cff",
  fitness: "#149cff",
  parking: "#007aff",
  monthly_parking: "#007aff",
  service: "#8ca0bb",
  other: "#8ca0bb",
};

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
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

const TH = {
  explore: "สำรวจ",
  map: "แผนที่",
  saved: "บันทึก",
  recent: "ดูล่าสุด",
  settings: "ตั้งค่า",
  exploreSubtitle: "ร้านและบริการรอบบ้านสุภา",
  mapSubtitle: "สถานที่รอบ บ้านสุภาอพาร์ทเม้นต์",
  savedSubtitle: "ร้านและสถานที่ที่คุณเก็บไว้",
  recentSubtitle: "ตามรอยที่คุณสนใจ ไปต่อได้เลย",
  settingsSubtitle: "ปรับแอปให้เหมาะกับการใช้รอบหอ",
  search: "ค้นหาร้านค้า คาเฟ่ หรือบริการ",
  searchMap: "ค้นหาสถานที่, ร้านค้า หรือบริการ",
  openNow: "เปิดอยู่ตอนนี้",
  near: "ใกล้หอ",
  cafe: "คาเฟ่",
  late: "ร้านดึก",
  parking: "ที่จอดรถ",
  localPick: "Local Pick",
  nearby: "ใกล้บ้านสุภา",
  viewAll: "ดูทั้งหมด",
  navigate: "นำทาง",
  details: "รายละเอียด",
  emptySaved: "ยังไม่มีร้านที่บันทึก",
  emptyRecent: "ยังไม่มีประวัติการดู",
} as const;

const EN = {
  explore: "Explore",
  map: "Map",
  saved: "Saved",
  recent: "Recent",
  settings: "Settings",
  exploreSubtitle: "Places and services around Baan Supar",
  mapSubtitle: "Places around Baan Supar Apartment",
  savedSubtitle: "Places you have saved",
  recentSubtitle: "Pick up where you left off",
  settingsSubtitle: "Personalize your local discovery app",
  search: "Search shops, cafes or services",
  searchMap: "Search places, shops or services",
  openNow: "Open now",
  near: "Near dorm",
  cafe: "Cafe",
  late: "Late night",
  parking: "Parking",
  localPick: "Local Pick",
  nearby: "Near Baan Supar",
  viewAll: "View all",
  navigate: "Navigate",
  details: "Details",
  emptySaved: "No saved places yet",
  emptyRecent: "No recent history yet",
} as const;

function mergeSeedAndLive(seedPlaces: Place[], livePlaces: Place[]) {
  const used = new Set<string>();
  const merged = seedPlaces.map((seed) => {
    const live = livePlaces.find((candidate) => normalizeText(candidate.name) === normalizeText(seed.name));
    if (!live) return seed;
    used.add(live.id);
    return {
      ...seed,
      googlePlaceId: live.googlePlaceId,
      address: live.address || seed.address,
      latitude: live.latitude,
      longitude: live.longitude,
      distanceKm: live.distanceKm,
      walkingMinutes: live.walkingMinutes,
      drivingMinutes: live.drivingMinutes,
      liveOpenNow: live.liveOpenNow,
      priceLevel: live.priceLevel ?? seed.priceLevel,
      rating: live.rating,
      reviewCount: live.reviewCount,
      phone: live.phone || seed.phone,
      website: live.website || seed.website,
      googleMapsUrl: live.googleMapsUrl || seed.googleMapsUrl,
      image: live.image || seed.image,
      images: live.images.length ? live.images : seed.images,
      delivery: live.delivery ?? seed.delivery,
      dineIn: live.dineIn ?? seed.dineIn,
      takeaway: live.takeaway ?? seed.takeaway,
      wheelchairAccessible: live.wheelchairAccessible ?? seed.wheelchairAccessible,
      verified: true,
      lastVerified: live.lastVerified,
      source: Array.from(new Set([...seed.source, ...live.source])),
      tags: Array.from(new Set([...seed.tags, ...live.tags])),
      notes: live.notes || seed.notes,
    } satisfies Place;
  });
  return dedupePlaces([...merged, ...livePlaces.filter((place) => !used.has(place.id))]);
}

function activeFilterCount(filters: FilterState) {
  return (
    Object.entries(filters).filter(([key, value]) => !["priceLevels", "maxPrice", "maxWalkingMinutes", "area"].includes(key) && value === true).length +
    (filters.priceLevels.length ? 1 : 0) +
    (filters.maxPrice != null ? 1 : 0) +
    (filters.maxWalkingMinutes != null ? 1 : 0) +
    (filters.area ? 1 : 0)
  );
}

function explicitPriceCeiling(place: Place) {
  if (place.pricing?.max != null) return place.pricing.max;
  if (place.pricing?.fixed != null) return place.pricing.fixed;
  if (place.maxPrice != null) return place.maxPrice;
  if (place.averagePricePerPerson != null) return place.averagePricePerPerson;
  return null;
}

function passesFilters(place: Place, filters: FilterState, verifiedOnly: boolean) {
  const status = getPlaceOpenStatus(place);
  if (filters.onlyOpen && status.isOpen !== true) return false;
  if (filters.only24Hours && !place.is24Hours) return false;
  if (filters.openLate && place.openLate !== true) return false;
  if (filters.parking && place.parking.available !== true && !place.categories.includes("parking") && !place.categories.includes("monthly_parking")) return false;
  if (filters.wifi && place.wifi !== true) return false;
  if (filters.powerOutlet && place.powerOutlet !== true) return false;
  if (filters.airConditioned && place.airConditioned !== true) return false;
  if (filters.delivery && place.delivery !== true) return false;
  if (filters.takeaway && place.takeaway !== true) return false;
  if (filters.goodForWorking && place.goodForWorking !== true) return false;
  if (filters.studentFriendly && place.studentFriendly !== true) return false;
  if ((filters.verifiedOnly || verifiedOnly) && !place.verified) return false;
  if (filters.localOnly && !(place.placeType === "local" || place.placeType === "independent" || place.localFavorite)) return false;
  if (filters.priceLevels.length && (place.priceLevel == null || !filters.priceLevels.includes(place.priceLevel))) return false;
  if (filters.maxPrice != null) {
    const ceiling = explicitPriceCeiling(place);
    if (ceiling == null || ceiling > filters.maxPrice) return false;
  }
  if (filters.maxWalkingMinutes != null) {
    const walking = place.distance?.walkingMinutes ?? place.walkingMinutes;
    if (walking == null || walking > filters.maxWalkingMinutes) return false;
  }
  if (filters.area && !normalizeText(`${place.area} ${place.soi || ""}`).includes(normalizeText(filters.area))) return false;
  return true;
}

function sortPlaces(places: Place[], mode: SortMode) {
  return [...places].sort((a, b) => {
    const distanceA = a.distanceKm ?? Number.POSITIVE_INFINITY;
    const distanceB = b.distanceKm ?? Number.POSITIVE_INFINITY;
    if (mode === "distanceAsc") return distanceA - distanceB;
    if (mode === "distanceDesc") return distanceB - distanceA;
    if (mode === "rating") return (b.rating ?? -1) - (a.rating ?? -1);
    if (mode === "reviews") return (b.reviewCount ?? -1) - (a.reviewCount ?? -1);
    if (mode === "price") return (explicitPriceCeiling(a) ?? 999999) - (explicitPriceCeiling(b) ?? 999999);
    if (mode === "openNow") return Number(getPlaceOpenStatus(b).isOpen === true) - Number(getPlaceOpenStatus(a).isOpen === true);
    if (mode === "local") return Number(Boolean(b.localFavorite)) - Number(Boolean(a.localFavorite));
    if (mode === "late") return Number(b.openLate === true) - Number(a.openLate === true);
    return (
      Number(b.recommended) - Number(a.recommended) ||
      Number(b.localFavorite) - Number(a.localFavorite) ||
      Number(b.verified) - Number(a.verified) ||
      (b.rating ?? -1) - (a.rating ?? -1) ||
      distanceA - distanceB
    );
  });
}

function relativeViewedLabel(iso: string | undefined, language: Language) {
  if (!iso) return language === "en" ? "Recently viewed" : "ดูล่าสุด";
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return language === "en" ? "Recently viewed" : "ดูล่าสุด";
  const now = new Date();
  const diff = now.getTime() - time.getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return language === "en" ? "Just now" : "เมื่อสักครู่";
  if (minutes < 60) return language === "en" ? `${minutes}m ago` : `${minutes} นาทีที่แล้ว`;
  if (minutes < 24 * 60) return language === "en" ? `Today ${time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : `วันนี้ ${time.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
  if (minutes < 48 * 60) return language === "en" ? `Yesterday ${time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : `เมื่อวาน ${time.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
  return time.toLocaleDateString(language === "en" ? "en-GB" : "th-TH", { day: "numeric", month: "short" });
}

function PageHeader({ title, subtitle, right }: { title: string; subtitle: string; right?: React.ReactNode }) {
  return (
    <header className="amd-safe-top flex items-start justify-between gap-4 pb-5">
      <div className="min-w-0">
        <h1 className="text-[34px] font-bold leading-none tracking-[-0.045em] text-[var(--amd-text)] sm:text-[38px]">{title}</h1>
        <p className="mt-2 text-[14px] text-[var(--amd-text-2)]">{subtitle}</p>
      </div>
      {right}
    </header>
  );
}

function Toggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onChange}
      className={`relative h-8 w-[52px] shrink-0 rounded-full border transition duration-200 ${active ? "border-[rgba(0,140,255,.72)] bg-[#007AFF] shadow-[0_0_16px_rgba(0,122,255,.28)]" : "border-[rgba(120,160,210,.18)] bg-white/[0.08]"}`}
    >
      <span className={`absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition duration-200 ${active ? "left-[23px]" : "left-[3px]"}`} />
    </button>
  );
}

function SettingRow({ icon, title, subtitle, action }: { icon: React.ReactNode; title: string; subtitle?: string; action: React.ReactNode }) {
  return (
    <div className="flex min-h-[66px] items-center gap-3 border-b border-[rgba(120,160,210,.11)] py-3 last:border-b-0">
      <div className="grid h-9 w-9 shrink-0 place-items-center text-[#00D9FF]">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-[var(--amd-text)]">{title}</p>
        {subtitle && <p className="mt-0.5 text-[11px] text-[var(--amd-text-3)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function MiniMapArtwork() {
  return (
    <div className="absolute inset-y-0 right-0 w-[48%] overflow-hidden opacity-95">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0_42%,rgba(0,140,255,.12)_42%_44%,transparent_44%_100%)]" />
      <div className="absolute right-[26%] top-[29%] grid h-14 w-14 place-items-center rounded-full border border-[#149CFF] bg-[rgba(0,122,255,.2)] shadow-[0_0_28px_rgba(0,122,255,.52)]"><Home className="h-6 w-6 text-white" /></div>
      <div className="amd-map-dot left-[21%] top-[32%]" />
      <div className="amd-map-dot bottom-[25%] left-[44%]" />
      <div className="amd-map-dot right-[18%] top-[18%]" />
      <div className="absolute left-[12%] top-[18%] grid h-8 w-8 place-items-center rounded-full border border-[rgba(0,229,195,.28)] bg-[#061424]/90 text-[15px]">☕</div>
      <div className="absolute bottom-[15%] right-[15%] grid h-8 w-8 place-items-center rounded-full border border-[rgba(155,108,255,.34)] bg-[#07111f]/90 text-[15px]">🛍️</div>
    </div>
  );
}

function LoadingCards() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="amd-glass amd-card flex h-[154px] overflow-hidden">
          <div className="amd-skeleton w-[35%]" />
          <div className="flex-1 p-4">
            <div className="amd-skeleton h-5 w-2/3 rounded-lg" />
            <div className="amd-skeleton mt-3 h-3 w-1/2 rounded-lg" />
            <div className="amd-skeleton mt-5 h-3 w-3/4 rounded-lg" />
            <div className="amd-skeleton mt-5 h-9 w-28 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AroundMyDormApp({ initialTab = "explore" }: { initialTab?: Tab }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState<"all" | CategoryId>("all");
  const [radiusMeters, setRadiusMeters] = useState(500);
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [origin, setOrigin] = useState(DORM_CENTER);
  const [originMode, setOriginMode] = useState<OriginMode>("dorm");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [livePlaces, setLivePlaces] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);
  const [favorites, setFavorites] = useState<Place[]>([]);
  const [recent, setRecent] = useState<Place[]>([]);
  const [recentMeta, setRecentMeta] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [collections, setCollections] = useState<SavedCollection[]>(DEFAULT_COLLECTIONS);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const copy = settings.language === "en" ? EN : TH;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("around-dorm-favorites-v2") || "[]") as Place[];
      const viewed = JSON.parse(localStorage.getItem("around-dorm-recent-v2") || "[]") as Place[];
      const recentTimes = JSON.parse(localStorage.getItem(RECENT_META_KEY) || "{}") as Record<string, string>;
      const savedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null") as Partial<AppSettings> | null;
      const savedCollections = JSON.parse(localStorage.getItem(COLLECTIONS_KEY) || "null") as SavedCollection[] | null;
      const nextFavorites = Array.isArray(saved) ? saved : [];
      setFavorites(nextFavorites);
      setRecent(Array.isArray(viewed) ? viewed.slice(0, 10) : []);
      setRecentMeta(recentTimes && typeof recentTimes === "object" ? recentTimes : {});
      const mergedSettings = { ...DEFAULT_SETTINGS, ...(savedSettings || {}) };
      setSettings(mergedSettings);
      setRadiusMeters(mergedSettings.defaultRadius);
      if (Array.isArray(savedCollections) && savedCollections.length) {
        setCollections(savedCollections);
      } else if (nextFavorites.length) {
        setCollections(DEFAULT_COLLECTIONS.map((collection) => collection.id === "wishlist" ? { ...collection, placeIds: nextFavorites.map((place) => place.id) } : collection));
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    const resolveTheme = () => {
      const mode = settings.theme === "system"
        ? window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
        : settings.theme;
      document.documentElement.dataset.theme = mode;
    };
    resolveTheme();
    if (settings.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    media.addEventListener?.("change", resolveTheme);
    return () => media.removeEventListener?.("change", resolveTheme);
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
  }, [collections]);

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey)
      .then(() => setApiReady(true))
      .catch(() => setApiReady(false));
  }, [apiKey]);

  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;

    async function fetchPlaces() {
      setLoadingPlaces(true);
      try {
        const { Place: GooglePlace } = await window.google.maps.importLibrary("places");
        const active = CATEGORIES.find((item) => item.id === category);
        let result: any;

        if (debouncedQuery) {
          const request: any = {
            textQuery: debouncedQuery,
            fields: GOOGLE_PLACE_FIELDS,
            locationBias: { center: origin, radius: radiusMeters },
            language: settings.language,
            region: "TH",
            maxResultCount: 20,
            rankPreference: "RELEVANCE",
          };
          if (category !== "all" && active?.googleTypes?.[0]) request.includedType = active.googleTypes[0];
          result = await GooglePlace.searchByText(request);
        } else {
          const request: any = {
            fields: GOOGLE_PLACE_FIELDS,
            locationRestriction: { center: origin, radius: radiusMeters },
            maxResultCount: 20,
            rankPreference: "DISTANCE",
            language: settings.language,
            region: "TH",
          };
          if (category === "all") request.includedTypes = TARGET_GOOGLE_TYPES;
          else if (active?.googleTypes?.length) request.includedTypes = active.googleTypes;
          result = await GooglePlace.searchNearby(request);
        }

        if (!cancelled) setLivePlaces((result.places || []).map(mapGooglePlace));
      } catch {
        if (!cancelled) setLivePlaces([]);
      } finally {
        if (!cancelled) setLoadingPlaces(false);
      }
    }

    void fetchPlaces();
    return () => {
      cancelled = true;
    };
  }, [apiReady, category, debouncedQuery, radiusMeters, origin.lat, origin.lng, settings.language]);

  const allPlaces = useMemo(() => {
    const merged = mergeSeedAndLive(PLACES, livePlaces);
    return merged.map((place) => withDistance(place, origin));
  }, [livePlaces, origin]);

  const visiblePlaces = useMemo(() => {
    const data = allPlaces.filter((place) => {
      if (category !== "all" && !place.categories.includes(category)) return false;
      if (!matchesSearch(place, debouncedQuery)) return false;
      if (!passesFilters(place, filters, settings.verifiedOnly)) return false;
      if (place.distanceKm != null && place.distanceKm * 1000 > radiusMeters) return false;
      if (originMode === "me" && place.distanceKm == null) return false;
      return true;
    });
    return sortPlaces(data, sortMode);
  }, [allPlaces, category, debouncedQuery, filters, radiusMeters, originMode, sortMode, settings.verifiedOnly]);

  const favoritePlaces = useMemo(() => {
    return favorites.map((saved) => allPlaces.find((place) => place.id === saved.id || (saved.googlePlaceId && place.googlePlaceId === saved.googlePlaceId)) || saved);
  }, [favorites, allPlaces]);

  const recentPlaces = useMemo(() => {
    return recent.map((saved) => allPlaces.find((place) => place.id === saved.id || (saved.googlePlaceId && place.googlePlaceId === saved.googlePlaceId)) || saved);
  }, [recent, allPlaces]);

  const filteredFavoritePlaces = useMemo(() => {
    if (!selectedCollection) return favoritePlaces;
    const ids = new Set(collections.find((collection) => collection.id === selectedCollection)?.placeIds || []);
    return favoritePlaces.filter((place) => ids.has(place.id));
  }, [favoritePlaces, selectedCollection, collections]);

  const localPicks = useMemo(() => visiblePlaces.filter((place) => place.localFavorite || place.placeType === "local" || place.placeType === "independent").slice(0, 4), [visiblePlaces]);
  const nearbyPicks = useMemo(() => sortPlaces(visiblePlaces, "distanceAsc").slice(0, 5), [visiblePlaces]);

  function isFavorite(place: Place) {
    return favorites.some((saved) => saved.id === place.id || (saved.googlePlaceId && place.googlePlaceId === saved.googlePlaceId));
  }

  function toggleFavorite(place: Place) {
    setFavorites((current) => {
      const exists = current.some((saved) => saved.id === place.id || (saved.googlePlaceId && place.googlePlaceId === saved.googlePlaceId));
      const next = exists
        ? current.filter((saved) => !(saved.id === place.id || (saved.googlePlaceId && place.googlePlaceId === saved.googlePlaceId)))
        : [place, ...current].slice(0, 100);
      localStorage.setItem("around-dorm-favorites-v2", JSON.stringify(next));
      setCollections((currentCollections) => currentCollections.map((collection) => {
        if (exists) return { ...collection, placeIds: collection.placeIds.filter((id) => id !== place.id) };
        if (collection.id === "wishlist") return { ...collection, placeIds: Array.from(new Set([place.id, ...collection.placeIds])) };
        return collection;
      }));
      return next;
    });
  }

  function addRecent(place: Place) {
    const viewedAt = new Date().toISOString();
    setRecentMeta((current) => {
      const next = { ...current, [place.id]: viewedAt };
      localStorage.setItem(RECENT_META_KEY, JSON.stringify(next));
      return next;
    });
    setRecent((current) => {
      const next = [place, ...current.filter((item) => item.id !== place.id)].slice(0, 10);
      localStorage.setItem("around-dorm-recent-v2", JSON.stringify(next));
      return next;
    });
  }

  function openDetail(place: Place) {
    addRecent(place);
    setDetailPlace(place);
  }

  function changeTab(next: Tab) {
    setSelectedPlace(null);
    setTab(next);
    if (typeof window !== "undefined") {
      const url = next === "map" ? "/map/" : next === "favorites" ? "/favorites/" : next === "explore" ? "/" : `/?tab=${next}`;
      window.history.replaceState(null, "", url);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function openMap(place: Place) {
    addRecent(place);
    setTab("map");
    setSelectedPlace(place);
    if (typeof window !== "undefined") window.history.replaceState(null, "", "/map/");
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationError(settings.language === "en" ? "Location is not supported on this device" : "อุปกรณ์นี้ไม่รองรับ Location");
      return;
    }
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude });
        setOriginMode("me");
      },
      () => setLocationError(settings.language === "en" ? "Location permission was not granted" : "ไม่สามารถเข้าถึงตำแหน่งได้ กรุณาอนุญาต Location ใน Safari/Browser"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  function useDormLocation() {
    setOrigin(DORM_CENTER);
    setOriginMode("dorm");
    setLocationError(null);
  }

  function applyQuickFilter(key: Exclude<QuickFilter, null>) {
    const nextKey = quickFilter === key ? null : key;
    setQuickFilter(nextKey);
    setCategory("all");
    setFilters(EMPTY_FILTERS);
    setSortMode("recommended");
    if (!nextKey) return;
    if (nextKey === "open") setFilters({ ...EMPTY_FILTERS, onlyOpen: true });
    if (nextKey === "near") {
      setRadiusMeters(Math.min(radiusMeters, 1000));
      setSortMode("distanceAsc");
    }
    if (nextKey === "cafe") setCategory("cafe");
    if (nextKey === "late") setFilters({ ...EMPTY_FILTERS, openLate: true });
    if (nextKey === "parking") setCategory("parking");
  }

  function pickFoodNow() {
    const candidates = allPlaces
      .filter((place) => FOOD_CATEGORIES.has(place.category))
      .filter((place) => getPlaceOpenStatus(place).isOpen === true)
      .filter((place) => place.distanceKm == null || place.distanceKm * 1000 <= radiusMeters)
      .filter((place) => !settings.verifiedOnly || place.verified)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
    if (candidates[0]) openDetail(candidates[0]);
    else {
      setCategory("food");
      setFilters({ ...EMPTY_FILTERS, onlyOpen: true });
      changeTab("explore");
    }
  }

  function createCollection() {
    const title = window.prompt(settings.language === "en" ? "Collection name" : "ชื่อคอลเลกชัน");
    if (!title?.trim()) return;
    const id = `collection-${Date.now()}`;
    setCollections((current) => [...current, { id, title: title.trim(), icon: "📌", placeIds: [] }]);
    setSelectedCollection(id);
  }

  function renameCollection(collection: SavedCollection) {
    const title = window.prompt(settings.language === "en" ? "Rename collection" : "เปลี่ยนชื่อคอลเลกชัน", collection.title);
    if (!title?.trim()) return;
    setCollections((current) => current.map((item) => item.id === collection.id ? { ...item, title: title.trim() } : item));
  }

  function deleteCollection(collection: SavedCollection) {
    if (["wishlist", "regular", "late", "work"].includes(collection.id)) return;
    if (!window.confirm(settings.language === "en" ? `Delete ${collection.title}?` : `ลบคอลเลกชัน ${collection.title} ?`)) return;
    setCollections((current) => current.filter((item) => item.id !== collection.id));
    if (selectedCollection === collection.id) setSelectedCollection(null);
  }

  function moveFavoriteToCollection(place: Place, collectionId: string) {
    setCollections((current) => current.map((collection) => ({
      ...collection,
      placeIds: collection.id === collectionId
        ? Array.from(new Set([place.id, ...collection.placeIds]))
        : collection.placeIds.filter((id) => id !== place.id),
    })));
  }

  useEffect(() => {
    if (tab !== "map" || !apiReady || !mapEl.current) return;
    let cancelled = false;

    void (async () => {
      await window.google.maps.importLibrary("maps");
      const markerLib = await window.google.maps.importLibrary("marker");
      if (cancelled || !mapEl.current) return;

      if (!mapRef.current) {
        const colorScheme = window.google.maps.ColorScheme?.DARK;
        mapRef.current = new window.google.maps.Map(mapEl.current, {
          center: origin,
          zoom: 15,
          mapId: "DEMO_MAP_ID",
          ...(colorScheme ? { colorScheme } : {}),
          backgroundColor: "#02060D",
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
      }

      const target = selectedPlace?.latitude != null && selectedPlace.longitude != null
        ? { lat: selectedPlace.latitude, lng: selectedPlace.longitude }
        : origin;
      mapRef.current.setCenter(target);
      mapRef.current.setZoom(selectedPlace?.latitude != null ? 17 : radiusMeters <= 500 ? 16 : radiusMeters <= 1000 ? 15 : radiusMeters <= 3000 ? 14 : 13);

      markersRef.current.forEach((marker) => {
        marker.map = null;
      });
      markersRef.current = [];

      const originPin = new markerLib.PinElement({ background: "#007AFF", borderColor: "#00D9FF", glyphColor: "#ffffff", scale: 1.28 });
      markersRef.current.push(new markerLib.AdvancedMarkerElement({ map: mapRef.current, position: origin, title: originMode === "dorm" ? DORM_NAME : "ตำแหน่งของฉัน", content: originPin.element }));

      visiblePlaces.slice(0, 80).forEach((place) => {
        if (place.latitude == null || place.longitude == null) return;
        const pin = new markerLib.PinElement({
          background: selectedPlace?.id === place.id ? "#ffffff" : MARKER_COLORS[place.category] || "#8ca0bb",
          borderColor: selectedPlace?.id === place.id ? "#00D9FF" : "#d8e4f5",
          glyphColor: selectedPlace?.id === place.id ? "#007AFF" : "#07101b",
          scale: selectedPlace?.id === place.id ? 1.2 : 0.9,
        });
        const marker = new markerLib.AdvancedMarkerElement({
          map: mapRef.current,
          position: { lat: place.latitude, lng: place.longitude },
          title: place.name,
          content: pin.element,
        });
        marker.addListener("click", () => {
          addRecent(place);
          setSelectedPlace(place);
        });
        markersRef.current.push(marker);
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [tab, apiReady, origin, originMode, radiusMeters, visiblePlaces, selectedPlace]);

  const recentCategoryCount = new Set(recentPlaces.map((place) => place.category)).size;
  const recentAreaCount = new Set(recentPlaces.map((place) => place.area).filter(Boolean)).size;
  const navItems = [
    { id: "explore" as Tab, label: copy.explore, icon: Compass },
    { id: "map" as Tab, label: copy.map, icon: MapIcon },
    { id: "favorites" as Tab, label: copy.saved, icon: Bookmark },
    { id: "recent" as Tab, label: copy.recent, icon: History },
    { id: "settings" as Tab, label: copy.settings, icon: Settings },
  ];
  const filtersCount = activeFilterCount(filters) + (settings.verifiedOnly ? 1 : 0);

  return (
    <main className="amd-app">
      <div className="amd-shell">
        <div className="amd-content">
          {tab === "explore" && (
            <div className="amd-page">
              <PageHeader
                title={copy.explore}
                subtitle={copy.exploreSubtitle}
                right={
                  <button type="button" onClick={originMode === "dorm" ? useMyLocation : useDormLocation} className="amd-chip flex max-w-[185px] items-center gap-2 px-3 text-[11px] font-semibold text-[var(--amd-text)]">
                    <MapPin className="h-4 w-4 shrink-0 text-[#00D9FF]" />
                    <span className="truncate">{originMode === "dorm" ? DORM_NAME : settings.language === "en" ? "My location" : "ตำแหน่งของฉัน"}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  </button>
                }
              />

              <div className="relative amd-input">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--amd-text-3)]" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} className="h-14 w-full rounded-[20px] bg-transparent pl-12 pr-14 text-[13px] font-medium text-[var(--amd-text)] outline-none placeholder:text-[var(--amd-text-3)]" />
                <button type="button" onClick={() => setFilterOpen(true)} className="amd-btn absolute right-2 top-1/2 grid h-10 w-10 min-h-0 -translate-y-1/2 place-items-center rounded-xl border border-[rgba(120,160,210,.18)] bg-white/[0.035] text-[var(--amd-text-2)]">
                  <SlidersHorizontal className="h-[18px] w-[18px]" />
                  {filtersCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#007AFF] px-1 text-[8px] font-bold text-white">{filtersCount}</span>}
                </button>
              </div>

              {locationError && <div className="mt-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-3 py-2 text-[10px] text-rose-200">{locationError}</div>}

              <div className="-mx-4 mt-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
                <div className="flex w-max gap-2">
                  {[
                    { key: "open" as const, label: copy.openNow, icon: <Sparkles className="h-4 w-4" /> },
                    { key: "near" as const, label: copy.near, icon: <MapPin className="h-4 w-4" /> },
                    { key: "cafe" as const, label: copy.cafe, icon: <Coffee className="h-4 w-4" /> },
                    { key: "late" as const, label: copy.late, icon: <Moon className="h-4 w-4" /> },
                    { key: "parking" as const, label: copy.parking, icon: <Car className="h-4 w-4" /> },
                  ].map((item) => (
                    <button key={item.key} type="button" onClick={() => applyQuickFilter(item.key)} className={`amd-chip flex items-center gap-2 px-4 text-[11px] font-semibold ${quickFilter === item.key ? "amd-chip-active" : ""}`}>
                      {item.icon}{item.label}{quickFilter === item.key && <span className="h-2 w-2 rounded-full bg-[#00E5C3] shadow-[0_0_10px_rgba(0,229,195,.9)]" />}
                    </button>
                  ))}
                </div>
              </div>

              <section className="amd-hero-map mt-5 p-5 sm:min-h-[210px] sm:p-6">
                <MiniMapArtwork />
                <div className="relative z-10 max-w-[60%]">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(0,140,255,.28)] bg-[rgba(0,122,255,.12)] px-2.5 py-1 text-[9px] font-semibold text-[#b8ddff]"><Sparkles className="h-3 w-3" /> ค้นพบรอบหอ</div>
                  <h2 className="mt-4 text-[24px] font-bold leading-[1.08] tracking-[-0.04em] sm:text-[30px]"><span className="text-[#19E6FF]">ทุกที่รอบหอ</span><br />ครบ จบ ในแอปเดียว</h2>
                  <p className="mt-2 max-w-[230px] text-[11px] leading-5 text-[var(--amd-text-2)]">อัปเดตร้านใหม่ ข้อมูลจริง และทางลัดสำหรับชีวิตรอบหอ</p>
                  <button type="button" onClick={() => changeTab("map")} className="amd-btn mt-4 flex items-center gap-2 rounded-xl border border-[rgba(120,160,210,.28)] bg-[#08111f]/75 px-3.5 py-2.5 text-[10px] font-semibold"><MapIcon className="h-4 w-4 text-[#00D9FF]" /> ดูแผนที่รอบหอ <ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              </section>

              <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {RADII.slice(0, 4).map((radius) => <button key={radius.value} type="button" onClick={() => { setRadiusMeters(radius.value); setSettings((current) => ({ ...current, defaultRadius: radius.value })); }} className={`amd-chip shrink-0 px-4 text-[10px] font-semibold ${radiusMeters === radius.value ? "amd-chip-active" : ""}`}>{radius.label}</button>)}
                <button type="button" onClick={() => setFilterOpen(true)} className="amd-chip shrink-0 px-4 text-[10px] font-semibold">+ ตัวกรอง</button>
              </div>

              <div className="mt-7 flex items-center justify-between">
                <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[#149CFF]" /><h2 className="text-[20px] font-semibold">{copy.localPick}</h2></div>
                <button type="button" onClick={() => { setFilters({ ...EMPTY_FILTERS, localOnly: true }); setQuickFilter(null); }} className="text-[11px] font-semibold text-[#149CFF]">{copy.viewAll} <ChevronRight className="inline h-3.5 w-3.5" /></button>
              </div>

              <div className="mt-3 space-y-3">
                {loadingPlaces && !visiblePlaces.length ? <LoadingCards /> : (localPicks.length ? localPicks : visiblePlaces.slice(0, 4)).map((place) => <PlaceCard key={place.id} place={place} saved={isFavorite(place)} onSave={() => toggleFavorite(place)} onDetail={() => openDetail(place)} onMap={() => openMap(place)} language={settings.language} />)}
              </div>

              <div className="mt-7 flex items-center justify-between">
                <div className="flex items-center gap-2"><Utensils className="h-5 w-5 text-[#149CFF]" /><h2 className="text-[20px] font-semibold">{copy.nearby}</h2></div>
                <button type="button" onClick={() => setSortMode("distanceAsc")} className="text-[11px] font-semibold text-[#149CFF]">{copy.viewAll} <ChevronRight className="inline h-3.5 w-3.5" /></button>
              </div>

              <div className="mt-3 space-y-3">
                {nearbyPicks.map((place) => <PlaceCard key={`near-${place.id}`} place={place} saved={isFavorite(place)} onSave={() => toggleFavorite(place)} onDetail={() => openDetail(place)} onMap={() => openMap(place)} language={settings.language} />)}
                {!visiblePlaces.length && !loadingPlaces && <div className="amd-glass amd-card p-8 text-center"><Search className="mx-auto h-8 w-8 text-[var(--amd-text-3)]" /><p className="mt-3 text-[14px] font-semibold">ไม่พบร้านที่ตรงกับเงื่อนไข</p><button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setCategory("all"); setQuery(""); setQuickFilter(null); }} className="mt-3 text-[11px] font-semibold text-[#149CFF]">ล้างตัวกรอง</button></div>}
              </div>

              <button type="button" onClick={pickFoodNow} className="amd-btn amd-btn-primary mb-2 mt-6 flex w-full items-center justify-center gap-2 rounded-[16px] px-4 py-3 text-[12px] font-bold"><Utensils className="h-4 w-4" /> กินอะไรดีตอนนี้</button>
            </div>
          )}

          {tab === "map" && (
            <div className="amd-page">
              <PageHeader
                title={copy.map}
                subtitle={copy.mapSubtitle}
                right={<button type="button" onClick={originMode === "dorm" ? useMyLocation : useDormLocation} className="amd-chip flex max-w-[190px] items-center gap-2 px-3 text-[11px] font-semibold"><MapPin className="h-4 w-4 text-[#00D9FF]" /><span className="truncate">{originMode === "dorm" ? DORM_NAME : settings.language === "en" ? "My location" : "ตำแหน่งของฉัน"}</span><ChevronDown className="h-3.5 w-3.5" /></button>}
              />

              <div className="relative amd-input">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--amd-text-3)]" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchMap} className="h-14 w-full rounded-[20px] bg-transparent pl-12 pr-14 text-[13px] outline-none placeholder:text-[var(--amd-text-3)]" />
                <button type="button" onClick={() => setFilterOpen(true)} className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl border border-[rgba(120,160,210,.18)] bg-white/[0.035]"><SlidersHorizontal className="h-4 w-4" /></button>
              </div>

              <div className="-mx-4 mt-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0"><div className="flex w-max gap-2">
                {[{ id: "food" as const, label: "อาหาร", icon: <Utensils className="h-4 w-4" /> }, { id: "cafe" as const, label: "คาเฟ่", icon: <Coffee className="h-4 w-4" /> }, { id: "service" as const, label: "บริการ", icon: <BriefcaseBusiness className="h-4 w-4" /> }, { id: "parking" as const, label: "ที่จอดรถ", icon: <Car className="h-4 w-4" /> }].map((item) => <button key={item.id} type="button" onClick={() => setCategory(category === item.id ? "all" : item.id)} className={`amd-chip flex items-center gap-2 px-4 text-[11px] font-semibold ${category === item.id ? "amd-chip-active" : ""}`}>{item.icon}{item.label}</button>)}
                <button type="button" onClick={() => setFilterOpen(true)} className="amd-chip px-4 text-[18px]">•••</button>
              </div></div>

              <div className="relative mt-4 h-[58dvh] min-h-[450px] max-h-[720px] overflow-hidden rounded-[28px] border border-[rgba(0,140,255,.28)] bg-[#030812] shadow-[0_0_28px_rgba(0,122,255,.12)]">
                {apiReady ? <div ref={mapEl} className="absolute inset-0 bg-[#02060D]" /> : (
                  <div className="absolute inset-0 amd-hero-map rounded-none border-0">
                    <MiniMapArtwork />
                    <div className="absolute inset-0 grid place-items-center p-8 text-center"><div className="amd-glass amd-card max-w-[280px] p-5"><MapIcon className="mx-auto h-9 w-9 text-[#00D9FF]" /><p className="mt-3 text-[14px] font-semibold">Google Maps Preview</p><p className="mt-2 text-[10px] leading-5 text-[var(--amd-text-2)]">ตั้งค่า NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ใน Cloudflare เพื่อเปิดแผนที่สดและหมุดจริง</p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(DORM_NAME)}`} target="_blank" rel="noreferrer" className="amd-btn amd-btn-primary mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-bold"><Navigation className="h-4 w-4" /> เปิด Google Maps</a></div></div>
                  </div>
                )}

                <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2"><select aria-label="รัศมีแผนที่" value={radiusMeters} onChange={(event) => setRadiusMeters(Number(event.target.value))} className="amd-chip h-11 appearance-none bg-[#07111f]/90 px-5 pr-9 text-[12px] font-semibold text-white outline-none"><option value={250}>250 ม.</option><option value={500}>500 ม.</option><option value={1000}>1 กม.</option><option value={2000}>2 กม.</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" /></div>
                <button type="button" onClick={() => { mapRef.current?.setCenter(origin); setSelectedPlace(null); }} className="amd-glass absolute bottom-5 right-4 z-20 grid h-12 w-12 place-items-center rounded-full text-[#149CFF]"><LocateFixed className="h-5 w-5" /></button>

                {selectedPlace && <div className="amd-glass-strong absolute bottom-3 left-3 right-3 z-30 rounded-[24px] p-3.5"><div className="flex gap-3">{selectedPlace.coverImage || selectedPlace.image ? <img src={selectedPlace.coverImage || selectedPlace.image || ""} alt="" className="h-[104px] w-[104px] shrink-0 rounded-[16px] object-cover" /> : <div className="grid h-[104px] w-[104px] shrink-0 place-items-center rounded-[16px] bg-white/[0.04] text-4xl">{CATEGORY_MAP[selectedPlace.category]?.icon || "📍"}</div>}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="truncate text-[17px] font-bold">{selectedPlace.name}</h3>{selectedPlace.verified && <span className="rounded-md border border-[rgba(0,229,195,.25)] px-2 py-1 text-[8px] font-bold text-[#00E5C3]">VERIFIED</span>}</div><p className="mt-1 text-[10px] text-[var(--amd-text-2)]">{CATEGORY_MAP[selectedPlace.category]?.name} • {selectedPlace.area}</p><p className="mt-2 text-[11px]"><span className={getPlaceOpenStatus(selectedPlace).isOpen ? "text-[#00E5C3]" : "text-[var(--amd-text-3)]"}>{getPlaceOpenStatus(selectedPlace).label}</span>{getPlaceOpenStatus(selectedPlace).secondaryText ? ` • ${getPlaceOpenStatus(selectedPlace).secondaryText}` : ""}</p><p className="mt-1 text-[10px] text-[var(--amd-text-2)]">{formatDistance(selectedPlace.distanceKm)}{selectedPlace.rating != null ? ` • ★ ${selectedPlace.rating.toFixed(1)}` : ""}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => openDetail(selectedPlace)} className="amd-btn h-11 rounded-xl border border-[rgba(120,160,210,.22)] text-[10px] font-semibold">{copy.details}</button><a href={googleMapsDirectionsUrl(selectedPlace)} target="_blank" rel="noreferrer" className="amd-btn amd-btn-primary flex h-11 items-center justify-center gap-1.5 rounded-xl text-[10px] font-bold"><Navigation className="h-4 w-4" />{copy.navigate}</a></div></div></div></div>}
              </div>
            </div>
          )}

          {tab === "favorites" && (
            <div className="amd-page">
              <PageHeader title={copy.saved} subtitle={copy.savedSubtitle} right={<button type="button" onClick={createCollection} className="amd-chip flex items-center gap-2 px-3 text-[11px] font-semibold"><Plus className="h-4 w-4" /> เพิ่มรายการ</button>} />

              <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Grid2X2 className="h-5 w-5 text-[#149CFF]" /><h2 className="text-[19px] font-semibold">คอลเลกชันของฉัน</h2></div><button type="button" onClick={() => setSelectedCollection(null)} className="text-[11px] font-semibold text-[#149CFF]">ดูทั้งหมด <ChevronRight className="inline h-3.5 w-3.5" /></button></div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {collections.slice(0, 8).map((collection) => <button key={collection.id} type="button" onClick={() => setSelectedCollection(selectedCollection === collection.id ? null : collection.id)} className={`amd-glass amd-card min-h-[132px] p-4 text-left transition ${selectedCollection === collection.id ? "amd-card-selected" : ""}`}><span className="text-[28px]">{collection.icon}</span><p className="mt-4 text-[15px] font-semibold">{collection.title}</p><p className="mt-1 text-[12px] text-[var(--amd-text-2)]">{collection.placeIds.length} รายการ</p></button>)}
              </div>

              {selectedCollection && (() => { const collection = collections.find((item) => item.id === selectedCollection); return collection ? <div className="mt-3 flex items-center justify-end gap-2"><button type="button" onClick={() => renameCollection(collection)} className="amd-chip px-3 text-[10px]">เปลี่ยนชื่อ</button>{!["wishlist", "regular", "late", "work"].includes(collection.id) && <button type="button" onClick={() => deleteCollection(collection)} className="amd-chip flex items-center gap-1 px-3 text-[10px] text-rose-300"><Trash2 className="h-3.5 w-3.5" /> ลบ</button>}</div> : null; })()}

              <div className="mt-7 flex items-center gap-2"><Bookmark className="h-5 w-5 text-[#149CFF]" /><h2 className="text-[19px] font-semibold">บันทึกล่าสุด</h2></div>
              <div className="mt-3 space-y-3">
                {filteredFavoritePlaces.map((place) => <div key={place.id}><PlaceCard place={place} saved onSave={() => toggleFavorite(place)} onDetail={() => openDetail(place)} onMap={() => openMap(place)} language={settings.language} /><div className="mt-1 flex justify-end"><select aria-label="ย้ายคอลเลกชัน" value={collections.find((collection) => collection.placeIds.includes(place.id))?.id || "wishlist"} onChange={(event) => moveFavoriteToCollection(place, event.target.value)} className="h-9 rounded-xl border border-[rgba(120,160,210,.16)] bg-[#07111f] px-2 text-[9px] text-[var(--amd-text-2)] outline-none">{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}</select></div></div>)}
                {!filteredFavoritePlaces.length && <div className="amd-glass amd-card p-9 text-center"><Bookmark className="mx-auto h-8 w-8 text-[var(--amd-text-3)]" /><p className="mt-3 text-[14px] font-semibold">{copy.emptySaved}</p><button type="button" onClick={() => changeTab("explore")} className="mt-3 text-[11px] font-semibold text-[#149CFF]">สำรวจร้านรอบหอ</button></div>}
              </div>
            </div>
          )}

          {tab === "recent" && (
            <div className="amd-page">
              <PageHeader title={copy.recent} subtitle={copy.recentSubtitle} right={<button type="button" onClick={() => changeTab("map")} className="amd-glass grid h-12 w-12 place-items-center rounded-full text-[#149CFF]"><MapIcon className="h-5 w-5" /></button>} />

              <section className="amd-hero-map min-h-[164px] p-5">
                <MiniMapArtwork />
                <div className="relative z-10 max-w-[55%]"><p className="text-[14px] font-semibold">ดูล่าสุดวันนี้</p><div className="mt-4 flex items-end gap-4"><div><p className="text-[40px] font-semibold leading-none text-[#149CFF]">{recentPlaces.length}</p><p className="mt-1 text-[11px] text-[var(--amd-text-2)]">สถานที่</p></div><span className="pb-4 text-[var(--amd-text-3)]">•</span><div><p className="text-[40px] font-semibold leading-none text-[#49d8d1]">{recentCategoryCount}</p><p className="mt-1 text-[11px] text-[var(--amd-text-2)]">หมวดหมู่</p></div><span className="pb-4 text-[var(--amd-text-3)]">•</span><div><p className="text-[40px] font-semibold leading-none text-[#9B6CFF]">{recentAreaCount}</p><p className="mt-1 text-[11px] text-[var(--amd-text-2)]">ทำเล</p></div></div></div>
              </section>

              <div className="-mx-4 mt-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0"><div className="flex w-max gap-2">{[
                { key: "open" as const, label: copy.openNow, icon: <Sparkles className="h-4 w-4" /> },
                { key: "near" as const, label: copy.near, icon: <MapPin className="h-4 w-4" /> },
                { key: "cafe" as const, label: copy.cafe, icon: <Coffee className="h-4 w-4" /> },
                { key: "late" as const, label: copy.late, icon: <Moon className="h-4 w-4" /> },
                { key: "parking" as const, label: copy.parking, icon: <Car className="h-4 w-4" /> },
              ].map((item) => <button key={item.key} type="button" onClick={() => { applyQuickFilter(item.key); changeTab("explore"); }} className="amd-chip flex items-center gap-2 px-4 text-[11px] font-semibold">{item.icon}{item.label}</button>)}</div></div>

              <div className="mt-5 space-y-3">
                {recentPlaces.map((place) => <PlaceCard key={place.id} place={place} saved={isFavorite(place)} onSave={() => toggleFavorite(place)} onDetail={() => openDetail(place)} onMap={() => openMap(place)} contextMeta={relativeViewedLabel(recentMeta[place.id], settings.language)} language={settings.language} />)}
                {!recentPlaces.length && <div className="amd-glass amd-card p-9 text-center"><History className="mx-auto h-8 w-8 text-[var(--amd-text-3)]" /><p className="mt-3 text-[14px] font-semibold">{copy.emptyRecent}</p></div>}
              </div>

              <button type="button" onClick={() => changeTab("map")} className="amd-glass amd-card mt-4 flex w-full items-center gap-3 p-3 text-left"><div className="grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-[radial-gradient(circle_at_center,rgba(0,140,255,.28),transparent_35%),linear-gradient(145deg,#0a1b31,#030812)]"><LocateFixed className="h-5 w-5 text-[#00D9FF]" /></div><div className="min-w-0 flex-1"><p className="text-[12px] font-semibold">ตำแหน่งของคุณ</p><p className="mt-1 truncate text-[10px] text-[var(--amd-text-3)]">{originMode === "dorm" ? DORM_NAME : "ตำแหน่งปัจจุบัน"} • รัศมี {RADII.find((radius) => radius.value === radiusMeters)?.label || `${radiusMeters} ม.`}</p></div><span className="flex items-center gap-1 text-[10px] font-semibold text-[#149CFF]"><MapIcon className="h-4 w-4" /> ดูบนแผนที่</span></button>
            </div>
          )}

          {tab === "settings" && (
            <div className="amd-page">
              <PageHeader title={copy.settings} subtitle={copy.settingsSubtitle} />

              <section className="amd-glass amd-card-selected amd-card flex items-center gap-4 p-4">
                <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full border border-[#00D9FF] bg-[radial-gradient(circle,rgba(0,122,255,.42),rgba(0,122,255,.08)_58%,transparent_60%)] shadow-[0_0_26px_rgba(0,122,255,.32)]"><UserRound className="h-8 w-8 text-white" /></div>
                <div className="min-w-0 flex-1"><p className="text-[21px] font-semibold">Meka</p><span className="mt-1 inline-flex rounded-md border border-[rgba(0,229,195,.28)] px-2 py-1 text-[9px] font-bold text-[#00E5C3]">LOCAL EXPLORER</span><p className="mt-2 truncate text-[11px] text-[var(--amd-text-2)]">📍 {DORM_NAME}</p></div><ChevronRight className="h-5 w-5 text-[var(--amd-text-2)]" />
              </section>

              <section className="amd-glass amd-card mt-4 px-4">
                <SettingRow icon={<MapPin className="h-5 w-5" />} title="ตำแหน่งเริ่มต้น" subtitle="ใช้เพื่อแนะนำที่รอบหอ" action={<button type="button" onClick={originMode === "dorm" ? useMyLocation : useDormLocation} className="amd-chip flex max-w-[168px] items-center gap-2 px-3 text-[10px] font-semibold text-[#149CFF]"><MapPin className="h-3.5 w-3.5" /><span className="truncate">{originMode === "dorm" ? DORM_NAME : "ตำแหน่งของฉัน"}</span><ChevronDown className="h-3.5 w-3.5" /></button>} />
                <div className="py-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center text-[#00D9FF]"><LocateFixed className="h-5 w-5" /></div><div><p className="text-[14px] font-semibold">รัศมีค้นหาที่แนะนำ</p><p className="mt-0.5 text-[11px] text-[var(--amd-text-3)]">กำหนดระยะรอบหอที่ต้องการค้นหา</p></div></div><div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{RADII.slice(0, 4).map((radius) => <button key={radius.value} type="button" onClick={() => { setRadiusMeters(radius.value); setSettings((current) => ({ ...current, defaultRadius: radius.value })); }} className={`amd-chip shrink-0 px-4 text-[10px] font-semibold ${settings.defaultRadius === radius.value ? "amd-chip-active" : ""}`}>{radius.label}</button>)}</div></div>
              </section>

              <section className="amd-glass amd-card mt-4 px-4">
                <SettingRow icon={<Bell className="h-5 w-5" />} title="การแจ้งเตือน" subtitle="รับการแจ้งเตือนร้านใหม่ โปรโมชั่น และที่จอดรถ" action={<Toggle active={settings.notifications} onChange={() => setSettings((current) => ({ ...current, notifications: !current.notifications }))} />} />
                <SettingRow icon={<BellRing className="h-5 w-5" />} title="แจ้งเตือนร้านใหม่" subtitle="เมื่อมีร้านใหม่ในพื้นที่ที่คุณสนใจ" action={<Toggle active={settings.newPlaceAlerts} onChange={() => setSettings((current) => ({ ...current, newPlaceAlerts: !current.newPlaceAlerts }))} />} />
                <SettingRow icon={<Tag className="h-5 w-5" />} title="แจ้งเตือนโปรโมชั่น" subtitle="ส่วนลด คูปอง และดีลพิเศษใกล้หอ" action={<Toggle active={settings.promoAlerts} onChange={() => setSettings((current) => ({ ...current, promoAlerts: !current.promoAlerts }))} />} />
                <SettingRow icon={<Car className="h-5 w-5" />} title="แจ้งเตือนที่จอดรถ" subtitle="การเปลี่ยนแปลงข้อมูลที่จอดรถใกล้หอ" action={<Toggle active={settings.parkingAlerts} onChange={() => setSettings((current) => ({ ...current, parkingAlerts: !current.parkingAlerts }))} />} />
              </section>

              <section className="amd-glass amd-card mt-4 px-4">
                <div className="py-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center text-[#00D9FF]"><Palette className="h-5 w-5" /></div><div><p className="text-[14px] font-semibold">ธีมแอป</p><p className="mt-0.5 text-[11px] text-[var(--amd-text-3)]">เลือกโหมดการแสดงผล</p></div></div><div className="mt-3 grid grid-cols-3 gap-2">{(["light", "dark", "system"] as ThemeMode[]).map((theme) => <button key={theme} type="button" onClick={() => setSettings((current) => ({ ...current, theme }))} className={`amd-chip px-3 text-[10px] font-semibold ${settings.theme === theme ? "amd-chip-active" : ""}`}>{theme === "light" ? "สว่าง" : theme === "dark" ? "มืด" : "ตามระบบ"}</button>)}</div></div>
                <SettingRow icon={<Grid2X2 className="h-5 w-5" />} title="หมวดหมู่ที่สนใจ" subtitle="เลือกหมวดที่คุณอยากเห็นเป็นพิเศษ" action={<button type="button" onClick={() => setFilterOpen(true)} className="flex items-center gap-1 text-[11px] font-semibold text-[#149CFF]">จัดการหมวดหมู่ <ChevronRight className="h-4 w-4" /></button>} />
                <SettingRow icon={<BadgeCheck className="h-5 w-5" />} title="แสดงเฉพาะร้านที่ยืนยันแล้ว" subtitle="มีผลกับ Explore, Map, Search และคำแนะนำ" action={<Toggle active={settings.verifiedOnly} onChange={() => setSettings((current) => ({ ...current, verifiedOnly: !current.verifiedOnly }))} />} />
                <SettingRow icon={<Languages className="h-5 w-5" />} title="ภาษา (Language)" subtitle="เปลี่ยนภาษาหลักของแอป" action={<div className="flex gap-1"><button type="button" onClick={() => setSettings((current) => ({ ...current, language: "th" }))} className={`amd-chip h-9 min-h-0 px-3 text-[10px] ${settings.language === "th" ? "amd-chip-active" : ""}`}>ไทย</button><button type="button" onClick={() => setSettings((current) => ({ ...current, language: "en" }))} className={`amd-chip h-9 min-h-0 px-3 text-[10px] ${settings.language === "en" ? "amd-chip-active" : ""}`}>EN</button></div>} />
              </section>

              <section className="amd-glass amd-card mt-4 px-4">
                <SettingRow icon={<HelpCircle className="h-5 w-5" />} title="ศูนย์ช่วยเหลือ" subtitle="FAQ และการติดต่อทีมงาน" action={<ChevronRight className="h-5 w-5 text-[var(--amd-text-2)]" />} />
                <SettingRow icon={<Info className="h-5 w-5" />} title="เกี่ยวกับ Around My Dorm" subtitle="ข้อมูลแอป นโยบายความเป็นส่วนตัว และข้อกำหนด" action={<ChevronRight className="h-5 w-5 text-[var(--amd-text-2)]" />} />
              </section>

              <section className="amd-glass amd-card mt-4 overflow-hidden"><div className="grid grid-cols-[1.1fr_1fr_1fr] divide-x divide-[rgba(120,160,210,.11)]"><div className="p-4"><p className="text-[10px] text-[var(--amd-text-3)]">ร้านที่บันทึก</p><p className="mt-1 text-[24px] font-semibold">{favorites.length}</p></div><div className="p-4"><p className="text-[10px] text-[var(--amd-text-3)]">ดูล่าสุด</p><p className="mt-1 text-[24px] font-semibold">{recentPlaces.length}</p></div><div className="p-4"><p className="text-[10px] text-[var(--amd-text-3)]">ข้อมูลร้าน</p><p className="mt-1 text-[24px] font-semibold">{allPlaces.length}</p></div></div><div className="border-t border-[rgba(120,160,210,.11)] px-4 py-3 text-right text-[10px] text-[var(--amd-text-3)]">Around My Dorm • v2.1.0</div></section>
            </div>
          )}
        </div>

        <nav className="amd-nav">
          <div className="grid h-full grid-cols-5 px-1">
            {navItems.map((item) => {
              const active = tab === item.id;
              return <button key={item.id} type="button" onClick={() => changeTab(item.id)} className={`relative flex min-w-0 flex-col items-center justify-center gap-1 text-[9px] font-semibold transition ${active ? "amd-nav-active" : "text-[var(--amd-text-3)]"}`}>{active && <span className="absolute top-0 h-[2px] w-8 rounded-full bg-[#19E6FF] shadow-[0_0_16px_rgba(25,230,255,.95)]" />}<item.icon className={`h-[22px] w-[22px] ${active ? "drop-shadow-[0_0_9px_rgba(0,217,255,.65)]" : ""}`} /><span className="truncate">{item.label}</span></button>;
            })}
          </div>
        </nav>
      </div>

      {filterOpen && <FilterSheet value={filters} onChange={setFilters} onClose={() => setFilterOpen(false)} />}
      {detailPlace && <PlaceDetail place={detailPlace} saved={isFavorite(detailPlace)} onClose={() => setDetailPlace(null)} onSave={() => toggleFavorite(detailPlace)} onMap={() => { setDetailPlace(null); openMap(detailPlace); }} />}
    </main>
  );
}
