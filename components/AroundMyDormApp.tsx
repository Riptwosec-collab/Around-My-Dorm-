"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Database,
  Filter,
  Heart,
  History,
  Home,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Navigation,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Star,
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
  getOpenStatus,
  googleMapsDirectionsUrl,
  matchesSearch,
  normalizeText,
  withDistance,
} from "@/lib/place-utils";
import type { CategoryId, Place, SortMode } from "@/types/place";

type Tab = "explore" | "map" | "favorites" | "recent" | "settings";
type OriginMode = "dorm" | "me";

const RADII = [
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

const MARKER_COLORS: Record<string, string> = {
  food: "#fb7185",
  local_food: "#f97316",
  noodle: "#f59e0b",
  thai_food: "#eab308",
  isan_food: "#ef4444",
  mookata: "#f43f5e",
  japanese: "#a78bfa",
  cafe: "#c084fc",
  bar: "#818cf8",
  convenience: "#34d399",
  supermarket: "#22c55e",
  pharmacy: "#38bdf8",
  laundry: "#22d3ee",
  salon: "#f472b6",
  fitness: "#60a5fa",
  service: "#94a3b8",
  parking: "#2dd4bf",
  other: "#94a3b8",
};

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: "recommended", label: "แนะนำ" },
  { id: "distanceAsc", label: "ใกล้ที่สุด" },
  { id: "distanceDesc", label: "ไกลที่สุด" },
  { id: "rating", label: "Rating สูงสุด" },
  { id: "reviews", label: "รีวิวเยอะ" },
  { id: "price", label: "ราคาถูก" },
  { id: "openNow", label: "เปิดอยู่" },
  { id: "local", label: "ร้าน Local" },
  { id: "late", label: "เปิดดึก" },
];

const SMART_COLLECTIONS = [
  ["🍚", "กินง่ายทุกวัน", "local"],
  ["☕", "คาเฟ่น่านั่ง", "cafe"],
  ["🌙", "ของกินดึก", "late"],
  ["💸", "ร้านประหยัด", "cheap"],
  ["⭐", "ร้านคะแนนดี", "rating"],
  ["📍", "ใกล้หอที่สุด", "near"],
  ["🧑‍🎓", "เหมาะกับนักศึกษา", "student"],
  ["💻", "นั่งทำงานได้", "work"],
  ["🛒", "ซื้อของเข้าห้อง", "shopping"],
  ["💊", "สุขภาพและยา", "pharmacy"],
  ["🧺", "ซักผ้า", "laundry"],
  ["🏋️", "Fitness", "fitness"],
  ["🚗", "ที่จอดรถ", "parking"],
] as const;

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
    Object.entries(filters).filter(([key, value]) => key !== "priceLevels" && value === true).length +
    (filters.priceLevels.length ? 1 : 0)
  );
}

function passesFilters(place: Place, filters: FilterState) {
  const status = getOpenStatus(place);
  if (filters.onlyOpen && status.isOpen !== true) return false;
  if (filters.only24Hours && !place.is24Hours) return false;
  if (filters.openLate && place.openLate !== true) return false;
  if (filters.parking && place.parking.available !== true) return false;
  if (filters.wifi && place.wifi !== true) return false;
  if (filters.powerOutlet && place.powerOutlet !== true) return false;
  if (filters.airConditioned && place.airConditioned !== true) return false;
  if (filters.delivery && place.delivery !== true) return false;
  if (filters.takeaway && place.takeaway !== true) return false;
  if (filters.goodForWorking && place.goodForWorking !== true) return false;
  if (filters.studentFriendly && place.studentFriendly !== true) return false;
  if (filters.verifiedOnly && !place.verified) return false;
  if (filters.priceLevels.length && (place.priceLevel == null || !filters.priceLevels.includes(place.priceLevel))) return false;
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
    if (mode === "price") return (a.priceLevel ?? 99) - (b.priceLevel ?? 99);
    if (mode === "openNow") return Number(getOpenStatus(b).isOpen === true) - Number(getOpenStatus(a).isOpen === true);
    if (mode === "local") return Number(b.localFavorite) - Number(a.localFavorite);
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

export function AroundMyDormApp({ initialTab = "explore" }: { initialTab?: Tab }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState<"all" | CategoryId>("all");
  const [radiusMeters, setRadiusMeters] = useState(2000);
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
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
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("around-dorm-favorites-v2") || "[]") as Place[];
      const viewed = JSON.parse(localStorage.getItem("around-dorm-recent-v2") || "[]") as Place[];
      setFavorites(Array.isArray(saved) ? saved : []);
      setRecent(Array.isArray(viewed) ? viewed.slice(0, 10) : []);
    } catch {}
  }, []);

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
            language: "th",
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
            language: "th",
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
  }, [apiReady, category, debouncedQuery, radiusMeters, origin.lat, origin.lng]);

  const allPlaces = useMemo(() => {
    const merged = mergeSeedAndLive(PLACES, livePlaces);
    return merged.map((place) => withDistance(place, origin));
  }, [livePlaces, origin]);

  const visiblePlaces = useMemo(() => {
    const data = allPlaces.filter((place) => {
      if (category !== "all" && !place.categories.includes(category)) return false;
      if (!matchesSearch(place, debouncedQuery)) return false;
      if (!passesFilters(place, filters)) return false;
      if (place.distanceKm != null && place.distanceKm * 1000 > radiusMeters) return false;
      if (originMode === "me" && place.distanceKm == null) return false;
      return true;
    });
    return sortPlaces(data, sortMode);
  }, [allPlaces, category, debouncedQuery, filters, radiusMeters, originMode, sortMode]);

  const favoritePlaces = useMemo(() => {
    return favorites.map((saved) => allPlaces.find((place) => place.id === saved.id || (saved.googlePlaceId && place.googlePlaceId === saved.googlePlaceId)) || saved);
  }, [favorites, allPlaces]);

  const recentPlaces = useMemo(() => {
    return recent.map((saved) => allPlaces.find((place) => place.id === saved.id || (saved.googlePlaceId && place.googlePlaceId === saved.googlePlaceId)) || saved);
  }, [recent, allPlaces]);

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
      return next;
    });
  }

  function addRecent(place: Place) {
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
    }
  }

  function openMap(place: Place) {
    addRecent(place);
    setSelectedPlace(place);
    changeTab("map");
    setSelectedPlace(place);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationError("อุปกรณ์นี้ไม่รองรับ Location");
      return;
    }
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude });
        setOriginMode("me");
      },
      () => setLocationError("ไม่สามารถเข้าถึงตำแหน่งได้ กรุณาอนุญาต Location ใน Safari/Browser"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  function useDormLocation() {
    setOrigin(DORM_CENTER);
    setOriginMode("dorm");
    setLocationError(null);
  }

  function applyCollection(key: (typeof SMART_COLLECTIONS)[number][2]) {
    setFilters(EMPTY_FILTERS);
    setQuery("");
    setSortMode("recommended");
    if (key === "local") setCategory("local_food");
    if (key === "cafe") setCategory("cafe");
    if (key === "late") setFilters({ ...EMPTY_FILTERS, openLate: true });
    if (key === "cheap") setFilters({ ...EMPTY_FILTERS, priceLevels: [1] });
    if (key === "rating") setSortMode("rating");
    if (key === "near") setSortMode("distanceAsc");
    if (key === "student") setFilters({ ...EMPTY_FILTERS, studentFriendly: true });
    if (key === "work") setFilters({ ...EMPTY_FILTERS, goodForWorking: true });
    if (key === "shopping") setCategory("supermarket");
    if (key === "pharmacy") setCategory("pharmacy");
    if (key === "laundry") setCategory("laundry");
    if (key === "fitness") setCategory("fitness");
    if (key === "parking") setCategory("parking");
    changeTab("explore");
  }

  useEffect(() => {
    if (tab !== "map" || !apiReady || !mapEl.current) return;
    let cancelled = false;

    void (async () => {
      await window.google.maps.importLibrary("maps");
      const markerLib = await window.google.maps.importLibrary("marker");
      if (cancelled || !mapEl.current) return;

      if (!mapRef.current) {
        mapRef.current = new window.google.maps.Map(mapEl.current, {
          center: origin,
          zoom: 14,
          mapId: "DEMO_MAP_ID",
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
      }

      const target = selectedPlace?.latitude != null && selectedPlace.longitude != null
        ? { lat: selectedPlace.latitude, lng: selectedPlace.longitude }
        : origin;
      mapRef.current.setCenter(target);
      mapRef.current.setZoom(selectedPlace?.latitude != null ? 17 : radiusMeters <= 1000 ? 15 : radiusMeters <= 3000 ? 14 : 13);

      markersRef.current.forEach((marker) => {
        marker.map = null;
      });
      markersRef.current = [];

      const originPin = new markerLib.PinElement({ background: "#22d3ee", borderColor: "#ffffff", glyphColor: "#031018" });
      markersRef.current.push(new markerLib.AdvancedMarkerElement({ map: mapRef.current, position: origin, title: originMode === "dorm" ? DORM_NAME : "ตำแหน่งของฉัน", content: originPin.element }));

      visiblePlaces.slice(0, 50).forEach((place) => {
        if (place.latitude == null || place.longitude == null) return;
        const pin = new markerLib.PinElement({
          background: selectedPlace?.id === place.id ? "#ffffff" : MARKER_COLORS[place.category] || "#94a3b8",
          borderColor: "#e2e8f0",
          glyphColor: selectedPlace?.id === place.id ? "#0f172a" : "#ffffff",
          scale: selectedPlace?.id === place.id ? 1.15 : 0.9,
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

  const nearbyCounts = RADII.slice(0, 3).map((radius) => ({
    ...radius,
    count: allPlaces.filter((place) => place.distanceKm != null && place.distanceKm * 1000 <= radius.value).length,
  }));

  const navItems = [
    { id: "explore" as Tab, label: "สำรวจ", icon: Home },
    { id: "map" as Tab, label: "แผนที่", icon: MapIcon },
    { id: "favorites" as Tab, label: "บันทึก", icon: Bookmark },
    { id: "recent" as Tab, label: "ดูล่าสุด", icon: History },
    { id: "settings" as Tab, label: "ตั้งค่า", icon: Settings },
  ];

  const filtersCount = activeFilterCount(filters);

  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-[#050812] text-white selection:bg-cyan-300/30">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-20 h-72 w-72 rounded-full bg-cyan-400/[0.08] blur-[110px]" />
        <div className="absolute right-[-120px] top-52 h-80 w-80 rounded-full bg-indigo-500/[0.08] blur-[120px]" />
      </div>

      <div className="relative mx-auto min-h-[100dvh] w-full max-w-[1180px] border-x border-white/[0.025] bg-[#07101b]/35">
        <div className="pb-[calc(92px+env(safe-area-inset-bottom))]">
          {tab === "explore" && (
            <>
              <header className="px-4 pt-[max(22px,env(safe-area-inset-top))] sm:px-6 lg:px-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/85"><span>PREMIUM LOCAL DISCOVERY</span><span className="h-1 w-1 rounded-full bg-cyan-300" /></div>
                    <h1 className="text-[29px] font-black tracking-[-0.045em] sm:text-4xl">Around My Dorm</h1>
                    <p className="mt-1 text-[11px] text-white/42 sm:text-xs">กิน • ช้อป • คาเฟ่ • บริการ รอบบ้านสุภา</p>
                  </div>
                  <button type="button" onClick={() => changeTab("map")} className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] border border-white/10 bg-white/[0.055] backdrop-blur-2xl"><MapIcon className="h-5 w-5 text-cyan-200" /></button>
                </div>

                <div className="mt-5 flex items-center gap-3 rounded-[22px] border border-white/[0.08] bg-white/[0.045] p-3.5 backdrop-blur-2xl">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-pink-300/15 bg-pink-400/[0.08]"><MapPin className="h-[18px] w-[18px] text-pink-300" /></div>
                  <div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/30">ORIGIN</p><p className="truncate text-[12px] font-black">{originMode === "dorm" ? DORM_NAME : "ตำแหน่งปัจจุบันของฉัน"}</p></div>
                  {originMode === "dorm" ? <button type="button" onClick={useMyLocation} className="min-h-11 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.07] px-3 text-[9px] font-black text-cyan-200">ใกล้ฉัน</button> : <button type="button" onClick={useDormLocation} className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.05] px-3 text-[9px] font-black">กลับบ้านสุภา</button>}
                </div>
                {locationError && <p className="mt-2 text-[10px] text-rose-300">{locationError}</p>}
              </header>

              <div className="sticky top-0 z-30 mt-4 border-y border-white/[0.04] bg-[#07101b]/86 px-4 py-3 backdrop-blur-2xl sm:px-6 lg:px-8">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/30" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อร้าน หมวด เมนู Tag ซอย พื้นที่..." className="h-14 w-full rounded-[19px] border border-white/[0.08] bg-white/[0.05] pl-12 pr-14 text-[12px] font-medium outline-none placeholder:text-white/25 focus:border-cyan-300/35 focus:ring-4 focus:ring-cyan-300/[0.04]" />
                  <button type="button" onClick={() => setFilterOpen(true)} className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-[14px] border border-cyan-300/15 bg-cyan-300/[0.08]"><SlidersHorizontal className="h-[17px] w-[17px] text-cyan-200" />{filtersCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-pink-500 px-1 text-[8px] font-black">{filtersCount}</span>}</button>
                </div>
              </div>

              <section className="px-4 sm:px-6 lg:px-8">
                <div className="-mx-4 overflow-x-auto px-4 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"><div className="flex w-max gap-2">{CATEGORIES.map((item) => <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`min-h-11 shrink-0 rounded-full border px-3.5 text-[10px] font-black ${category === item.id ? "border-cyan-300/30 bg-cyan-300 text-[#041018]" : "border-white/[0.08] bg-white/[0.04] text-white/58"}`}><span className="mr-1.5">{item.icon}</span>{item.name}</button>)}</div></div>

                <div className="-mx-4 overflow-x-auto px-4 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"><div className="flex w-max gap-2">{RADII.map((radius) => <button key={radius.value} type="button" onClick={() => setRadiusMeters(radius.value)} className={`min-h-11 rounded-full border px-4 text-[10px] font-black ${radiusMeters === radius.value ? "border-white/15 bg-white/12 text-white" : "border-white/[0.07] bg-white/[0.03] text-white/42"}`}>{radius.label}</button>)}</div></div>

                <div className="mt-6">
                  <div className="flex items-end justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-pink-300">SMART COLLECTIONS</p><h2 className="mt-1 text-lg font-black">เลือกตามชีวิตรอบหอ</h2></div></div>
                  <div className="-mx-4 mt-3 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6"><div className="flex w-max gap-2">{SMART_COLLECTIONS.map(([icon, label, key]) => <button key={key} type="button" onClick={() => applyCollection(key)} className="min-h-11 rounded-2xl border border-white/[0.07] bg-white/[0.04] px-3 text-[10px] font-bold text-white/62"><span className="mr-1.5">{icon}</span>{label}</button>)}</div></div>
                </div>

                <div className="mt-6 rounded-[24px] border border-white/[0.07] bg-white/[0.035] p-4">
                  <div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-300">ใกล้บ้านสุภา</p><p className="mt-1 text-xs text-white/45">นับเฉพาะร้านที่มีพิกัดยืนยัน/Google Places</p></div><LocateFixed className="h-5 w-5 text-cyan-300/70" /></div>
                  <div className="mt-3 grid grid-cols-3 gap-2">{nearbyCounts.map((item) => <button key={item.value} type="button" onClick={() => { setRadiusMeters(item.value); setSortMode("distanceAsc"); }} className="rounded-2xl border border-white/[0.07] bg-black/10 p-3 text-left"><p className="text-[10px] font-bold text-white/45">{item.label}</p><p className="mt-1 text-xl font-black">{item.count}</p><p className="text-[8px] text-white/28">ร้าน</p></button>)}</div>
                </div>

                <div className="mb-4 mt-7 flex flex-wrap items-end justify-between gap-3">
                  <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-pink-300">DISCOVER</p><h2 className="mt-1 text-[20px] font-black">ร้านและสถานที่รอบหอ</h2><p className="mt-1 text-[10px] text-white/36">พบ {visiblePlaces.length} รายการ • {apiReady ? "Google Places Live + Seed Data" : "Seed Data • Maps Preview"}</p></div>
                  <div className="flex gap-2"><button type="button" onClick={() => setFilterOpen(true)} className="flex min-h-11 items-center gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 text-[10px] font-bold text-white/55"><Filter className="h-3.5 w-3.5" />กรอง</button><select aria-label="เรียงร้าน" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="min-h-11 rounded-2xl border border-white/[0.08] bg-[#0c1522] px-3 text-[10px] font-bold text-white/70 outline-none">{SORT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
                </div>

                {loadingPlaces && <div className="mb-4 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.05] p-3 text-center text-[10px] text-cyan-100">กำลังค้นหาข้อมูลสดจาก Google Places...</div>}
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visiblePlaces.map((place) => <PlaceCard key={place.id} place={place} saved={isFavorite(place)} onSave={() => toggleFavorite(place)} onDetail={() => openDetail(place)} onMap={() => openMap(place)} />)}</div>
                {!visiblePlaces.length && <div className="mt-8 rounded-[26px] border border-dashed border-white/10 p-8 text-center"><Search className="mx-auto h-7 w-7 text-white/22" /><p className="mt-3 text-sm font-bold">ไม่พบร้านตามเงื่อนไข</p><p className="mt-1 text-[10px] text-white/38">ลองเพิ่มรัศมี เปลี่ยนหมวด หรือล้าง Filter</p></div>}
              </section>
            </>
          )}

          {tab === "map" && (
            <section className="relative h-[calc(100dvh-78px-env(safe-area-inset-bottom))] overflow-hidden">
              {apiReady ? <div ref={mapEl} className="absolute inset-0" /> : <div className="absolute inset-0 grid place-items-center bg-[#07101b] px-7 text-center"><div><MapIcon className="mx-auto h-10 w-10 text-cyan-300/65" /><h2 className="mt-4 text-xl font-black">Google Maps Preview</h2><p className="mt-2 text-xs leading-5 text-white/42">เพิ่ม NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ใน Cloudflare Build Variables เพื่อเปิดแผนที่สดและ Google Places</p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(DORM_NAME)}`} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-11 items-center rounded-2xl bg-cyan-300 px-4 text-xs font-black text-[#031018]">เปิด Google Maps</a></div></div>}
              <div className="absolute left-0 right-0 top-0 z-20 px-4 pt-[max(14px,env(safe-area-inset-top))] sm:px-6"><div className="flex items-center justify-between rounded-[22px] border border-white/10 bg-[#07101b]/82 p-3 shadow-xl backdrop-blur-2xl"><div><p className="text-[9px] font-black tracking-[0.15em] text-cyan-300">LIVE MAP</p><p className="mt-0.5 text-[12px] font-black">{originMode === "dorm" ? DORM_NAME : "ตำแหน่งของฉัน"}</p><p className="mt-0.5 text-[9px] text-white/35">Marker แยกสีตามหมวด • สูงสุด 50 จุด</p></div><button type="button" onClick={() => { setSelectedPlace(null); mapRef.current?.setCenter(origin); }} className="grid h-11 w-11 place-items-center rounded-2xl bg-white/[0.07]"><LocateFixed className="h-4 w-4 text-cyan-200" /></button></div></div>
              {selectedPlace && <div className="absolute bottom-4 left-4 right-4 z-20 mx-auto max-w-[520px] rounded-[24px] border border-white/10 bg-[#07101b]/90 p-4 shadow-2xl backdrop-blur-2xl"><div className="flex gap-3">{selectedPlace.image ? <img src={selectedPlace.image} alt="" className="h-20 w-20 rounded-[18px] object-cover" /> : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[18px] bg-white/[0.06] text-3xl">{CATEGORY_MAP[selectedPlace.category]?.icon || "📍"}</div>}<div className="min-w-0 flex-1"><p className="text-[9px] font-bold text-cyan-200">{CATEGORY_MAP[selectedPlace.category]?.name}</p><h3 className="mt-1 truncate text-[14px] font-black">{selectedPlace.name}</h3><p className="mt-1 text-[10px] text-white/42">{formatDistance(selectedPlace.distanceKm)} {selectedPlace.rating != null ? `• ★ ${selectedPlace.rating.toFixed(1)}` : ""}</p><div className="mt-2 flex gap-3"><button type="button" onClick={() => openDetail(selectedPlace)} className="text-[10px] font-black text-cyan-200">ดูรายละเอียด</button><a href={googleMapsDirectionsUrl(selectedPlace)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] font-black text-white/70"><Navigation className="h-3 w-3" />นำทาง</a></div></div></div></div>}
            </section>
          )}

          {tab === "favorites" && <ListPage title="ร้านที่บันทึก" eyebrow="FAVORITES" description={`เก็บไว้ในเครื่องนี้ • ${favoritePlaces.length} ร้าน`} places={favoritePlaces} empty="ยังไม่มีร้านที่บันทึก" icon={<Heart className="h-8 w-8 text-white/22" />} isFavorite={isFavorite} onSave={toggleFavorite} onDetail={openDetail} onMap={openMap} />}
          {tab === "recent" && <ListPage title="ดูล่าสุด" eyebrow="RECENTLY VIEWED" description="เก็บ 10 ร้านล่าสุดโดยไม่ต้อง Login" places={recentPlaces} empty="ยังไม่มีประวัติการเปิดร้าน" icon={<History className="h-8 w-8 text-white/22" />} isFavorite={isFavorite} onSave={toggleFavorite} onDetail={openDetail} onMap={openMap} />}

          {tab === "settings" && (
            <section className="px-4 pt-[max(22px,env(safe-area-inset-top))] sm:px-6 lg:px-8">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">APP & DATA</p><h2 className="mt-1 text-[29px] font-black tracking-[-0.04em]">ตั้งค่าและข้อมูล</h2><p className="mt-1 text-[11px] text-white/42">เน้นข้อมูลจริง ไม่เดาราคา เวลา Rating เบอร์ หรือพิกัด</p>
              <div className="mt-6 grid gap-3 md:grid-cols-2">{[["ศูนย์กลาง", originMode === "dorm" ? DORM_NAME : "ตำแหน่งของฉัน"], ["รัศมี", RADII.find((item) => item.value === radiusMeters)?.label || "2 กม."], ["Initial dataset", `${PLACES.length} สถานที่`], ["Google Places", apiReady ? "Connected" : "Preview mode"], ["Favorite", `${favorites.length} ร้าน`], ["Recently viewed", `${recent.length}/10 ร้าน`]].map(([title, value]) => <div key={title} className="flex min-h-16 items-center justify-between rounded-[21px] border border-white/[0.07] bg-white/[0.04] p-4"><span className="text-[11px] text-white/45">{title}</span><span className="text-[11px] font-black text-white/85">{value}</span></div>)}</div>
              <div className="mt-5 rounded-[24px] border border-amber-300/12 bg-amber-300/[0.045] p-4"><div className="flex items-center gap-2"><Database className="h-4 w-4 text-amber-200" /><p className="text-[11px] font-black">Data Quality Policy</p></div><p className="mt-2 text-[10px] leading-5 text-white/45">Seed Data ที่ยังไม่มีแหล่งภายนอกยืนยันจะมี verified=false และแสดง “ยังไม่มีข้อมูลยืนยัน” แทนการคาดเดา เมื่อ Google Places พบรายการเดียวกัน ระบบจะเติมพิกัด Rating รีวิว ที่อยู่ และสถานะเปิด/ปิดจากข้อมูลสด</p></div>
              <div className="mt-4 rounded-[24px] border border-cyan-300/12 bg-cyan-300/[0.045] p-4"><p className="text-[11px] font-black text-cyan-100">iPhone 16 Pro Optimized</p><p className="mt-1 text-[10px] leading-5 text-white/44">Safe Area • Dynamic Island • 100dvh • Touch target ≥44px • ไม่มี horizontal overflow ของหน้า • รองรับ Tablet/Desktop grid</p></div>
            </section>
          )}
        </div>

        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.07] bg-[#07101b]/88 pb-[env(safe-area-inset-bottom)] backdrop-blur-[28px]"><div className="mx-auto grid h-[78px] max-w-[1180px] grid-cols-5 px-2 sm:px-6">{navItems.map((item) => { const active = tab === item.id; return <button key={item.id} type="button" onClick={() => changeTab(item.id)} className="relative flex min-w-0 flex-col items-center justify-center gap-1">{active && <span className="absolute top-1 h-[2px] w-7 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,.7)]" />}<item.icon className={`h-[21px] w-[21px] ${active ? "text-cyan-200" : "text-white/28"}`} /><span className={`truncate text-[8px] font-black sm:text-[9px] ${active ? "text-cyan-200" : "text-white/28"}`}>{item.label}</span></button>; })}</div></nav>
      </div>

      {filterOpen && <FilterSheet value={filters} onChange={setFilters} onClose={() => setFilterOpen(false)} />}
      {detailPlace && <PlaceDetail place={detailPlace} saved={isFavorite(detailPlace)} onClose={() => setDetailPlace(null)} onSave={() => toggleFavorite(detailPlace)} onMap={() => { setDetailPlace(null); openMap(detailPlace); }} />}
    </main>
  );
}

function ListPage({
  title,
  eyebrow,
  description,
  places,
  empty,
  icon,
  isFavorite,
  onSave,
  onDetail,
  onMap,
}: {
  title: string;
  eyebrow: string;
  description: string;
  places: Place[];
  empty: string;
  icon: React.ReactNode;
  isFavorite: (place: Place) => boolean;
  onSave: (place: Place) => void;
  onDetail: (place: Place) => void;
  onMap: (place: Place) => void;
}) {
  return (
    <section className="px-4 pt-[max(22px,env(safe-area-inset-top))] sm:px-6 lg:px-8">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-pink-300">{eyebrow}</p><h2 className="mt-1 text-[29px] font-black tracking-[-0.04em]">{title}</h2><p className="mt-1 text-[11px] text-white/42">{description}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{places.map((place) => <PlaceCard key={place.id} place={place} saved={isFavorite(place)} onSave={() => onSave(place)} onDetail={() => onDetail(place)} onMap={() => onMap(place)} />)}</div>
      {!places.length && <div className="mt-14 rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] p-8 text-center">{icon}<p className="mt-3 text-sm font-bold">{empty}</p></div>}
    </section>
  );
}
