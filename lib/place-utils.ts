import type {
  DayKey,
  OpeningHours,
  OpeningPeriod,
  ParkingAvailabilityStatus,
  Place,
  Pricing,
} from "@/types/place";

export const DORM_NAME = "บ้านสุภาอพาร์ทเม้นต์";
export const DORM_ADDRESS = "ซอยลาดพร้าว 35 แขวงจันทรเกษม เขตจตุจักร กรุงเทพมหานคร";
export const DORM_CENTER = { lat: 13.81972, lng: 100.58475 };

const DAY_KEYS: DayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const FOOD_CATEGORIES = new Set([
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

export type SmartOpenStatus = {
  status: "OPEN" | "CLOSED" | "OPEN_24_HOURS" | "OPENING_SOON" | "CLOSING_SOON" | "UNKNOWN" | "PERMANENTLY_CLOSED" | "TEMPORARILY_CLOSED";
  isOpen: boolean | null;
  label: string;
  secondaryText: string | null;
  text: string;
  closesAt: string | null;
  opensAt: string | null;
  nextOpenAt: string | null;
  tone: "green" | "red" | "cyan" | "amber" | "muted";
};

export type NaturalQuery = {
  category?: string;
  priceMax?: number;
  openAt?: string;
  walkingMaxMinutes?: number;
  distanceMaxKm?: number;
  goodForWorking?: boolean;
  localOnly?: boolean;
  openLate?: boolean;
  only24Hours?: boolean;
  delivery?: boolean;
  parking?: boolean;
  parkingMonthly?: boolean;
  freeText: string;
};

export function normalizeText(value: string) {
  return value
    .toLocaleLowerCase("th-TH")
    .replace(/[\s._\-–—'"()]/g, "")
    .trim();
}

export function normalizePlaceName(value: string) {
  return normalizeText(
    value
      .replace(/\b(branch|สาขา)\b/gi, "")
      .replace(/ร้าน/g, "")
      .trim(),
  );
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

export const calculateHaversine = haversineKm;

/**
 * Only straight-line distance is calculated locally. Walking/driving/motorcycle
 * times are never invented. Route values stay as supplied by a verified route API.
 */
export function withDistance(place: Place, origin: { lat: number; lng: number }) {
  if (place.latitude == null || place.longitude == null) return place;
  const distanceKm = haversineKm(origin, {
    lat: place.latitude,
    lng: place.longitude,
  });
  const straightLineMeters = Math.round(distanceKm * 1000);
  return {
    ...place,
    distanceKm,
    straightLineDistanceKm: distanceKm,
    distance: {
      straightLineMeters,
      walkingDistanceMeters: place.distance?.walkingDistanceMeters ?? (place.walkingDistanceKm != null ? Math.round(place.walkingDistanceKm * 1000) : null),
      walkingMinutes: place.distance?.walkingMinutes ?? place.walkingMinutes ?? null,
      motorcycleDistanceMeters: place.distance?.motorcycleDistanceMeters ?? null,
      motorcycleMinutes: place.distance?.motorcycleMinutes ?? null,
      drivingDistanceMeters: place.distance?.drivingDistanceMeters ?? (place.drivingDistanceKm != null ? Math.round(place.drivingDistanceKm * 1000) : null),
      drivingMinutes: place.distance?.drivingMinutes ?? place.drivingMinutes ?? null,
    },
  } satisfies Place;
}

export function formatDistance(distanceKm: number | null) {
  if (distanceKm == null) return "ยังไม่มีพิกัดยืนยัน";
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} ม.`;
  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} กม.`;
}

export function formatDistanceMeters(meters: number | null | undefined) {
  if (meters == null) return "ยังไม่มีข้อมูลระยะทาง";
  if (meters < 1000) return `${Math.round(meters)} ม.`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} กม.`;
}

function timeToMinutes(time: string) {
  const clean = time.trim().replace(".", ":");
  const match = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
  return (hour % 24) * 60 + minute;
}

function parseRange(value: string): OpeningPeriod | null {
  const normalized = value
    .replace(/ประมาณ/g, "")
    .replace(/\s/g, "")
    .replace(/[–—]/g, "-");
  const match = normalized.match(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/);
  if (!match) return null;
  return { open: match[1], close: match[2] };
}

function legacyPeriods(value: string | null | undefined) {
  if (!value) return [] as OpeningPeriod[];
  return value
    .split(/[,;\/]|\s+และ\s+/)
    .map(parseRange)
    .filter((period): period is OpeningPeriod => Boolean(period));
}

function getPeriods(place: Place, day: DayKey) {
  const structured = place.structuredOpeningHours?.[day];
  if (Array.isArray(structured)) return structured;
  const legacy = legacyPeriods(place.openingHours?.[day]);
  if (legacy.length) return legacy;
  const generic = legacyPeriods(place.openingHoursText);
  return generic;
}

function bangkokDate(now: Date) {
  return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
}

function statusUnknown(text = "ยังไม่มีข้อมูลเวลา"): SmartOpenStatus {
  return {
    status: "UNKNOWN",
    isOpen: null,
    label: "ยังไม่มีข้อมูลเวลา",
    secondaryText: null,
    text,
    closesAt: null,
    opensAt: null,
    nextOpenAt: null,
    tone: "muted",
  };
}

export function getPlaceOpenStatus(place: Place, now = new Date()): SmartOpenStatus {
  if (place.permanentlyClosed) {
    return {
      status: "PERMANENTLY_CLOSED",
      isOpen: false,
      label: "ปิดถาวร",
      secondaryText: null,
      text: "ปิดถาวร",
      closesAt: null,
      opensAt: null,
      nextOpenAt: null,
      tone: "red",
    };
  }
  if (place.temporaryClosed) {
    return {
      status: "TEMPORARILY_CLOSED",
      isOpen: false,
      label: "ปิดชั่วคราว",
      secondaryText: null,
      text: "ปิดชั่วคราว",
      closesAt: null,
      opensAt: null,
      nextOpenAt: null,
      tone: "amber",
    };
  }
  if (place.is24Hours) {
    return {
      status: "OPEN_24_HOURS",
      isOpen: true,
      label: "เปิด 24 ชม.",
      secondaryText: "เปิดตลอด 24 ชั่วโมง",
      text: "เปิด 24 ชั่วโมง",
      closesAt: null,
      opensAt: null,
      nextOpenAt: null,
      tone: "cyan",
    };
  }

  // Google Places live status is authoritative when present.
  if (place.liveOpenNow === true) {
    return {
      status: "OPEN",
      isOpen: true,
      label: "เปิดอยู่",
      secondaryText: null,
      text: "เปิดอยู่",
      closesAt: null,
      opensAt: null,
      nextOpenAt: null,
      tone: "green",
    };
  }
  if (place.liveOpenNow === false) {
    return {
      status: "CLOSED",
      isOpen: false,
      label: "ปิดแล้ว",
      secondaryText: null,
      text: "ปิดแล้ว",
      closesAt: null,
      opensAt: null,
      nextOpenAt: null,
      tone: "red",
    };
  }

  const current = bangkokDate(now);
  const dayIndex = current.getDay();
  const todayKey = DAY_KEYS[dayIndex];
  const previousKey = DAY_KEYS[(dayIndex + 6) % 7];
  const nowMinutes = current.getHours() * 60 + current.getMinutes();

  const todayPeriods = getPeriods(place, todayKey);
  const previousPeriods = getPeriods(place, previousKey);
  if (!todayPeriods.length && !previousPeriods.length) return statusUnknown();

  const candidates: { period: OpeningPeriod; fromPrevious: boolean }[] = [
    ...previousPeriods.map((period) => ({ period, fromPrevious: true })),
    ...todayPeriods.map((period) => ({ period, fromPrevious: false })),
  ];

  for (const { period, fromPrevious } of candidates) {
    const start = timeToMinutes(period.open);
    const end = timeToMinutes(period.close);
    if (start == null || end == null) continue;
    const overnight = end <= start;
    const isOpen = fromPrevious
      ? overnight && nowMinutes < end
      : overnight
        ? nowMinutes >= start
        : nowMinutes >= start && nowMinutes < end;
    if (!isOpen) continue;

    const minutesUntilClose = fromPrevious
      ? end - nowMinutes
      : overnight
        ? 24 * 60 - nowMinutes + end
        : end - nowMinutes;
    const closingSoon = minutesUntilClose >= 0 && minutesUntilClose <= 30;
    const secondaryText = `ปิด ${period.close}`;
    return {
      status: closingSoon ? "CLOSING_SOON" : "OPEN",
      isOpen: true,
      label: closingSoon ? "ใกล้ปิด" : "เปิดอยู่",
      secondaryText,
      text: `${closingSoon ? "ใกล้ปิด" : "เปิดอยู่"} • ${secondaryText}`,
      closesAt: period.close,
      opensAt: null,
      nextOpenAt: null,
      tone: closingSoon ? "amber" : "green",
    };
  }

  const nextToday = todayPeriods
    .map((period) => ({ period, start: timeToMinutes(period.open) }))
    .filter((item): item is { period: OpeningPeriod; start: number } => item.start != null && item.start > nowMinutes)
    .sort((a, b) => a.start - b.start)[0];

  if (nextToday) {
    const minutesUntilOpen = nextToday.start - nowMinutes;
    const openingSoon = minutesUntilOpen <= 30;
    return {
      status: openingSoon ? "OPENING_SOON" : "CLOSED",
      isOpen: false,
      label: openingSoon ? "ใกล้เปิด" : "ปิดแล้ว",
      secondaryText: `เปิดอีกครั้ง ${nextToday.period.open}`,
      text: `${openingSoon ? "ใกล้เปิด" : "ปิดแล้ว"} • เปิด ${nextToday.period.open}`,
      closesAt: null,
      opensAt: nextToday.period.open,
      nextOpenAt: nextToday.period.open,
      tone: openingSoon ? "amber" : "red",
    };
  }

  return {
    status: "CLOSED",
    isOpen: false,
    label: "ปิดแล้ว",
    secondaryText: "รอตารางเปิดวันถัดไป",
    text: "ปิดแล้ว",
    closesAt: null,
    opensAt: null,
    nextOpenAt: null,
    tone: "red",
  };
}

/** Backward-compatible alias used by the current components. */
export const getOpenStatus = getPlaceOpenStatus;

function inferredPricing(place: Place): Pricing | null {
  if (place.pricing) return place.pricing;
  if (place.minPrice != null || place.maxPrice != null) {
    return {
      type: "range",
      min: place.minPrice,
      max: place.maxPrice,
      fixed: null,
      unit: null,
      currency: "THB",
      displayText: place.priceText,
      verifiedAt: place.priceVerifiedAt ?? null,
    };
  }
  return null;
}

export function formatPrice(place: Place) {
  const pricing = inferredPricing(place);
  if (pricing?.displayText) return pricing.displayText;
  if (pricing?.type === "free") return "ฟรี";
  if (pricing?.fixed != null) {
    const suffix = pricing.type === "per_month" ? "/เดือน" : pricing.type === "per_hour" ? "/ชม." : pricing.type === "per_person" ? "/คน" : "";
    return `${pricing.fixed.toLocaleString("th-TH")} บาท${suffix}`;
  }
  if (pricing?.min != null || pricing?.max != null) {
    const min = pricing.min ?? 0;
    const max = pricing.max;
    return max != null ? `${min.toLocaleString("th-TH")}–${max.toLocaleString("th-TH")} บาท` : `เริ่ม ${min.toLocaleString("th-TH")} บาท`;
  }
  if (place.priceText) return place.priceText;
  if (place.priceLevel != null) return "฿".repeat(place.priceLevel);
  return "ยังไม่มีข้อมูลราคา";
}

export const priceLevelText = formatPrice;

function extractNumbers(text: string) {
  return [...text.matchAll(/\d[\d,]*/g)].map((match) => Number(match[0].replace(/,/g, ""))).filter(Number.isFinite);
}

export function getPlacePriceMax(place: Place) {
  if (place.pricing?.fixed != null) return place.pricing.fixed;
  if (place.pricing?.max != null) return place.pricing.max;
  if (place.pricing?.min != null && place.pricing.max == null) return place.pricing.min;
  if (place.maxPrice != null) return place.maxPrice;
  if (place.averagePricePerPerson != null) return place.averagePricePerPerson;
  if (place.priceText) {
    const values = extractNumbers(place.priceText);
    if (values.length) return Math.max(...values);
  }
  return null;
}

function thaiClockTo24(hourRaw: number, isTi: boolean) {
  if (isTi) {
    if (hourRaw === 5) return 5;
    return hourRaw % 6;
  }
  return hourRaw;
}

export function parseNaturalQuery(query: string): NaturalQuery {
  const lower = query.toLocaleLowerCase("th-TH").trim();
  const result: NaturalQuery = { freeText: lower };

  const price = lower.match(/(?:ไม่เกิน|ต่ำกว่า|ไม่เกินราคา|≤)\s*฿?\s*(\d[\d,]*)/);
  if (price) result.priceMax = Number(price[1].replace(/,/g, ""));

  const distance = lower.match(/(?:ไม่เกิน|ภายใน|≤)\s*(\d+(?:\.\d+)?)\s*(กม|km|กิโล)/);
  if (distance) result.distanceMaxKm = Number(distance[1]);

  const walking = lower.match(/เดิน(?:ไม่เกิน|ไม่เกินประมาณ|ประมาณ)?\s*(\d+)\s*นาที/);
  if (walking) result.walkingMaxMinutes = Number(walking[1]);

  const ti = lower.match(/(?:เปิด|ตอน|ถึง|หิวตอน)?\s*ตี\s*(\d{1,2})/);
  if (ti) {
    const hour = thaiClockTo24(Number(ti[1]), true);
    result.openAt = `${String(hour).padStart(2, "0")}:00`;
  }
  const explicitTime = lower.match(/(?:เปิด|ตอน|ถึง)\s*(\d{1,2}):(\d{2})/);
  if (explicitTime) result.openAt = `${explicitTime[1].padStart(2, "0")}:${explicitTime[2]}`;

  if (/คาเฟ่|กาแฟ/.test(lower)) result.category = "cafe";
  else if (/ก๋วยเตี๋ยว|เส้น|ราเมน/.test(lower)) result.category = "noodle";
  else if (/หมูกระทะ/.test(lower)) result.category = "mookata";
  else if (/ชาบู|สุกี้|หม้อไฟ/.test(lower)) result.category = "hotpot";
  else if (/ปิ้งย่าง|bbq/.test(lower)) result.category = "bbq";
  else if (/ญี่ปุ่น|ซูชิ/.test(lower)) result.category = "japanese";
  else if (/เกาหลี/.test(lower)) result.category = "korean_food";
  else if (/ที่จอด|parking/.test(lower)) result.category = "parking";
  else if (/ซักผ้า|laundry/.test(lower)) result.category = "laundry";
  else if (/ฟิตเนส|fitness|gym/.test(lower)) result.category = "fitness";
  else if (/ร้านยา|เภสัช/.test(lower)) result.category = "pharmacy";
  else if (/ข้าว|อาหาร|กิน|ของกิน/.test(lower)) result.category = "food";

  if (/นั่งทำงาน|ทำงานได้/.test(lower)) result.goodForWorking = true;
  if (/local|ร้านท้องถิ่น|ร้านโลคอล/.test(lower)) result.localOnly = true;
  if (/เปิดดึก|กลางคืน|ดึก/.test(lower)) result.openLate = true;
  if (/24\s*(ชม|ชั่วโมง)/.test(lower)) result.only24Hours = true;
  if (/delivery|เดลิเวอรี|เดลิเวอรี่|ส่งถึงห้อง/.test(lower)) result.delivery = true;
  if (/มีที่จอด|ที่จอดรถ/.test(lower)) result.parking = true;
  if (/ที่จอด.*รายเดือน|รายเดือน.*ที่จอด/.test(lower)) result.parkingMonthly = true;

  return result;
}

function isOpenAtTime(place: Place, target: string) {
  if (place.permanentlyClosed || place.temporaryClosed) return false;
  if (place.is24Hours) return true;
  const targetMinutes = timeToMinutes(target);
  if (targetMinutes == null) return false;
  const allPeriods = [
    ...Object.values(place.structuredOpeningHours || {}).flatMap((periods) => periods || []),
    ...Object.values(place.openingHours || {}).flatMap((value) => legacyPeriods(value)),
    ...legacyPeriods(place.openingHoursText),
  ];
  return allPeriods.some((period) => {
    const start = timeToMinutes(period.open);
    const end = timeToMinutes(period.close);
    if (start == null || end == null) return false;
    return end <= start
      ? targetMinutes >= start || targetMinutes < end
      : targetMinutes >= start && targetMinutes < end;
  });
}

function placeMatchesCategory(place: Place, category: string) {
  if (category === "food") return place.categories.some((item) => FOOD_CATEGORIES.has(item));
  return place.categories.includes(category as Place["category"]);
}

export function matchesNaturalQuery(place: Place, query: string) {
  const parsed = parseNaturalQuery(query);
  if (parsed.category && !placeMatchesCategory(place, parsed.category)) return false;
  if (parsed.priceMax != null) {
    const max = getPlacePriceMax(place);
    if (max == null || max > parsed.priceMax) return false;
  }
  if (parsed.distanceMaxKm != null && (place.distanceKm == null || place.distanceKm > parsed.distanceMaxKm)) return false;
  if (parsed.walkingMaxMinutes != null && (place.walkingMinutes == null || place.walkingMinutes > parsed.walkingMaxMinutes)) return false;
  if (parsed.openAt && !isOpenAtTime(place, parsed.openAt)) return false;
  if (parsed.goodForWorking && place.goodForWorking !== true) return false;
  if (parsed.localOnly && !(place.placeType === "local" || place.placeType === "independent" || place.localFavorite)) return false;
  if (parsed.openLate && place.openLate !== true && !place.is24Hours) return false;
  if (parsed.only24Hours && !place.is24Hours) return false;
  if (parsed.delivery && place.delivery !== true && !(place.deliveryPlatforms?.length)) return false;
  if (parsed.parking && place.parking.available !== true && !place.parkingDetails) return false;
  if (parsed.parkingMonthly && place.parkingDetails?.parkingType !== "monthly" && place.parkingDetails?.parkingType !== "mixed" && !/รายเดือน/.test(place.parking.type || "")) return false;
  return true;
}

export function matchesSearch(place: Place, query: string) {
  const q = normalizeText(query);
  if (!q) return true;
  const parsed = parseNaturalQuery(query);
  const hasNaturalConstraint = Object.keys(parsed).some((key) => key !== "freeText");
  if (hasNaturalConstraint && !matchesNaturalQuery(place, query)) return false;

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
      place.menuItems?.map((item) => item.name).join(" ") || "",
      place.is24Hours ? "24 ชั่วโมง 24ชม เปิด24ชั่วโมง" : "",
      place.openLate ? "เปิดดึก ของกินดึก" : "",
      place.goodForWorking ? "นั่งทำงาน ทำงานได้" : "",
      place.studentFriendly ? "นักศึกษา student" : "",
      place.placeType || "",
      place.parkingDetails?.parkingType || "",
    ].join(" "),
  );

  // For natural-language requests the structured constraints are enough. Otherwise
  // retain the original substring behavior.
  return hasNaturalConstraint ? true : searchable.includes(q);
}

export function calculateLocalScore(place: Place) {
  const factors: { value: number; weight: number }[] = [];
  if (place.rating != null) factors.push({ value: Math.max(0, Math.min(100, (place.rating / 5) * 100)), weight: 0.3 });
  if (place.reviewCount != null) factors.push({ value: Math.min(100, Math.log10(place.reviewCount + 1) * 32), weight: 0.2 });
  if (place.distanceKm != null) factors.push({ value: Math.max(0, 100 - place.distanceKm * 16), weight: 0.15 });
  const priceMax = getPlacePriceMax(place);
  if (priceMax != null) factors.push({ value: Math.max(0, 100 - Math.min(100, priceMax / 10)), weight: 0.1 });
  if (place.placeType || place.localFavorite) {
    factors.push({ value: place.placeType === "local" || place.placeType === "independent" || place.localFavorite ? 100 : 35, weight: 0.1 });
  }
  if (place.localFavorite || place.recommended) factors.push({ value: 85, weight: 0.1 });

  if (!factors.length) return null;
  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  return Math.round(factors.reduce((sum, factor) => sum + factor.value * factor.weight, 0) / totalWeight);
}

export function getDataFreshness(date: string | null | undefined, staleDays: number) {
  if (!date) return { stale: true, ageDays: null as number | null };
  const checked = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(checked.getTime())) return { stale: true, ageDays: null as number | null };
  const ageDays = Math.floor((Date.now() - checked.getTime()) / 86_400_000);
  return { stale: ageDays > staleDays, ageDays };
}

export function getParkingStatus(place: Place): { status: ParkingAvailabilityStatus; label: string } {
  const details = place.parkingDetails;
  const freshness = getDataFreshness(details?.availabilityVerifiedAt ?? place.parkingVerifiedAt, 7);
  if (!details) return { status: "unknown", label: "สถานะพื้นที่จอดยังไม่ยืนยัน" };
  if (freshness.stale && details.availabilityStatus === "available") return { status: "call_to_confirm", label: "ต้องโทรถามพื้นที่ว่าง" };
  if (details.availabilityStatus === "available") return { status: "available", label: "มีที่ว่าง" };
  if (details.availabilityStatus === "full") return { status: "full", label: "เต็ม" };
  if (details.availabilityStatus === "call_to_confirm") return { status: "call_to_confirm", label: "ต้องโทรถาม" };
  return { status: "unknown", label: "ยังไม่ยืนยัน" };
}

export function dedupePlaces(places: Place[]) {
  const seen = new Set<string>();
  return places.filter((place) => {
    const key = place.googlePlaceId
      ? `google:${place.googlePlaceId}`
      : `${normalizePlaceName(place.name)}:${normalizeText(place.address || place.area)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
