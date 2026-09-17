import type { FieldProvenanceEntry, Place } from "@/types/place";

export type FreshnessField = "openingHours" | "price" | "parking" | "contact" | "location" | "image";
export type FreshnessStatus = "fresh" | "aging" | "stale" | "unknown";

export type FieldFreshness = {
  status: FreshnessStatus;
  ageDays: number | null;
  verifiedAt: string | null;
};

type Threshold = { fresh: number; aging?: number };

const THRESHOLDS: Record<FreshnessField, Threshold> = {
  openingHours: { fresh: 14, aging: 30 },
  price: { fresh: 30, aging: 60 },
  parking: { fresh: 30, aging: 60 },
  contact: { fresh: 90 },
  location: { fresh: 180 },
  image: { fresh: 180 },
};

const FIELD_TIMESTAMPS: Record<FreshnessField, keyof Place> = {
  openingHours: "openingHoursVerifiedAt",
  price: "priceVerifiedAt",
  parking: "parkingVerifiedAt",
  contact: "phoneVerifiedAt",
  location: "locationVerifiedAt",
  image: "imageVerifiedAt",
};

const PROVENANCE_KEYS: Record<FreshnessField, string[]> = {
  openingHours: ["openingHours", "structuredOpeningHours", "openingHoursText", "is24Hours"],
  price: ["price", "pricing", "priceText", "minPrice", "maxPrice", "averagePricePerPerson", "priceLevel"],
  parking: ["parking", "parkingDetails"],
  contact: ["contact", "phone", "line", "facebook", "instagram", "website"],
  location: ["location", "address", "latitude", "longitude", "googleMapsUrl"],
  image: ["image", "coverImage", "images", "galleryImages", "imageMetadata"],
};

function provenanceTimestamp(entry: FieldProvenanceEntry | undefined) {
  if (!entry) return null;
  return entry.verifiedAt || entry.checkedAt || null;
}

function resolveProvenanceTimestamp(place: Place, field: FreshnessField) {
  const provenance = place.fieldProvenance;
  if (!provenance) return null;

  for (const key of PROVENANCE_KEYS[field]) {
    const timestamp = provenanceTimestamp(provenance[key]);
    if (timestamp) return timestamp;
  }
  return null;
}

function resolveTimestamp(place: Place, field: FreshnessField) {
  const provenanceTimestampValue = resolveProvenanceTimestamp(place, field);
  if (provenanceTimestampValue) return provenanceTimestampValue;

  const value = place[FIELD_TIMESTAMPS[field]];
  return typeof value === "string" && value.trim() ? value : null;
}

function validTimestamp(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getFieldFreshness(place: Place, field: FreshnessField, now = new Date()): FieldFreshness {
  const rawTimestamp = resolveTimestamp(place, field);
  const verified = validTimestamp(rawTimestamp);
  if (!verified || Number.isNaN(now.getTime())) {
    return { status: "unknown", ageDays: null, verifiedAt: null };
  }

  const ageMs = Math.max(0, now.getTime() - verified.getTime());
  const ageDays = Math.floor(ageMs / 86_400_000);
  const threshold = THRESHOLDS[field];

  if (ageDays <= threshold.fresh) {
    return { status: "fresh", ageDays, verifiedAt: rawTimestamp };
  }
  if (threshold.aging != null && ageDays <= threshold.aging) {
    return { status: "aging", ageDays, verifiedAt: rawTimestamp };
  }
  return { status: "stale", ageDays, verifiedAt: rawTimestamp };
}

export function formatFreshnessLabel(result: FieldFreshness, language: "th" | "en") {
  if (result.status === "unknown" || result.ageDays == null) {
    return language === "en" ? "Not verified yet" : "ยังไม่เคยยืนยัน";
  }
  if (language === "en") {
    const unit = result.ageDays === 1 ? "day" : "days";
    return `Verified ${result.ageDays} ${unit} ago`;
  }
  return `ยืนยัน ${result.ageDays} วันที่แล้ว`;
}
