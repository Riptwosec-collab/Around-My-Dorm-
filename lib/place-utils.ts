import type { OpeningHours, Place } from "@/types/place";

export const DORM_NAME = "บ้านสุภาอพาร์ทเม้นต์";
export const DORM_ADDRESS = "ซอยลาดพร้าว 35 แขวงจันทรเกษม เขตจตุจักร กรุงเทพมหานคร";
export const DORM_CENTER = { lat: 13.81972, lng: 100.58475 };

const DAY_KEYS: (keyof OpeningHours)[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function normalizeText(value: string) {
  return value
    .toLocaleLowerCase("th-TH")
    .replace(/[\s._\-–—'"()]/g, "")
    .trim();
}

export function googleMapsSearchUrl(name: string, addressOrArea?: string | null) {
  const query = [name, addressOrArea].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function googleMapsDirectionsUrl(place: Place) {
  const destination =
    place.latitude != null && place.longitude != null
      ? `${place.latitude},${place.longitude}`
      : [place.name, place.address || place.area].filter(Boolean).join(" ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const radius = 6371;
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export function withDistance(place: Place, origin: { lat: number; lng: number }) {
  if (place.latitude == null || place.longitude == null) return place;
  const distanceKm = haversineKm(origin, {
    lat: place.latitude,
    lng: place.longitude,
  });
  return {
    ...place,
    distanceKm,
    walkingMinutes: Math.max(1, Math.round((distanceKm * 1000) / 75)),
    drivingMinutes: Math.max(1, Math.round((distanceKm * 1000) / 350)),
  };
}

export function formatDistance(distanceKm: number | null) {
  if (distanceKm == null) return "ยังไม่มีพิกัดยืนยัน";
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} ม.`;
  return `${distanceKm.toFixed(distanceKm < 2 ? 1 : 2)} กม.`;
}

function parseRange(value: string) {
  const normalized = value.replace(/\s/g, "").replace(/[–—]/g, "-");
  const [start, end] = normalized.split("-");
  if (!start || !end) return null;
  const toMinutes = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  };
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (startMinutes == null || endMinutes == null) return null;
  return { start, end, startMinutes, endMinutes };
}

export function getOpenStatus(place: Place, now = new Date()) {
  if (place.is24Hours) {
    return { isOpen: true, text: "เปิด 24 ชั่วโมง", closesAt: null as string | null, tone: "cyan" as const };
  }

  const bangkokNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }),
  );
  const dayKey = DAY_KEYS[bangkokNow.getDay()];
  const today = place.openingHours[dayKey];
  if (!today) {
    return { isOpen: null, text: "ไม่ทราบเวลา", closesAt: null as string | null, tone: "muted" as const };
  }

  const range = parseRange(today);
  if (!range) {
    return { isOpen: null, text: today, closesAt: null as string | null, tone: "muted" as const };
  }

  const nowMinutes = bangkokNow.getHours() * 60 + bangkokNow.getMinutes();
  const overnight = range.endMinutes < range.startMinutes;
  const isOpen = overnight
    ? nowMinutes >= range.startMinutes || nowMinutes < range.endMinutes
    : nowMinutes >= range.startMinutes && nowMinutes < range.endMinutes;

  return isOpen
    ? { isOpen: true, text: `เปิดอยู่ • ปิด ${range.end}`, closesAt: range.end, tone: "green" as const }
    : { isOpen: false, text: `ปิดแล้ว • เปิด ${range.start}`, closesAt: null as string | null, tone: "red" as const };
}

export function priceLevelText(place: Place) {
  if (place.priceText) return place.priceText;
  if (place.priceLevel == null) return "ยังไม่มีข้อมูลราคา";
  return "฿".repeat(place.priceLevel);
}

export function matchesSearch(place: Place, query: string) {
  const q = normalizeText(query);
  if (!q) return true;
  const searchable = normalizeText(
    [
      place.name,
      place.nameEn || "",
      place.category,
      place.categories.join(" "),
      place.subcategory || "",
      place.shortDescription,
      place.description,
      place.area,
      place.soi || "",
      place.tags.join(" "),
      place.popularMenus.join(" "),
      place.recommendedItems.join(" "),
      place.is24Hours ? "24 ชั่วโมง 24ชม เปิด24ชั่วโมง" : "",
      place.openLate ? "เปิดดึก ของกินดึก" : "",
      place.goodForWorking ? "นั่งทำงาน ทำงานได้" : "",
      place.studentFriendly ? "นักศึกษา student" : "",
    ].join(" "),
  );
  return searchable.includes(q);
}

export function dedupePlaces(places: Place[]) {
  const seen = new Set<string>();
  return places.filter((place) => {
    const key = place.googlePlaceId
      ? `google:${place.googlePlaceId}`
      : `${normalizeText(place.name)}:${normalizeText(place.address || place.area)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
