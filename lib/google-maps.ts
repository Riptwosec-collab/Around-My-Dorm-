import type { CategoryId, DayKey, OpeningHours, OpeningPeriod, Place, StructuredOpeningHours, PlaceImage} from "@/types/place";
import { DORM_CENTER, googleMapsSearchUrl, withDistance } from "@/lib/place-utils";
import { selectBestPlaceImage } from "@/lib/place-images";

const EMPTY_HOURS: OpeningHours = {
  monday: null,
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};

declare global {
  interface Window {
    google: any;
    __aroundDormMapsPromise?: Promise<void>;
  }
}

export function loadGoogleMaps(apiKey: string) {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser only"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__aroundDormMapsPromise) return window.__aroundDormMapsPromise;

  window.__aroundDormMapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      "&v=weekly&libraries=marker&language=th&region=TH";
    script.onload = () => { if (window.google?.maps) resolve(); else { delete window.__aroundDormMapsPromise; reject(new Error("Google Maps initialized without maps library")); } };
    script.onerror = () => { delete window.__aroundDormMapsPromise; reject(new Error("Google Maps load failed")); };
    document.head.appendChild(script);
  });

  return window.__aroundDormMapsPromise;
}

function categoryFromGoogleType(type?: string): CategoryId {
  if (!type) return "other";
  if (type.includes("japanese")) return "japanese";
  if (type.includes("thai_restaurant")) return "thai_food";
  if (type === "cafe" || type === "coffee_shop") return "cafe";
  if (type === "bar" || type.includes("bar")) return "bar";
  if (type === "convenience_store") return "convenience";
  if (type === "supermarket" || type === "grocery_store") return "supermarket";
  if (type === "pharmacy" || type === "drugstore") return "pharmacy";
  if (type === "laundry") return "laundry";
  if (type === "hair_salon" || type === "beauty_salon") return "salon";
  if (type === "gym" || type === "fitness_center") return "fitness";
  if (type === "parking") return "parking";
  if (type.includes("restaurant") || type === "meal_takeaway") return "food";
  return "other";
}

function toPriceLevel(value: unknown): 1 | 2 | 3 | 4 | null {
  const text = String(value ?? "").toUpperCase();
  if (text.includes("INEXPENSIVE")) return 1;
  if (text.includes("MODERATE")) return 2;
  if (text.includes("VERY_EXPENSIVE")) return 4;
  if (text.includes("EXPENSIVE")) return 3;
  return null;
}

function locationLiteral(location: any) {
  if (!location) return null;
  const lat = typeof location.lat === "function" ? location.lat() : location.lat;
  const lng = typeof location.lng === "function" ? location.lng() : location.lng;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

const GOOGLE_DAY_KEYS: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function googleTime(value: any) {
  if (!value || !Number.isFinite(value.hour)) return null;
  const hour = String(value.hour).padStart(2, "0");
  const minute = String(Number.isFinite(value.minute) ? value.minute : 0).padStart(2, "0");
  return `${hour}:${minute}`;
}

function structuredHoursFromGoogle(hours: any): StructuredOpeningHours | undefined {
  const periods = Array.isArray(hours?.periods) ? hours.periods : [];
  if (!periods.length) return undefined;
  const result: StructuredOpeningHours = {};
  for (const period of periods) {
    const openDay = Number(period?.open?.day);
    const open = googleTime(period?.open);
    const close = googleTime(period?.close);
    if (!Number.isInteger(openDay) || openDay < 0 || openDay > 6 || !open || !close) continue;
    const key = GOOGLE_DAY_KEYS[openDay];
    const current = result[key] || [];
    (current as OpeningPeriod[]).push({ open, close });
    result[key] = current;
  }
  return Object.keys(result).length ? result : undefined;
}

function isGoogle24Hours(hours: any) {
  const descriptions = Array.isArray(hours?.weekdayDescriptions) ? hours.weekdayDescriptions.map(String) : [];
  return descriptions.length >= 7 && descriptions.every((line: string) => /24\s*(hours?|hrs?|ชม\.?)/i.test(line));
}

export function mapGooglePlace(raw: any): Place {
  const location = locationLiteral(raw.location);
  const primaryType = raw.primaryType || "";
  const category = categoryFromGoogleType(primaryType);
  const structuredOpeningHours = structuredHoursFromGoogle(raw.currentOpeningHours);
  const openingHoursText = Array.isArray(raw.currentOpeningHours?.weekdayDescriptions) ? raw.currentOpeningHours.weekdayDescriptions.join(" | ") : null;
  const imageMetadata: PlaceImage[] = (raw.photos || []).slice(0, 8).map((photo: any) => {
    let url = "";
    try { url = photo.getURI?.({ maxWidth: 1200, maxHeight: 900 }) || ""; } catch {}
    const attribution = Array.isArray(photo.authorAttributions) ? photo.authorAttributions.map((item: any) => item.displayName).filter(Boolean).join(", ") : null;
    return { url, source: "google_places" as const, photoReference: photo.name || null, attribution: attribution || null, width: typeof photo.widthPx === "number" ? photo.widthPx : null, height: typeof photo.heightPx === "number" ? photo.heightPx : null, verified: true };
  }).filter((photo: PlaceImage) => Boolean(photo.url));
  const bestPhoto = imageMetadata.length ? selectBestPlaceImage({ ...({} as Place), imageMetadata }) : null;
  const image = bestPhoto?.url || null;

  const base: Place = {
    id: `google-${raw.id}`,
    googlePlaceId: raw.id || null,
    name: raw.displayName || "สถานที่ใกล้เคียง",
    nameEn: null,
    slug: `google-${String(raw.id || "place").toLowerCase()}`,
    category,
    categories: [category],
    subcategory: raw.primaryTypeDisplayName || primaryType || null,
    shortDescription: raw.primaryTypeDisplayName || "ข้อมูลจาก Google Places",
    description: "ข้อมูลสดจาก Google Places API",
    address: raw.formattedAddress || null,
    area: "รอบบ้านสุภาอพาร์ทเม้นต์",
    soi: null,
    latitude: location?.lat ?? null,
    longitude: location?.lng ?? null,
    distanceKm: null,
    walkingMinutes: null,
    drivingMinutes: null,
    openingHours: { ...EMPTY_HOURS },
    is24Hours: isGoogle24Hours(raw.currentOpeningHours),
    structuredOpeningHours,
    openingHoursText,
    liveOpenNow:
      typeof raw.currentOpeningHours?.openNow === "boolean"
        ? raw.currentOpeningHours.openNow
        : null,
    priceLevel: toPriceLevel(raw.priceLevel),
    priceText: null,
    averagePricePerPerson: null,
    minPrice: null,
    maxPrice: null,
    popularMenus: [],
    recommendedItems: [],
    tags: [raw.primaryTypeDisplayName || primaryType || "Google Places"].filter(Boolean),
    rating: typeof raw.rating === "number" ? raw.rating : null,
    reviewCount: typeof raw.userRatingCount === "number" ? raw.userRatingCount : null,
    phone: raw.nationalPhoneNumber || null,
    line: null,
    facebook: null,
    instagram: null,
    website: raw.websiteURI || null,
    googleMapsUrl: raw.googleMapsURI || googleMapsSearchUrl(raw.displayName || "สถานที่", raw.formattedAddress),
    image,
    coverImage: image,
    images: imageMetadata.map((photo) => photo.url),
    galleryImages: imageMetadata.map((photo) => photo.url),
    imageSource: image ? "Google Places" : null,
    imageAttribution: bestPhoto?.attribution ?? null,
    imageVerifiedAt: image ? new Date().toISOString().slice(0, 10) : null,
    imageMetadata,
    paymentMethods: [],
    delivery: raw.delivery ?? null,
    deliveryApps: [],
    dineIn: raw.dineIn ?? null,
    takeaway: raw.takeout ?? null,
    parking: {
      available: null,
      type: null,
      price: null,
      note: null,
    },
    airConditioned: null,
    wifi: null,
    powerOutlet: null,
    toilet: null,
    petFriendly: null,
    wheelchairAccessible: raw.accessibilityOptions?.wheelchairAccessibleEntrance ?? null,
    openLate: null,
    studentFriendly: null,
    goodForWorking: null,
    recommended: false,
    localFavorite: false,
    verified: true,
    lastVerified: new Date().toISOString().slice(0, 10),
    source: ["Google Places API"],
    notes: "ข้อมูลสดอาจเปลี่ยนแปลงได้ กรุณาตรวจสอบกับร้านก่อนเดินทาง",
  };

  return withDistance(base, DORM_CENTER);
}

export const GOOGLE_PLACE_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "priceLevel",
  "primaryType",
  "primaryTypeDisplayName",
  "photos",
  "googleMapsURI",
  "currentOpeningHours",
  "nationalPhoneNumber",
  "websiteURI",
  "delivery",
  "dineIn",
  "takeout",
  "accessibilityOptions",
];
