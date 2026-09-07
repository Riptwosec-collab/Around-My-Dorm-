import type { Place, PlaceImage } from "@/types/place";

function unique<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function normalizePlaceImages(place: Place): PlaceImage[] {
  const metadata = place.imageMetadata ?? [];
  const legacy: PlaceImage[] = [place.coverImage, place.image, ...(place.galleryImages ?? []), ...(place.images ?? [])]
    .filter((url): url is string => Boolean(url))
    .map((url) => ({
      url,
      source: place.imageSource === "Google Places" ? "google_places" : "seed",
      attribution: place.imageAttribution ?? null,
      verified: Boolean(place.imageVerifiedAt || place.verified),
      width: null,
      height: null,
      photoReference: null,
    }));

  return unique([...metadata, ...legacy], (item) => `${item.photoReference ?? ""}|${item.url}`);
}

export function selectBestPlaceImage(place: Place): PlaceImage | null {
  const images = normalizePlaceImages(place);
  if (!images.length) return null;

  const scored = images.map((image, index) => {
    const width = image.width ?? 0;
    const height = image.height ?? 0;
    const ratio = width > 0 && height > 0 ? width / height : 1.4;
    const landscapeScore = ratio >= 1.15 && ratio <= 2.2 ? 20 : ratio >= 0.9 ? 8 : 0;
    const resolutionScore = Math.min(25, Math.floor((width * height) / 250_000));
    const sourceScore = image.source === "google_places" ? 30 : image.source === "official_website" || image.source === "official_social" ? 24 : 18;
    const verifiedScore = image.verified ? 15 : 0;
    return { image, score: sourceScore + verifiedScore + landscapeScore + resolutionScore - index * 0.1 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.image ?? null;
}

export function getPlaceImageCandidates(place: Place) {
  const best = selectBestPlaceImage(place);
  const rest = normalizePlaceImages(place).filter((image) => image.url !== best?.url);
  return best ? [best, ...rest] : rest;
}

export function mergePlaceImageData(seed: Place, live: Place): Place {
  const seedImages = normalizePlaceImages(seed);
  const liveImages = normalizePlaceImages(live);
  const mergedImages = unique([...liveImages, ...seedImages], (item) => `${item.photoReference ?? ""}|${item.url}`).slice(0, 8);
  const best = selectBestPlaceImage({ ...seed, imageMetadata: mergedImages });

  return {
    ...seed,
    imageMetadata: mergedImages,
    coverImage: best?.url ?? seed.coverImage ?? seed.image ?? null,
    image: best?.url ?? seed.image ?? null,
    images: mergedImages.map((image) => image.url),
    galleryImages: mergedImages.map((image) => image.url),
    imageSource: best ? sourceLabel(best.source) : seed.imageSource ?? null,
    imageAttribution: best?.attribution ?? seed.imageAttribution ?? null,
    imageVerifiedAt: best?.verified ? live.lastVerified ?? seed.imageVerifiedAt ?? null : seed.imageVerifiedAt ?? null,
  };
}

export function sourceLabel(source: PlaceImage["source"]) {
  if (source === "google_places") return "Google Places";
  if (source === "official_website") return "Official Website";
  if (source === "official_social") return "Official Social";
  if (source === "fallback") return "Fallback Artwork";
  return "Existing Verified Seed Data";
}
