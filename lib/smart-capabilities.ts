import { recommendationScore, explicitPriceCeiling, type RecommendationContext } from "@/lib/place-ranking";
import { getPlaceOpenStatus, googleMapsDirectionsUrl, haversineKm, parseNaturalQuery } from "@/lib/place-utils";
import type { CategoryId, Place } from "@/types/place";

export type SmartContextMode = "breakfast" | "lunch" | "afternoon" | "dinner" | "late";
export type CrowdLevel = "quiet" | "normal" | "busy" | "unknown";

export type SmartPickOptions = {
  budget?: number | null;
  maxDistanceKm?: number | null;
  openNow?: boolean;
  localOnly?: boolean;
  goodForWorking?: boolean;
  parkingRequired?: boolean;
  categories?: CategoryId[];
  limit?: number;
  now?: Date;
};

export function bangkokContextMode(now = new Date()): SmartContextMode {
  const hourText = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Bangkok" }).format(now);
  const hour = Number(hourText);
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 14) return "lunch";
  if (hour >= 14 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "dinner";
  return "late";
}

export function smartContextReasons(place: Place, language: "th" | "en" = "th", now = new Date()) {
  const status = getPlaceOpenStatus(place, now);
  const mode = bangkokContextMode(now);
  const reasons: string[] = [];
  if (status.status === "CLOSING_SOON") reasons.push(language === "en" ? `Closing soon${status.closesAt ? ` ${status.closesAt}` : ""}` : `ใกล้ปิด${status.closesAt ? ` ${status.closesAt}` : ""}`);
  else if (status.isOpen === true) reasons.push(language === "en" ? "Open now" : "เปิดอยู่ตอนนี้");
  if (place.distanceKm != null && place.distanceKm <= 0.5) reasons.push(language === "en" ? "Walkable nearby" : "อยู่ใกล้ เดินทางสะดวก");
  if (mode === "late" && (place.openLate || place.is24Hours)) reasons.push(language === "en" ? "Fits late-night use" : "เหมาะกับช่วงดึก");
  if (mode === "afternoon" && place.category === "cafe") reasons.push(language === "en" ? "Good afternoon cafe" : "เหมาะกับช่วงบ่าย");
  if (place.goodForWorking) reasons.push(language === "en" ? "Good for working" : "เหมาะนั่งทำงาน");
  if (place.hiddenGem) reasons.push("Hidden Gem");
  if (place.localFavorite || place.placeType === "local" || place.placeType === "independent") reasons.push(language === "en" ? "Local pick" : "ร้าน Local");
  if (place.verified) reasons.push(language === "en" ? "Verified data" : "ข้อมูลยืนยันแล้ว");
  return Array.from(new Set(reasons)).slice(0, 4);
}

export function smartNearby(places: Place[], context: RecommendationContext = {}, options: SmartPickOptions = {}) {
  const now = options.now ?? context.now ?? new Date();
  const categories = options.categories?.length ? new Set(options.categories) : null;
  return places
    .filter((place) => {
      if (place.permanentlyClosed) return false;
      if (categories && !place.categories.some((category) => categories.has(category))) return false;
      if (options.openNow && getPlaceOpenStatus(place, now).isOpen !== true) return false;
      if (options.localOnly && !(place.localFavorite || place.hiddenGem || place.placeType === "local" || place.placeType === "independent")) return false;
      if (options.goodForWorking && place.goodForWorking !== true) return false;
      if (options.parkingRequired && place.parking.available !== true && !place.parkingDetails) return false;
      if (options.maxDistanceKm != null && (place.distanceKm == null || place.distanceKm > options.maxDistanceKm)) return false;
      if (options.budget != null) {
        const ceiling = explicitPriceCeiling(place);
        if (ceiling == null || ceiling > options.budget) return false;
      }
      return true;
    })
    .map((place) => {
      let score = recommendationScore(place, { ...context, now });
      const status = getPlaceOpenStatus(place, now);
      if (status.status === "CLOSING_SOON") score -= 8;
      if (status.status === "OPENING_SOON") score += 2;
      if (options.budget != null) {
        const price = explicitPriceCeiling(place);
        if (price != null) score += Math.max(0, 8 - (price / Math.max(1, options.budget)) * 6);
      }
      if (options.parkingRequired && (place.parking.available === true || place.parkingDetails)) score += 8;
      return { place, score };
    })
    .sort((a, b) => b.score - a.score || (a.place.distanceKm ?? 999) - (b.place.distanceKm ?? 999))
    .slice(0, options.limit ?? 5);
}

export function naturalIntentSummary(query: string, language: "th" | "en" = "th") {
  const intent = parseNaturalQuery(query);
  const parts: string[] = [];
  if (intent.category) parts.push(intent.category);
  if (intent.priceMax != null) parts.push(language === "en" ? `≤ ฿${intent.priceMax}` : `ไม่เกิน ${intent.priceMax} บาท`);
  if (intent.distanceMaxKm != null) parts.push(language === "en" ? `≤ ${intent.distanceMaxKm} km` : `ภายใน ${intent.distanceMaxKm} กม.`);
  if (intent.walkingMaxMinutes != null) parts.push(language === "en" ? `walk ≤ ${intent.walkingMaxMinutes} min` : `เดินไม่เกิน ${intent.walkingMaxMinutes} นาที`);
  if (intent.openAt) parts.push(language === "en" ? `open at ${intent.openAt}` : `เปิดช่วง ${intent.openAt}`);
  if (intent.openLate) parts.push(language === "en" ? "late-night" : "เปิดดึก");
  if (intent.only24Hours) parts.push("24h");
  if (intent.localOnly) parts.push("LOCAL");
  if (intent.goodForWorking) parts.push(language === "en" ? "work-friendly" : "นั่งทำงาน");
  if (intent.parking) parts.push(language === "en" ? "parking" : "มีที่จอด");
  return parts;
}

export function comparePlaces(places: Place[]) {
  return places.slice(0, 4).map((place) => {
    const status = getPlaceOpenStatus(place);
    return {
      id: place.id,
      name: place.name,
      category: place.category,
      distanceKm: place.distanceKm,
      walkingMinutes: place.distance?.walkingMinutes ?? place.walkingMinutes,
      drivingMinutes: place.distance?.drivingMinutes ?? place.drivingMinutes,
      priceMax: explicitPriceCeiling(place),
      rating: place.rating,
      reviewCount: place.reviewCount,
      openStatus: status.label,
      parking: place.parking.available === true || Boolean(place.parkingDetails),
      verified: place.verified,
      local: Boolean(place.localFavorite || place.hiddenGem || place.placeType === "local" || place.placeType === "independent"),
    };
  });
}

export function tripOrder(places: Place[], origin: { lat: number; lng: number }) {
  const remaining = places.filter((place) => place.latitude != null && place.longitude != null).slice(0, 5);
  const ordered: Place[] = [];
  let cursor = origin;
  while (remaining.length) {
    remaining.sort((a, b) => haversineKm(cursor, { lat: a.latitude as number, lng: a.longitude as number }) - haversineKm(cursor, { lat: b.latitude as number, lng: b.longitude as number }));
    const next = remaining.shift() as Place;
    ordered.push(next);
    cursor = { lat: next.latitude as number, lng: next.longitude as number };
  }
  return ordered;
}

export function tripDistanceKm(places: Place[], origin: { lat: number; lng: number }) {
  let cursor = origin;
  let total = 0;
  for (const place of places) {
    if (place.latitude == null || place.longitude == null) continue;
    const next = { lat: place.latitude, lng: place.longitude };
    total += haversineKm(cursor, next);
    cursor = next;
  }
  return total;
}

export function dormLifePlaces(places: Place[]) {
  const categories = new Set<CategoryId>(["laundry", "pharmacy", "clinic", "hospital", "convenience", "supermarket", "market", "parcel", "post_office", "copy_print", "atm", "bank", "water", "dorm_supplies", "hardware", "fitness", "parking", "monthly_parking", "mobile_repair", "computer_repair"]);
  return places.filter((place) => place.categories.some((category) => categories.has(category))).sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
}

export function emergencyPlaces(places: Place[]) {
  const categories = new Set<CategoryId>(["hospital", "clinic", "pharmacy", "gas_station", "ev_charger", "auto_repair", "tire_shop"]);
  return places
    .filter((place) => place.categories.some((category) => categories.has(category)) && !place.permanentlyClosed)
    .sort((a, b) => {
      const openA = getPlaceOpenStatus(a).isOpen === true ? 0 : 1;
      const openB = getPlaceOpenStatus(b).isOpen === true ? 0 : 1;
      return openA - openB || (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
    });
}

export function parkingIntelligence(place: Place) {
  const details = place.parkingDetails;
  const monthly = details?.monthlyPrice ?? null;
  const hourly = details?.hourlyPrice ?? null;
  const available = details?.availabilityStatus ?? (place.parking.available === true ? "available" : place.parking.available === false ? "full" : "unknown");
  return {
    available,
    monthlyPrice: monthly,
    hourlyPrice: hourly,
    access24Hours: details?.access24Hours ?? null,
    cctv: details?.cctv ?? null,
    securityGuard: details?.securityGuard ?? null,
    covered: details?.coveredParking ?? null,
    evCharging: details?.evCharging ?? null,
    note: place.parking.note,
  };
}

export function routeOptions(place: Place) {
  const base = googleMapsDirectionsUrl(place);
  const walking = place.distance?.walkingMinutes ?? place.walkingMinutes ?? null;
  const driving = place.distance?.drivingMinutes ?? place.drivingMinutes ?? null;
  return [
    { mode: "walking" as const, label: "เดิน", minutes: walking, url: `${base}&travelmode=walking` },
    { mode: "driving" as const, label: "รถยนต์", minutes: driving, url: `${base}&travelmode=driving` },
  ];
}

export function freshnessInsight(place: Place, now = new Date()) {
  const raw = place.lastChecked || place.lastUpdated || place.lastVerified || null;
  if (!raw) return { state: "unknown" as const, ageDays: null, label: "ยังไม่เคยตรวจสอบ" };
  const time = new Date(raw).getTime();
  if (!Number.isFinite(time)) return { state: "unknown" as const, ageDays: null, label: "ไม่ทราบวันที่ตรวจสอบ" };
  const ageDays = Math.max(0, Math.floor((now.getTime() - time) / 86_400_000));
  const state = ageDays <= 30 ? "fresh" as const : ageDays <= 90 ? "aging" as const : "stale" as const;
  return { state, ageDays, label: ageDays === 0 ? "อัปเดตวันนี้" : `อัปเดต ${ageDays} วันที่แล้ว` };
}

export function photoBuckets(place: Place) {
  return {
    cover: place.coverImage || place.image || place.images[0] || null,
    gallery: (place.galleryImages?.length ? place.galleryImages : place.images).slice(0, 12),
    menu: (place.menuImages || []).slice(0, 12),
    parking: (place.parkingImages || []).slice(0, 12),
  };
}

export function crowdEstimate(checkins: Array<{ crowdLevel: CrowdLevel; checkedInAt: string }>, now = new Date()) {
  const cutoff = now.getTime() - 2 * 60 * 60 * 1000;
  const recent = checkins.filter((item) => new Date(item.checkedInAt).getTime() >= cutoff && item.crowdLevel !== "unknown");
  if (!recent.length) return { level: "unknown" as CrowdLevel, samples: 0 };
  const weight = { quiet: 0, normal: 1, busy: 2, unknown: 1 } as const;
  const average = recent.reduce((sum, item) => sum + weight[item.crowdLevel], 0) / recent.length;
  const level: CrowdLevel = average < 0.6 ? "quiet" : average > 1.4 ? "busy" : "normal";
  return { level, samples: recent.length };
}
