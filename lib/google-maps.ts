import type { CategoryId, OpeningHours, Place } from "@/types/place";
import { DORM_CENTER, googleMapsSearchUrl, withDistance } from "@/lib/place-utils";

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
      "&v=weekly&libraries=places,marker&language=th&region=TH";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps load failed"));
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

export function mapGooglePlace(raw: any): Place {
  const location = locationLiteral(raw.location);
  const primaryType = raw.primaryType || "";
  const category = categoryFromGoogleType(primaryType);
  let image: string | null = null;
  try {
    image = raw.photos?.[0]?.getURI?.({ maxWidth: 1000, maxHeight: 720 }) || null;
  } catch {}

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
    is24Hours: false,
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
    images: image ? [image] : [],
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
