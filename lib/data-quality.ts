import type { Place } from "@/types/place";

export type DataQualityGrade = "A" | "B" | "C" | "D";
export type PlaceDataQuality = {
  score: number;
  grade: DataQualityGrade;
  completed: number;
  total: number;
  missing: string[];
  dimensions: {
    identity: number;
    location: number;
    operations: number;
    contact: number;
    commercial: number;
    media: number;
    verification: number;
  };
};

function filled(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function openingKnown(place: Place) {
  return place.is24Hours || filled(place.openingHoursText) || Object.values(place.openingHours || {}).some(Boolean);
}

function priceKnown(place: Place) {
  return filled(place.priceText) || place.minPrice != null || place.maxPrice != null || place.averagePricePerPerson != null || filled(place.pricing?.displayText);
}

function photoKnown(place: Place) {
  return filled(place.coverImage) || filled(place.image) || (place.imageMetadata?.some((image) => image.verified && (filled(image.url) || filled(image.photoReference))) ?? false) || place.images.length > 0;
}

function points(checks: Array<[string, boolean, number]>) {
  const max = checks.reduce((sum, [, , weight]) => sum + weight, 0);
  const score = checks.reduce((sum, [, ok, weight]) => sum + (ok ? weight : 0), 0);
  return max ? Math.round((score / max) * 100) : 0;
}

export function scorePlaceDataQuality(place: Place): PlaceDataQuality {
  const checks: Array<[string, boolean, number]> = [
    ["name", filled(place.name), 8],
    ["category", filled(place.category) && place.categories.length > 0, 5],
    ["googlePlaceId", filled(place.googlePlaceId), 5],
    ["coordinates", place.latitude != null && place.longitude != null, 10],
    ["address", filled(place.address), 6],
    ["area", filled(place.area), 3],
    ["openingHours", openingKnown(place), 9],
    ["phone", filled(place.phone), 5],
    ["price", priceKnown(place), 6],
    ["photo", photoKnown(place), 8],
    ["description", filled(place.shortDescription) || filled(place.description), 4],
    ["parking", place.parking.available !== null || Boolean(place.parkingDetails), 4],
    ["verified", place.verified, 9],
    ["freshness", filled(place.lastChecked) || filled(place.lastUpdated) || filled(place.lastVerified), 7],
    ["provenance", Boolean(place.fieldProvenance && Object.keys(place.fieldProvenance).length), 6],
    ["source", place.source.length > 0, 5],
  ];
  const max = checks.reduce((sum, [, , weight]) => sum + weight, 0);
  const earned = checks.reduce((sum, [, ok, weight]) => sum + (ok ? weight : 0), 0);
  const score = Math.round((earned / max) * 100);
  const grade: DataQualityGrade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D";
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return {
    score,
    grade,
    completed: checks.length - missing.length,
    total: checks.length,
    missing,
    dimensions: {
      identity: points(checks.filter(([name]) => ["name", "category", "googlePlaceId"].includes(name))),
      location: points(checks.filter(([name]) => ["coordinates", "address", "area"].includes(name))),
      operations: points(checks.filter(([name]) => ["openingHours", "parking"].includes(name))),
      contact: points(checks.filter(([name]) => ["phone"].includes(name))),
      commercial: points(checks.filter(([name]) => ["price", "description"].includes(name))),
      media: points(checks.filter(([name]) => ["photo"].includes(name))),
      verification: points(checks.filter(([name]) => ["verified", "freshness", "provenance", "source"].includes(name))),
    },
  };
}

export function buildDataCompletenessDashboard(places: Place[]) {
  const scored = places.map((place) => ({ place, quality: scorePlaceDataQuality(place) }));
  const average = scored.length ? Math.round(scored.reduce((sum, item) => sum + item.quality.score, 0) / scored.length) : 0;
  const missingCounts = new Map<string, number>();
  for (const item of scored) for (const field of item.quality.missing) missingCounts.set(field, (missingCounts.get(field) || 0) + 1);
  return {
    average,
    excellent: scored.filter((item) => item.quality.grade === "A").length,
    good: scored.filter((item) => item.quality.grade === "B").length,
    needsWork: scored.filter((item) => item.quality.grade === "C" || item.quality.grade === "D").length,
    missingPlaceId: scored.filter((item) => item.quality.missing.includes("googlePlaceId")).length,
    missingPhoto: scored.filter((item) => item.quality.missing.includes("photo")).length,
    missingHours: scored.filter((item) => item.quality.missing.includes("openingHours")).length,
    missingPhone: scored.filter((item) => item.quality.missing.includes("phone")).length,
    topMissing: [...missingCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    scored,
  };
}

export function dataAgeDays(place: Place, now = Date.now()) {
  const raw = place.lastChecked || place.lastUpdated || place.lastVerified;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now - time) / 86_400_000));
}

export function dataAgeLabel(place: Place, language: "th" | "en", now = Date.now()) {
  const days = dataAgeDays(place, now);
  if (days == null) return language === "en" ? "Not checked yet" : "ยังไม่เคยตรวจข้อมูล";
  if (days === 0) return language === "en" ? "Updated today" : "อัปเดตวันนี้";
  if (days === 1) return language === "en" ? "Updated yesterday" : "อัปเดตเมื่อวาน";
  return language === "en" ? `Updated ${days} days ago` : `อัปเดต ${days} วันที่แล้ว`;
}
