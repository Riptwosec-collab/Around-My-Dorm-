import { PLACES as EXPANDED_PLACES } from "./places-expanded";
import { enrichPlace } from "./enrichments";
import imageEnrichment from "./place-image-enrichment.json";
import type { Place } from "@/types/place";

type ImagePatch = Partial<Pick<Place, "googlePlaceId" | "coverImage" | "image" | "images" | "galleryImages" | "imageSource" | "imageAttribution" | "imageVerifiedAt" | "imageMetadata">>;
const PHOTO_ENRICHMENTS = imageEnrichment as Record<string, ImagePatch>;
function applyPhotoEnrichment(place: Place): Place {
  const patch = PHOTO_ENRICHMENTS[place.id];
  if (!patch) return place;
  return { ...place, ...patch, images: patch.images?.length ? patch.images : place.images, galleryImages: patch.galleryImages?.length ? patch.galleryImages : place.galleryImages, source: Array.from(new Set([...(place.source || []), patch.imageSource || "Photo enrichment layer"])) };
}
export const PLACES: Place[] = EXPANDED_PLACES.map(enrichPlace).map(applyPhotoEnrichment);
