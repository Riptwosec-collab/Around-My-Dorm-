import type { Place, PlaceImage } from "@/types/place";

export type PermanentImageSource = "user_upload" | "admin_upload" | "licensed_import";

export type CloudPermanentImageRow = {
  id: string;
  place_id: string;
  source: PermanentImageSource;
  source_reference: string | null;
  source_url: string | null;
  attribution: string | null;
  width: number | null;
  height: number | null;
  verified: boolean;
  last_checked: string | null;
  created_at: string;
  storage_bucket: string | null;
  storage_path: string | null;
  rights_basis: string | null;
  mime_type: string | null;
  byte_size: number | null;
  is_cover: boolean;
  status: "active" | "archived";
  created_by: string | null;
  updated_at: string;
};

export type PermanentImageMetadataInput = {
  source: PermanentImageSource | string;
  rightsBasis: string | null | undefined;
  sourceUrl?: string | null;
  sourceReference?: string | null;
};

const PERMANENT_IMAGE_SOURCES = new Set<PermanentImageSource>([
  "user_upload",
  "admin_upload",
  "licensed_import",
]);

const GOOGLE_PHOTO_HOST_PATTERN = /(places\.googleapis\.com|maps\.googleapis\.com|googleusercontent\.com)/iu;
const GOOGLE_PHOTO_RESOURCE_PATTERN = /(?:^|\/)places\/[^/\s]+\/photos\/[^/\s]+(?:\/|$)/iu;

function containsGooglePhotoReference(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return false;
  return GOOGLE_PHOTO_HOST_PATTERN.test(normalized) || GOOGLE_PHOTO_RESOURCE_PATTERN.test(normalized);
}

export function validatePermanentImageMetadata(input: PermanentImageMetadataInput) {
  if (!PERMANENT_IMAGE_SOURCES.has(input.source as PermanentImageSource)) {
    throw new Error("Permanent image source must be user_upload, admin_upload, or licensed_import");
  }
  if (!input.rightsBasis?.trim()) {
    throw new Error("Permanent images require a rights basis");
  }
  if (containsGooglePhotoReference(input.sourceUrl) || containsGooglePhotoReference(input.sourceReference)) {
    throw new Error("Google Place Photos cannot be copied into permanent Cloud storage");
  }
  return {
    source: input.source as PermanentImageSource,
    rightsBasis: input.rightsBasis.trim(),
    sourceUrl: input.sourceUrl?.trim() || null,
    sourceReference: input.sourceReference?.trim() || null,
  };
}

export function cloudPermanentImageToPlaceImage(row: CloudPermanentImageRow, publicUrl: string): PlaceImage {
  if (!publicUrl.trim()) throw new Error("Permanent image public URL is missing");
  validatePermanentImageMetadata({
    source: row.source,
    rightsBasis: row.rights_basis,
    sourceUrl: row.source_url,
    sourceReference: row.source_reference,
  });
  return {
    url: publicUrl,
    source: "cloud_storage",
    attribution: row.attribution,
    width: row.width,
    height: row.height,
    verified: row.verified,
    photoReference: null,
    isCover: row.is_cover,
  };
}

function imageKey(image: PlaceImage) {
  return `${image.photoReference ?? ""}|${image.url}`;
}

export function mergePermanentImagesIntoPlaces(
  places: Place[],
  rows: CloudPermanentImageRow[],
  getPublicUrl: (row: CloudPermanentImageRow) => string,
): Place[] {
  const byPlace = new Map<string, CloudPermanentImageRow[]>();
  for (const row of rows) {
    if (row.status !== "active" || !row.storage_path?.trim()) continue;
    const list = byPlace.get(row.place_id) ?? [];
    list.push(row);
    byPlace.set(row.place_id, list);
  }

  return places.map((place) => {
    const matching = byPlace.get(place.id);
    if (!matching?.length) return place;

    const cloudImages = matching
      .slice()
      .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id))
      .flatMap((row) => {
        try {
          const publicUrl = getPublicUrl(row);
          return publicUrl ? [cloudPermanentImageToPlaceImage(row, publicUrl)] : [];
        } catch {
          return [];
        }
      });

    if (!cloudImages.length) return place;
    const seen = new Set<string>();
    const merged = [...cloudImages, ...(place.imageMetadata ?? [])].filter((image) => {
      const key = imageKey(image);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { ...place, imageMetadata: merged };
  });
}
