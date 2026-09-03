"use client";

import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Clock3,
  Compass,
  Filter,
  Heart,
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
  X,
} from "lucide-react";

declare global {
  interface Window {
    google: any;
    __aroundDormMapsPromise?: Promise<void>;
  }
}

type Tab = "explore" | "map" | "saved" | "settings";
type SortMode = "distance" | "rating" | "reviews";

type PlaceItem = {
  id: string;
  name: string;
  category: string;
  primaryType?: string;
  rating?: number;
  reviews?: number;
  distanceMeters?: number;
  price?: string;
  address?: string;
  isOpenNow?: boolean | null;
  hoursText?: string;
  image?: string;
  mapsUrl?: string;
  location?: { lat: number; lng: number };
  tags: string[];
  isLocalGem?: boolean;
};

const DORM_NAME = "บ้านสุภาอพาร์ทเม้นต์";
const DORM_ADDRESS = "55 Soi Supha Phong, Chan Kasem, Chatuchak, Bangkok 10900, Thailand";
const FALLBACK_CENTER = { lat: 13.81972, lng: 100.58475 };
const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=82";

const CATEGORIES = [
  { id: "all", name: "ทั้งหมด", icon: "✨", types: [] as string[] },
  { id: "food", name: "อาหาร", icon: "🍜", types: ["restaurant"] },
  { id: "cafe", name: "คาเฟ่", icon: "☕", types: ["cafe"] },
  { id: "convenience", name: "สะดวกซื้อ", icon: "🏪", types: ["convenience_store"] },
  { id: "laundry", name: "ซักผ้า", icon: "🧺", types: ["laundry"] },
  { id: "fitness", name: "ฟิตเนส", icon: "🏋️", types: ["gym"] },
  { id: "parking", name: "ที่จอดรถ", icon: "🅿️", types: ["parking"] },
] as const;

const RADII = [
  { label: "500 ม.", value: 500 },
  { label: "1 กม.", value: 1000 },
  { label: "2 กม.", value: 2000 },
  { label: "3 กม.", value: 3000 },
  { label: "5 กม.", value: 5000 },
];

const FALLBACK_PLACES: PlaceItem[] = [
  {
    id: "rung-mah-pah",
    name: "Rung-Mah-Pah",
    category: "ร้านอาหาร",
    primaryType: "restaurant",
    rating: 4.9,
    reviews: 267,
    distanceMeters: 170,
    price: "฿฿",
    address: "43 ซ. ลาดพร้าว 35 จันทรเกษม จตุจักร กรุงเทพฯ 10900",
    isOpenNow: null,
    tags: ["ลาดพร้าว 35", "Local favorite"],
    isLocalGem: true,
    image: "https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=1200&q=82",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Rung-Mah-Pah%20Lat%20Phrao%2035",
  },
  {
    id: "yello",
    name: "Yello ลูกไก่ไข่ฟู",
    category: "ร้านอาหาร",
    primaryType: "restaurant",
    rating: 4.9,
    reviews: 269,
    distanceMeters: 380,
    price: "฿฿",
    address: "300 ลาดพร้าว 35/1 จันทรเกษม จตุจักร กรุงเทพฯ 10900",
    isOpenNow: null,
    tags: ["ลาดพร้าว 35/1", "รีวิวดี"],
    isLocalGem: true,
    image: "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=82",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Yello%20ลูกไก่ไข่ฟู",
  },
  {
    id: "uneek",
    name: "Uneek.Bkk",
    category: "คาเฟ่",
    primaryType: "cafe",
    rating: 5,
    reviews: 70,
    distanceMeters: 230,
    price: "฿",
    address: "137/10 ซอยสุภาพงษ์ จันทรเกษม จตุจักร กรุงเทพฯ 10900",
    isOpenNow: null,
    tags: ["กาแฟ", "ใกล้หอ"],
    isLocalGem: true,
    image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=82",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Uneek.Bkk%20Bangkok",
  },
  {
    id: "otteri",
    name: "Otteri ลาดพร้าว 35",
    category: "ร้านสะดวกซัก",
    primaryType: "laundry",
    rating: 4.9,
    reviews: 7,
    distanceMeters: 210,
    address: "Mercury House, 11 ซ. ลาดพร้าว 35 กรุงเทพฯ 10900",
    isOpenNow: true,
    hoursText: "เปิด 24 ชั่วโมง",
    tags: ["24 ชั่วโมง", "ซัก • อบ"],
    image: "https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?auto=format&fit=crop&w=1200&q=82",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Otteri%20ลาดพร้าว%2035",
  },
  {
    id: "washenjoy",
    name: "WashEnjoy ลาดพร้าว 35",
    category: "ร้านสะดวกซัก",
    primaryType: "laundry",
    rating: 5,
    reviews: 1,
    distanceMeters: 260,
    address: "67 ซอยสุภาพงษ์ จันทรเกษม จตุจักร กรุงเทพฯ 10900",
    isOpenNow: true,
    hoursText: "เปิด 24 ชั่วโมง",
    tags: ["24 ชั่วโมง", "ใกล้หอ"],
    image: "https://images.unsplash.com/photo-1545173168-9f1947eebb7f?auto=format&fit=crop&w=1200&q=82",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=WashEnjoy%20ลาดพร้าว%2035",
  },
  {
    id: "seven",
    name: "7-Eleven ลาดพร้าว 35",
    category: "ร้านสะดวกซื้อ",
    primaryType: "convenience_store",
    rating: 2.8,
    reviews: 6,
    distanceMeters: 300,
    address: "20 ซ. ลาดพร้าว 35 จันทรเกษม จตุจักร กรุงเทพฯ 10900",
    isOpenNow: true,
    hoursText: "เปิด 24 ชั่วโมง",
    tags: ["24 ชั่วโมง", "ของใช้ประจำวัน"],
    image: "https://images.unsplash.com/photo-1601599561213-832382fd07ba?auto=format&fit=crop&w=1200&q=82",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=7-Eleven%20ลาดพร้าว%2035",
  },
  {
    id: "chana",
    name: "Chana Parking",
    category: "ที่จอดรถ",
    primaryType: "parking",
    rating: 5,
    reviews: 1,
    distanceMeters: 310,
    address: "58/87 ซอยสุภาพงษ์ จันทรเกษม จตุจักร กรุงเทพฯ 10900",
    isOpenNow: true,
    hoursText: "เปิด 24 ชั่วโมง",
    tags: ["24 ชั่วโมง", "ที่จอดรถ"],
    image: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=1200&q=82",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Chana%20Parking%20Lat%20Phrao",
  },
  {
    id: "natthew",
    name: "Natthew PT Studio",
    category: "ฟิตเนส / Personal Training",
    primaryType: "gym",
    rating: 5,
    reviews: 6,
    distanceMeters: 540,
    address: "วรรัตน์แมนชั่น จันทรเกษม จตุจักร กรุงเทพฯ 10900",
    isOpenNow: null,
    tags: ["Personal Training", "ลาดพร้าว"],
    image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=82",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Natthew%20PT%20Studio",
  },
];

function loadGoogleMaps(apiKey: string) {
  if (typeof window === "undefined") return Promise.reject();
  if (window.google?.maps) return Promise.resolve();
  if (window.__aroundDormMapsPromise) return window.__aroundDormMapsPromise;

  window.__aroundDormMapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      "&v=weekly&libraries=places,marker&language=th&region=TH";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps load failed"));
    document.head.appendChild(script);
  });

  return window.__aroundDormMapsPromise;
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(m?: number) {
  if (m == null) return "ใกล้หอ";
  if (m < 1000) return `${Math.round(m / 10) * 10} ม.`;
  return `${(m / 1000).toFixed(m < 2000 ? 1 : 0)} กม.`;
}

function walkTime(m?: number) {
  if (m == null) return "";
  if (m < 1500) return `เดิน ${Math.max(1, Math.round(m / 75))} นาที`;
  return `ขับรถ ~${Math.max(3, Math.round(m / 350))} นาที`;
}

function priceText(level: unknown) {
  const s = String(level ?? "");
  if (s.includes("INEXPENSIVE")) return "฿";
  if (s.includes("MODERATE")) return "฿฿";
  if (s.includes("VERY_EXPENSIVE")) return "฿฿฿฿";
  if (s.includes("EXPENSIVE")) return "฿฿฿";
  return "";
}

function categoryLabel(type?: string) {
  return (
    {
      restaurant: "ร้านอาหาร",
      cafe: "คาเฟ่",
      convenience_store: "ร้านสะดวกซื้อ",
      laundry: "ร้านสะดวกซัก",
      gym: "ฟิตเนส",
      parking: "ที่จอดรถ",
    }[type ?? ""] ?? "สถานที่ใกล้เคียง"
  );
}

function GlassButton({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "shrink-0 rounded-full border border-cyan-200/40 bg-cyan-300 px-4 py-2.5 text-[11px] font-black text-[#041018] shadow-[0_0_24px_rgba(34,211,238,.22)]"
          : "shrink-0 rounded-full border border-white/10 bg-white/[0.055] px-4 py-2.5 text-[11px] font-bold text-white/65 backdrop-blur-xl"
      }
    >
      {children}
    </button>
  );
}

function PlaceCard({ place, saved, onSave, onMap }: { place: PlaceItem; saved: boolean; onSave: () => void; onMap: () => void }) {
  return (
    <article className="overflow-hidden rounded-[28px] border border-white/[0.09] bg-white/[0.045] shadow-[0_18px_70px_rgba(0,0,0,.3)] backdrop-blur-2xl">
      <div className="relative h-[178px] overflow-hidden bg-[#0d1320]">
        <img src={place.image || FALLBACK_IMAGE} alt={place.name} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07101c]/95 via-transparent to-black/10" />
        {place.isLocalGem && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-pink-300/25 bg-pink-500/90 px-2.5 py-1.5 text-[10px] font-black shadow-lg backdrop-blur-xl">
            <Sparkles className="h-3 w-3" /> LOCAL GEM
          </div>
        )}
        <button onClick={onSave} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/40 backdrop-blur-xl">
          <Heart className={`h-[18px] w-[18px] ${saved ? "fill-pink-400 text-pink-300" : "text-white"}`} />
        </button>
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-semibold text-white/60">{place.category} {place.price ? `• ${place.price}` : ""}</p>
            <h3 className="truncate text-[17px] font-black tracking-[-0.02em]">{place.name}</h3>
          </div>
          {place.rating && (
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/45 px-2.5 py-1.5 backdrop-blur-xl">
              <Star className="h-3.5 w-3.5 fill-cyan-300 text-cyan-300" />
              <span className="text-xs font-bold">{place.rating.toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-white/60">
          <div className="flex items-center gap-1.5"><Navigation className="h-3.5 w-3.5 text-cyan-300" /><b className="text-white/90">{formatDistance(place.distanceMeters)}</b><span>{walkTime(place.distanceMeters)}</span></div>
          <div className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-white/40" />{place.isOpenNow === true ? <span className="font-bold text-emerald-300">● เปิดอยู่</span> : place.isOpenNow === false ? <span className="font-bold text-rose-300">● ปิดแล้ว</span> : <span>ดูเวลาใน Maps</span>}</div>
        </div>
        {place.address && <p className="mt-2 truncate text-[11px] text-white/40">{place.address}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">{place.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-lg border border-white/[0.08] bg-white/[0.045] px-2 py-1 text-[10px] text-white/60">{tag}</span>)}</div>
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <button onClick={onMap} className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.11] text-[12px] font-black text-cyan-200"><MapPin className="h-4 w-4" />ดูบนแผนที่</button>
          <a href={place.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`} target="_blank" rel="noreferrer" className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.055]"><ArrowUpRight className="h-4 w-4" /></a>
        </div>
      </div>
    </article>
  );
}

export default function AroundMyDormPremium() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const [tab, setTab] = useState<Tab>("explore");
  const [radius, setRadius] = useState(2000);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [places, setPlaces] = useState<PlaceItem[]>(FALLBACK_PLACES);
  const [center, setCenter] = useState(FALLBACK_CENTER);
  const [apiReady, setApiReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("distance");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceItem | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    try {
      setSavedIds(JSON.parse(localStorage.getItem("around-dorm-saved") || "[]"));
    } catch {}
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey)
      .then(async () => {
        try {
          const geocoder = new window.google.maps.Geocoder();
          const result = await geocoder.geocode({ address: DORM_ADDRESS });
          const loc = result.results?.[0]?.geometry?.location;
          if (loc) setCenter({ lat: loc.lat(), lng: loc.lng() });
        } catch {}
        setApiReady(true);
      })
      .catch(() => setApiReady(false));
  }, [apiKey]);

  useEffect(() => {
    if (!apiReady) return;
    let cancelled = false;

    async function searchPlaces() {
      setLoading(true);
      try {
        const placesLib = await window.google.maps.importLibrary("places");
        const Place = placesLib.Place;
        const active = CATEGORIES.find((c) => c.id === category);
        const includedTypes = active?.types?.length ? [...active.types] : ["restaurant", "cafe", "convenience_store", "laundry", "gym", "parking"];
        const request: any = {
          fields: ["id", "displayName", "formattedAddress", "location", "rating", "userRatingCount", "priceLevel", "primaryType", "primaryTypeDisplayName", "photos", "googleMapsURI", "currentOpeningHours"],
          locationRestriction: { center, radius },
          includedTypes,
          maxResultCount: 20,
          rankPreference: "POPULARITY",
          language: "th",
          region: "TH",
        };
        const result = await Place.searchNearby(request);
        const mapped: PlaceItem[] = (result.places || []).map((p: any) => {
          const loc = p.location ? { lat: p.location.lat(), lng: p.location.lng() } : undefined;
          let image = FALLBACK_IMAGE;
          try { image = p.photos?.[0]?.getURI?.({ maxWidth: 1000, maxHeight: 720 }) || image; } catch {}
          return {
            id: p.id,
            name: p.displayName || "สถานที่ใกล้เคียง",
            category: p.primaryTypeDisplayName || categoryLabel(p.primaryType),
            primaryType: p.primaryType,
            rating: p.rating,
            reviews: p.userRatingCount,
            distanceMeters: loc ? distanceMeters(center, loc) : undefined,
            price: priceText(p.priceLevel),
            address: p.formattedAddress,
            isOpenNow: typeof p.currentOpeningHours?.openNow === "boolean" ? p.currentOpeningHours.openNow : null,
            image,
            mapsUrl: p.googleMapsURI,
            location: loc,
            tags: [p.primaryTypeDisplayName || categoryLabel(p.primaryType), p.userRatingCount ? `${p.userRatingCount.toLocaleString()} รีวิว` : "Google Places"],
            isLocalGem: (p.rating || 0) >= 4.7 && (p.userRatingCount || 0) >= 50,
          };
        });
        if (!cancelled && mapped.length) setPlaces(mapped);
      } catch {
        if (!cancelled) setPlaces(FALLBACK_PLACES);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    searchPlaces();
    return () => { cancelled = true; };
  }, [apiReady, category, radius, center]);

  const filtered = useMemo(() => {
    const q = submittedQuery.trim().toLowerCase();
    const active = CATEGORIES.find((c) => c.id === category);
    let data = places.filter((p) => {
      const categoryOk = category === "all" || active?.types.includes(p.primaryType as never) || p.category.toLowerCase().includes(active?.name.toLowerCase() || "");
      const queryOk = !q || `${p.name} ${p.category} ${p.address || ""} ${p.tags.join(" ")}`.toLowerCase().includes(q);
      const radiusOk = (p.distanceMeters ?? 0) <= radius;
      const ratingOk = (p.rating ?? 0) >= minRating;
      const openOk = !onlyOpen || p.isOpenNow === true;
      return categoryOk && queryOk && radiusOk && ratingOk && openOk;
    });
    data = [...data].sort((a, b) => {
      if (sortMode === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      if (sortMode === "reviews") return (b.reviews ?? 0) - (a.reviews ?? 0);
      return (a.distanceMeters ?? 999999) - (b.distanceMeters ?? 999999);
    });
    return data;
  }, [places, submittedQuery, category, radius, minRating, onlyOpen, sortMode]);

  const savedPlaces = useMemo(() => places.filter((p) => savedIds.includes(p.id)), [places, savedIds]);

  function toggleSave(id: string) {
    setSavedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem("around-dorm-saved", JSON.stringify(next));
      return next;
    });
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    setSubmittedQuery(query);
  }

  function openMap(place: PlaceItem) {
    setSelectedPlace(place);
    setTab("map");
  }

  useEffect(() => {
    if (tab !== "map" || !apiReady || !mapEl.current) return;
    let cancelled = false;

    (async () => {
      await window.google.maps.importLibrary("maps");
      const markerLib = await window.google.maps.importLibrary("marker");
      if (cancelled || !mapEl.current) return;
      if (!mapRef.current) {
        mapRef.current = new window.google.maps.Map(mapEl.current, {
          center,
          zoom: 15,
          mapId: "DEMO_MAP_ID",
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
      }
      mapRef.current.setCenter(selectedPlace?.location || center);
      mapRef.current.setZoom(selectedPlace ? 17 : radius <= 1000 ? 15 : radius <= 3000 ? 14 : 13);
      markersRef.current.forEach((m) => { m.map = null; });
      markersRef.current = [];

      const dormPin = new markerLib.PinElement({ background: "#22d3ee", borderColor: "#ffffff", glyphColor: "#031018" });
      markersRef.current.push(new markerLib.AdvancedMarkerElement({ map: mapRef.current, position: center, title: DORM_NAME, content: dormPin.element }));

      filtered.forEach((p) => {
        if (!p.location) return;
        const pin = new markerLib.PinElement({ background: selectedPlace?.id === p.id ? "#fb7185" : "#111827", borderColor: "#67e8f9", glyphColor: "#67e8f9" });
        const marker = new markerLib.AdvancedMarkerElement({ map: mapRef.current, position: p.location, title: p.name, content: pin.element });
        marker.addListener("click", () => setSelectedPlace(p));
        markersRef.current.push(marker);
      });
    })();

    return () => { cancelled = true; };
  }, [tab, apiReady, center, radius, filtered, selectedPlace]);

  const navItems = [
    { id: "explore" as Tab, label: "สำรวจ", icon: Home },
    { id: "map" as Tab, label: "แผนที่", icon: MapIcon },
    { id: "saved" as Tab, label: "บันทึก", icon: Bookmark },
    { id: "settings" as Tab, label: "ตั้งค่า", icon: Settings },
  ];

  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-[#050812] text-white selection:bg-cyan-300/30">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-[100px]" />
        <div className="absolute right-[-120px] top-52 h-80 w-80 rounded-full bg-indigo-500/10 blur-[120px]" />
        <div className="absolute bottom-10 left-1/3 h-64 w-64 rounded-full bg-pink-500/[0.07] blur-[100px]" />
      </div>

      <div className="relative mx-auto min-h-[100dvh] w-full max-w-[430px] border-x border-white/[0.035] bg-[#07101b]/35 shadow-2xl">
        <div className="pb-[calc(106px+env(safe-area-inset-bottom))]">
          {tab === "explore" && (
            <>
              <header className="px-4 pb-3 pt-[max(18px,env(safe-area-inset-top))]">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/85"><span>NEARBY LIFE</span><span className="h-1 w-1 rounded-full bg-cyan-300" /></div>
                    <h1 className="text-[29px] font-black tracking-[-0.045em]">Around My Dorm</h1>
                    <p className="mt-1 text-[12px] text-white/45">กิน • ช้อป • คาเฟ่ • บริการ รอบหอของคุณ</p>
                  </div>
                  <button onClick={() => setTab("map")} className="grid h-11 w-11 place-items-center rounded-[17px] border border-white/10 bg-white/[0.055] backdrop-blur-2xl"><Compass className="h-5 w-5 text-cyan-200" /></button>
                </div>

                <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.025] p-3.5 shadow-[0_14px_50px_rgba(0,0,0,.24)] backdrop-blur-2xl">
                  <div className="relative flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-pink-300/20 bg-pink-500/10"><MapPin className="h-[18px] w-[18px] text-pink-300" /></div>
                    <div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">HOME BASE</p><p className="truncate text-[13px] font-black">{DORM_NAME}</p><p className="mt-0.5 truncate text-[10px] text-white/40">ซอยลาดพร้าว 35 • จันทรเกษม • จตุจักร</p></div>
                    <Check className="h-4 w-4 text-emerald-300" />
                  </div>
                </div>
              </header>

              <section className="px-4">
                <form onSubmit={handleSearch} className="relative my-4">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/35" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาร้าน อาหาร คาเฟ่ ฟิตเนส..." className="h-[56px] w-full rounded-[20px] border border-white/[0.09] bg-white/[0.055] pl-12 pr-14 text-[13px] font-medium outline-none backdrop-blur-2xl placeholder:text-white/28 focus:border-cyan-300/45 focus:ring-4 focus:ring-cyan-300/[0.05]" />
                  <button type="button" onClick={() => setFilterOpen(true)} className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-[14px] border border-cyan-300/20 bg-cyan-300/[0.09]"><SlidersHorizontal className="h-[18px] w-[18px] text-cyan-200" /></button>
                </form>

                <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><div className="flex w-max gap-2 pb-2">{RADII.map((r) => <GlassButton key={r.value} active={radius === r.value} onClick={() => setRadius(r.value)}>{r.label}</GlassButton>)}</div></div>

                <div className="mt-4 grid grid-cols-4 gap-2">
                  {CATEGORIES.slice(0, 4).map((c) => <button key={c.id} onClick={() => setCategory(c.id)} className={`rounded-[19px] border px-2 py-3 text-center ${category === c.id ? "border-cyan-300/30 bg-cyan-300/[0.11]" : "border-white/[0.07] bg-white/[0.04]"}`}><span className="mb-1.5 block text-[21px]">{c.icon}</span><span className={`text-[10px] font-bold ${category === c.id ? "text-cyan-200" : "text-white/55"}`}>{c.name}</span></button>)}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {CATEGORIES.slice(4).map((c) => <button key={c.id} onClick={() => setCategory(c.id)} className={`flex items-center justify-center gap-2 rounded-[17px] border py-3 ${category === c.id ? "border-cyan-300/30 bg-cyan-300/[0.11]" : "border-white/[0.07] bg-white/[0.04]"}`}><span>{c.icon}</span><span className={`text-[10px] font-bold ${category === c.id ? "text-cyan-200" : "text-white/55"}`}>{c.name}</span></button>)}
                </div>

                <div className="mb-4 mt-7 flex items-end justify-between">
                  <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-pink-300">DISCOVER</p><h2 className="mt-1 text-[19px] font-black">ร้านรอบหอ</h2><p className="mt-1 text-[10px] text-white/38">พบ {filtered.length} ร้าน • {RADII.find((r) => r.value === radius)?.label} {apiReady ? "• Google Places Live" : "• Preview Data"}</p></div>
                  <button onClick={() => setFilterOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-bold text-white/60"><Filter className="h-3.5 w-3.5" />กรอง</button>
                </div>

                {loading && <div className="mb-4 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.05] p-3 text-center text-[11px] text-cyan-100">กำลังโหลดร้านจาก Google Places...</div>}
                <div className="space-y-4">{filtered.map((p) => <PlaceCard key={p.id} place={p} saved={savedIds.includes(p.id)} onSave={() => toggleSave(p.id)} onMap={() => openMap(p)} />)}</div>
                {!filtered.length && <div className="mt-8 rounded-[26px] border border-dashed border-white/10 p-8 text-center"><Search className="mx-auto h-7 w-7 text-white/25" /><p className="mt-3 text-sm font-bold">ไม่พบร้านตามตัวกรอง</p><p className="mt-1 text-xs text-white/40">ลองเพิ่มรัศมีหรือลดเงื่อนไขคะแนน</p></div>}
              </section>
            </>
          )}

          {tab === "map" && (
            <section className="relative h-[calc(100dvh-76px-env(safe-area-inset-bottom))] overflow-hidden">
              {apiReady ? <div ref={mapEl} className="absolute inset-0" /> : <div className="absolute inset-0 grid place-items-center bg-[#07101b] px-7 text-center"><div><MapIcon className="mx-auto h-10 w-10 text-cyan-300/70" /><h2 className="mt-4 text-xl font-black">Google Maps Preview</h2><p className="mt-2 text-xs leading-5 text-white/45">เพิ่ม NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ใน Vercel หรือ .env.local เพื่อเปิดแผนที่สดและหมุดร้านจริง</p><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(DORM_NAME)}`} target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-2xl bg-cyan-300 px-4 py-3 text-xs font-black text-[#031018]">เปิดใน Google Maps</a></div></div>}

              <div className="absolute left-0 right-0 top-0 z-20 px-4 pt-[max(16px,env(safe-area-inset-top))]">
                <div className="flex items-center justify-between rounded-[21px] border border-white/10 bg-[#07101b]/78 p-3 shadow-xl backdrop-blur-2xl"><div><p className="text-[10px] font-black tracking-[0.15em] text-cyan-300">LIVE MAP</p><p className="mt-0.5 text-[13px] font-black">{DORM_NAME}</p></div><button onClick={() => { setSelectedPlace(null); mapRef.current?.setCenter(center); }} className="grid h-10 w-10 place-items-center rounded-2xl bg-white/[0.07]"><LocateFixed className="h-4 w-4 text-cyan-200" /></button></div>
              </div>

              {selectedPlace && <div className="absolute bottom-4 left-4 right-4 z-20 rounded-[24px] border border-white/10 bg-[#07101b]/88 p-4 shadow-2xl backdrop-blur-2xl"><div className="flex gap-3"><img src={selectedPlace.image || FALLBACK_IMAGE} alt="" className="h-20 w-20 rounded-[18px] object-cover" /><div className="min-w-0 flex-1"><p className="text-[10px] font-bold text-cyan-200">{selectedPlace.category}</p><h3 className="mt-1 truncate text-[14px] font-black">{selectedPlace.name}</h3><p className="mt-1 text-[11px] text-white/45">{formatDistance(selectedPlace.distanceMeters)} {selectedPlace.rating ? `• ★ ${selectedPlace.rating.toFixed(1)}` : ""}</p><a href={selectedPlace.mapsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-cyan-200">นำทางด้วย Google Maps <ArrowUpRight className="h-3.5 w-3.5" /></a></div></div></div>}
            </section>
          )}

          {tab === "saved" && (
            <section className="px-4 pt-[max(22px,env(safe-area-inset-top))]">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-pink-300">COLLECTION</p><h2 className="mt-1 text-[28px] font-black tracking-[-0.04em]">ร้านที่บันทึก</h2><p className="mt-1 text-[12px] text-white/45">เก็บร้านที่อยากลองไว้ใน iPhone เครื่องนี้</p>
              <div className="mt-6 space-y-4">{savedPlaces.map((p) => <PlaceCard key={p.id} place={p} saved onSave={() => toggleSave(p.id)} onMap={() => openMap(p)} />)}</div>
              {!savedPlaces.length && <div className="mt-14 rounded-[28px] border border-dashed border-white/12 bg-white/[0.035] p-8 text-center"><Heart className="mx-auto h-8 w-8 text-white/25" /><p className="mt-3 text-sm font-bold">ยังไม่มีร้านที่บันทึก</p><p className="mt-1 text-xs text-white/42">แตะหัวใจบนการ์ดร้านเพื่อเพิ่มที่นี่</p></div>}
            </section>
          )}

          {tab === "settings" && (
            <section className="px-4 pt-[max(22px,env(safe-area-inset-top))]">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">APP SETTINGS</p><h2 className="mt-1 text-[28px] font-black tracking-[-0.04em]">ตั้งค่า</h2>
              <div className="mt-6 space-y-3">{[["ตำแหน่งหลัก", DORM_NAME], ["รัศมี", RADII.find((r) => r.value === radius)?.label || "2 กม."], ["ภาษา", "ไทย"], ["Google Places", apiReady ? "Connected" : "Preview mode"]].map(([title, value]) => <div key={title} className="flex items-center justify-between rounded-[22px] border border-white/[0.08] bg-white/[0.045] p-4"><span className="text-[12px] font-semibold text-white/62">{title}</span><span className="text-[12px] font-black text-white/90">{value}</span></div>)}</div>
              <div className="mt-5 rounded-[24px] border border-cyan-300/15 bg-cyan-300/[0.055] p-4"><p className="text-[12px] font-black text-cyan-100">iPhone 16 Pro Optimized</p><p className="mt-1 text-[11px] leading-5 text-white/48">รองรับ 393px viewport, 100dvh, Dynamic Island safe-area และ Home Indicator</p></div>
            </section>
          )}
        </div>

        <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 border-t border-white/[0.08] bg-[#07101b]/82 pb-[env(safe-area-inset-bottom)] backdrop-blur-[28px]">
          <div className="grid h-[76px] grid-cols-4 px-3 pt-1">{navItems.map((item) => { const active = tab === item.id; return <button key={item.id} onClick={() => { setSelectedPlace(null); setTab(item.id); }} className="relative flex flex-col items-center justify-center gap-1">{active && <span className="absolute top-1 h-[2px] w-7 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,.8)]" />}<item.icon className={`h-[22px] w-[22px] ${active ? "text-cyan-200" : "text-white/30"}`} /><span className={`text-[9px] font-black ${active ? "text-cyan-200" : "text-white/30"}`}>{item.label}</span></button>; })}</div>
        </nav>
      </div>

      {filterOpen && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <button aria-label="ปิด" onClick={() => setFilterOpen(false)} className="absolute inset-0" />
          <div className="relative w-full max-w-[430px] rounded-t-[34px] border border-white/10 bg-[#0a111d]/96 px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-2xl backdrop-blur-3xl">
            <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-white/15" />
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-black tracking-[0.16em] text-cyan-300">SMART FILTER</p><h3 className="mt-1 text-xl font-black">กรองร้าน</h3></div><button onClick={() => setFilterOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06]"><X className="h-4 w-4" /></button></div>
            <div className="mt-5"><p className="mb-2 text-[11px] font-bold text-white/45">เรียงตาม</p><div className="grid grid-cols-3 gap-2">{[["distance", "ใกล้สุด"], ["rating", "คะแนน"], ["reviews", "รีวิวเยอะ"]].map(([id, label]) => <button key={id} onClick={() => setSortMode(id as SortMode)} className={`rounded-2xl border px-2 py-3 text-[11px] font-black ${sortMode === id ? "border-cyan-300/35 bg-cyan-300/[0.12] text-cyan-200" : "border-white/10 bg-white/[0.04] text-white/55"}`}>{label}</button>)}</div></div>
            <div className="mt-5"><p className="mb-2 text-[11px] font-bold text-white/45">คะแนนขั้นต่ำ</p><div className="flex gap-2">{[0, 4, 4.5, 4.7].map((r) => <GlassButton key={r} active={minRating === r} onClick={() => setMinRating(r)}>{r === 0 ? "ทั้งหมด" : `★ ${r}+`}</GlassButton>)}</div></div>
            <button onClick={() => setOnlyOpen((v) => !v)} className="mt-5 flex w-full items-center justify-between rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-4"><div className="text-left"><p className="text-[12px] font-black">เปิดอยู่ตอนนี้</p><p className="mt-1 text-[10px] text-white/40">ซ่อนร้านที่ปิดอยู่</p></div><span className={`relative h-7 w-12 rounded-full transition ${onlyOpen ? "bg-cyan-300" : "bg-white/10"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${onlyOpen ? "left-6" : "left-1"}`} /></span></button>
            <button onClick={() => setFilterOpen(false)} className="mt-5 h-[52px] w-full rounded-[20px] bg-cyan-300 text-[13px] font-black text-[#031018] shadow-[0_0_28px_rgba(34,211,238,.22)]">ใช้ตัวกรอง</button>
          </div>
        </div>
      )}
    </main>
  );
}
