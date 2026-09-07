import { PLACES } from "../data/places-product";
import { CATEGORIES } from "../data/categories-expanded";
const errors: string[] = [];
const ids = new Set<string>(); const slugs = new Set<string>(); const categoryIds = new Set(CATEGORIES.map((item) => item.id));
const timeRegex = /(?:^|[^\d])(\d{1,2}):(\d{2})(?:[^\d]|$)/g;
for (const place of PLACES) {
  if (!place.id || ids.has(place.id)) errors.push(`duplicate/empty id: ${place.id}`); ids.add(place.id);
  if (!place.slug || slugs.has(place.slug)) errors.push(`duplicate/empty slug: ${place.slug}`); slugs.add(place.slug);
  if (!categoryIds.has(place.category)) errors.push(`${place.id}: invalid category ${place.category}`);
  for (const category of place.categories) if (!categoryIds.has(category)) errors.push(`${place.id}: invalid categories[] ${category}`);
  if (place.latitude != null && (place.latitude < -90 || place.latitude > 90)) errors.push(`${place.id}: latitude out of range`);
  if (place.longitude != null && (place.longitude < -180 || place.longitude > 180)) errors.push(`${place.id}: longitude out of range`);
  if (place.rating != null && (place.rating < 0 || place.rating > 5)) errors.push(`${place.id}: rating out of range`);
  if (place.reviewCount != null && place.reviewCount < 0) errors.push(`${place.id}: negative review count`);
  for (const value of [place.minPrice, place.maxPrice, place.averagePricePerPerson, place.pricing?.min, place.pricing?.max, place.pricing?.fixed, place.parkingDetails?.hourlyPrice, place.parkingDetails?.dailyPrice, place.parkingDetails?.monthlyPrice]) if (value != null && value < 0) errors.push(`${place.id}: negative price`);
  if (place.minPrice != null && place.maxPrice != null && place.minPrice > place.maxPrice) errors.push(`${place.id}: minPrice > maxPrice`);
  for (const raw of Object.values(place.openingHours || {})) if (raw) { for (const match of raw.matchAll(timeRegex)) { const h=Number(match[1]), m=Number(match[2]); if (h > 24 || m > 59) errors.push(`${place.id}: invalid opening time ${match[1]}:${match[2]}`); } }
  for (const stamp of [place.lastVerified, place.openingHoursVerifiedAt, place.priceVerifiedAt, place.locationVerifiedAt, place.phoneVerifiedAt, place.imageVerifiedAt, place.deliveryVerifiedAt, place.parkingVerifiedAt]) if (stamp && Number.isNaN(Date.parse(stamp))) errors.push(`${place.id}: invalid timestamp ${stamp}`);
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Validated ${PLACES.length} places: IDs, slugs, categories, coordinates, ratings, prices, hours and verification timestamps OK.`);
