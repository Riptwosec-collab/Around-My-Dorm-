import type { CategoryId, Place } from "@/types/place";

function compactNullable(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function uniqueStrings(values: readonly string[] | null | undefined): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function normalizeCategories(primary: CategoryId, categories: readonly CategoryId[]): CategoryId[] {
  return Array.from(new Set<CategoryId>([primary, ...categories]));
}

export function normalizePlace(place: Place): Place {
  return {
    ...place,
    name: place.name.trim(),
    nameEn: compactNullable(place.nameEn),
    googlePlaceId: compactNullable(place.googlePlaceId),
    address: compactNullable(place.address),
    soi: compactNullable(place.soi),
    phone: compactNullable(place.phone),
    line: compactNullable(place.line),
    facebook: compactNullable(place.facebook),
    instagram: compactNullable(place.instagram),
    website: compactNullable(place.website),
    googleMapsUrl: compactNullable(place.googleMapsUrl),
    image: compactNullable(place.image),
    priceText: compactNullable(place.priceText),
    notes: compactNullable(place.notes),
    categories: normalizeCategories(place.category, place.categories ?? []),
    tags: uniqueStrings(place.tags),
    images: uniqueStrings(place.images),
    popularMenus: uniqueStrings(place.popularMenus),
    recommendedItems: uniqueStrings(place.recommendedItems),
    paymentMethods: uniqueStrings(place.paymentMethods),
    deliveryApps: uniqueStrings(place.deliveryApps),
    source: uniqueStrings(place.source),
    galleryImages: place.galleryImages ? uniqueStrings(place.galleryImages) : place.galleryImages,
    menuImages: place.menuImages ? uniqueStrings(place.menuImages) : place.menuImages,
    parkingImages: place.parkingImages ? uniqueStrings(place.parkingImages) : place.parkingImages,
  };
}

export function normalizePlaces(places: Place[]): Place[] {
  return places.map(normalizePlace);
}
