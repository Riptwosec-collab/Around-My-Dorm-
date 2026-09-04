import { PLACES as BASE_PLACES } from "./places";
import { EXPANSION_PACK_02 } from "./expansion-pack-02";
import type { Place } from "@/types/place";

function normalize(value: string | null | undefined) {
  return (value || "")
    .toLocaleLowerCase("th-TH")
    .replace(/[\s._\-–—'"()]/g, "")
    .trim();
}

function sameCoordinates(a: Place, b: Place) {
  if (
    a.latitude == null ||
    a.longitude == null ||
    b.latitude == null ||
    b.longitude == null
  ) {
    return false;
  }
  return (
    Math.abs(a.latitude - b.latitude) < 0.00005 &&
    Math.abs(a.longitude - b.longitude) < 0.00005
  );
}

function isDuplicate(a: Place, b: Place) {
  if (a.googlePlaceId && b.googlePlaceId && a.googlePlaceId === b.googlePlaceId) {
    return true;
  }

  const sameName = normalize(a.name) === normalize(b.name);
  const sameAddress =
    Boolean(a.address && b.address) &&
    normalize(a.address) === normalize(b.address);
  const sameArea = normalize(a.area) === normalize(b.area);
  const samePhone =
    Boolean(a.phone && b.phone) &&
    normalize(a.phone) === normalize(b.phone);

  return (
    (sameName && (sameAddress || sameArea)) ||
    sameCoordinates(a, b) ||
    samePhone
  );
}

function mergePlace(existing: Place, incoming: Place): Place {
  const incomingIsNewer =
    Boolean(incoming.lastVerified) &&
    (!existing.lastVerified ||
      String(incoming.lastVerified) >= String(existing.lastVerified));

  if (!incomingIsNewer) {
    return {
      ...existing,
      source: Array.from(new Set([...existing.source, ...incoming.source])),
      dataSources: [
        ...(existing.dataSources || []),
        ...(incoming.dataSources || []),
      ],
      tags: Array.from(new Set([...existing.tags, ...incoming.tags])),
    };
  }

  return {
    ...existing,
    nameEn: incoming.nameEn || existing.nameEn,
    subcategory: incoming.subcategory || existing.subcategory,
    shortDescription:
      incoming.shortDescription || existing.shortDescription,
    description: incoming.description || existing.description,
    address: incoming.address || existing.address,
    area: incoming.area || existing.area,
    soi: incoming.soi || existing.soi,
    latitude: incoming.latitude ?? existing.latitude,
    longitude: incoming.longitude ?? existing.longitude,
    distanceKm: incoming.distanceKm ?? existing.distanceKm,
    straightLineDistanceKm:
      incoming.straightLineDistanceKm ?? existing.straightLineDistanceKm,
    walkingMinutes: incoming.walkingMinutes ?? existing.walkingMinutes,
    drivingMinutes: incoming.drivingMinutes ?? existing.drivingMinutes,
    walkingDistanceKm:
      incoming.walkingDistanceKm ?? existing.walkingDistanceKm,
    drivingDistanceKm:
      incoming.drivingDistanceKm ?? existing.drivingDistanceKm,
    openingHours:
      Object.values(incoming.openingHours).some(Boolean)
        ? incoming.openingHours
        : existing.openingHours,
    openingHoursText:
      incoming.openingHoursText ?? existing.openingHoursText,
    is24Hours: incoming.is24Hours || existing.is24Hours,
    liveOpenNow: incoming.liveOpenNow ?? existing.liveOpenNow,
    priceLevel: incoming.priceLevel ?? existing.priceLevel,
    priceText: incoming.priceText ?? existing.priceText,
    averagePricePerPerson:
      incoming.averagePricePerPerson ?? existing.averagePricePerPerson,
    minPrice: incoming.minPrice ?? existing.minPrice,
    maxPrice: incoming.maxPrice ?? existing.maxPrice,
    popularMenus: Array.from(
      new Set([...existing.popularMenus, ...incoming.popularMenus]),
    ),
    recommendedItems: Array.from(
      new Set([...existing.recommendedItems, ...incoming.recommendedItems]),
    ),
    tags: Array.from(new Set([...existing.tags, ...incoming.tags])),
    rating: incoming.rating ?? existing.rating,
    reviewCount: incoming.reviewCount ?? existing.reviewCount,
    phone: incoming.phone || existing.phone,
    line: incoming.line || existing.line,
    facebook: incoming.facebook || existing.facebook,
    instagram: incoming.instagram || existing.instagram,
    website: incoming.website || existing.website,
    googleMapsUrl: incoming.googleMapsUrl || existing.googleMapsUrl,
    image: incoming.image || existing.image,
    images: incoming.images.length ? incoming.images : existing.images,
    paymentMethods: Array.from(
      new Set([...existing.paymentMethods, ...incoming.paymentMethods]),
    ),
    delivery: incoming.delivery ?? existing.delivery,
    deliveryApps: Array.from(
      new Set([...existing.deliveryApps, ...incoming.deliveryApps]),
    ),
    dineIn: incoming.dineIn ?? existing.dineIn,
    takeaway: incoming.takeaway ?? existing.takeaway,
    parking:
      incoming.parking.available != null ||
      incoming.parking.price ||
      incoming.parking.type
        ? incoming.parking
        : existing.parking,
    airConditioned: incoming.airConditioned ?? existing.airConditioned,
    wifi: incoming.wifi ?? existing.wifi,
    powerOutlet: incoming.powerOutlet ?? existing.powerOutlet,
    toilet: incoming.toilet ?? existing.toilet,
    petFriendly: incoming.petFriendly ?? existing.petFriendly,
    wheelchairAccessible:
      incoming.wheelchairAccessible ?? existing.wheelchairAccessible,
    openLate: incoming.openLate ?? existing.openLate,
    studentFriendly: incoming.studentFriendly ?? existing.studentFriendly,
    goodForWorking: incoming.goodForWorking ?? existing.goodForWorking,
    recommended: incoming.recommended || existing.recommended,
    localFavorite: incoming.localFavorite || existing.localFavorite,
    verified: incoming.verified || existing.verified,
    lastVerified: incoming.lastVerified || existing.lastVerified,
    source: Array.from(new Set([...existing.source, ...incoming.source])),
    dataSources: [
      ...(existing.dataSources || []),
      ...(incoming.dataSources || []),
    ],
    openingHoursVerifiedAt:
      incoming.openingHoursVerifiedAt ?? existing.openingHoursVerifiedAt,
    priceVerifiedAt:
      incoming.priceVerifiedAt ?? existing.priceVerifiedAt,
    phoneVerifiedAt:
      incoming.phoneVerifiedAt ?? existing.phoneVerifiedAt,
    parkingVerifiedAt:
      incoming.parkingVerifiedAt ?? existing.parkingVerifiedAt,
    notes: incoming.notes || existing.notes,
  };
}

function dedupeAndMerge(places: Place[]) {
  const result: Place[] = [];

  for (const place of places) {
    const index = result.findIndex((existing) => isDuplicate(existing, place));
    if (index === -1) {
      result.push(place);
    } else {
      result[index] = mergePlace(result[index], place);
    }
  }

  return result;
}

export const PLACES: Place[] = dedupeAndMerge([
  ...BASE_PLACES,
  ...EXPANSION_PACK_02,
]);
