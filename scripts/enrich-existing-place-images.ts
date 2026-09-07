import fs from "node:fs/promises";
import path from "node:path";
import { PLACES } from "@/data/places";
import { haversineKm, normalizePlaceName } from "@/lib/place-utils";
import type { Place, PlaceImage } from "@/types/place";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const OUT = path.join(process.cwd(), "data", "place-image-enrichment.json");
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.primaryType",
  "places.photos",
].join(",");

type ExistingPatch = {
  googlePlaceId?: string;
  coverImage?: string | null;
  images?: string[];
  galleryImages?: string[];
  imageSource?: string | null;
  imageAttribution?: string | null;
  imageVerifiedAt?: string | null;
  imageMetadata?: PlaceImage[];
};

type SearchPlace = {
  id?: string;
  displayName?: { text?: string } | string;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  photos?: Array<{
    name?: string;
    widthPx?: number;
    heightPx?: number;
    authorAttributions?: Array<{ displayName?: string; uri?: string; photoUri?: string }>;
  }>;
};

function displayName(place: SearchPlace) {
  if (typeof place.displayName === "string") return place.displayName;
  return place.displayName?.text ?? "";
}

function textScore(a: string, b: string) {
  const na = normalizePlaceName(a);
  const nb = normalizePlaceName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.82;
  return 0;
}

function candidateDistanceKm(seed: Place, candidate: SearchPlace) {
  const lat = candidate.location?.latitude;
  const lng = candidate.location?.longitude;
  if (seed.latitude == null || seed.longitude == null || lat == null || lng == null) return null;
  return haversineKm({ lat: seed.latitude, lng: seed.longitude }, { lat, lng });
}

function confidence(seed: Place, candidate: SearchPlace) {
  const name = textScore(seed.name, displayName(candidate));
  const distance = candidateDistanceKm(seed, candidate);
  let score = name * 70;
  if (distance != null) {
    if (distance <= 0.08) score += 30;
    else if (distance <= 0.2) score += 24;
    else if (distance <= 0.5) score += 14;
    else if (distance <= 1) score += 4;
    else score -= 35;
  } else if (seed.area && candidate.formattedAddress?.includes(seed.area)) {
    score += 15;
  }
  return score;
}

function chooseBest(seed: Place, candidates: SearchPlace[]) {
  const ranked = candidates
    .map((candidate) => ({ candidate, score: confidence(seed, candidate) }))
    .sort((a, b) => b.score - a.score);
  const first = ranked[0];
  const second = ranked[1];
  if (!first || first.score < 72) return null;
  if (second && first.score - second.score < 8) return null;
  return first.candidate;
}

async function searchText(place: Place) {
  const textQuery = [place.name, place.address, place.area, "Bangkok Thailand"].filter(Boolean).join(" ");
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery, languageCode: "th", regionCode: "TH", maxResultCount: 5 }),
  });
  if (!response.ok) throw new Error(`searchText ${response.status}: ${await response.text()}`);
  const data = await response.json() as { places?: SearchPlace[] };
  return data.places ?? [];
}

async function getPlace(placeId: string) {
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location,primaryType,photos",
      "Accept-Language": "th",
    },
  });
  if (!response.ok) throw new Error(`placeDetails ${response.status}: ${await response.text()}`);
  return await response.json() as SearchPlace;
}

function photoUrl(photoName: string, maxWidthPx: number) {
  const media = `${photoName}/media`;
  return `https://places.googleapis.com/v1/${media}?maxWidthPx=${maxWidthPx}&key=${encodeURIComponent(API_KEY)}`;
}

function selectPhotos(raw: SearchPlace) {
  const photos = raw.photos ?? [];
  const scored = photos
    .map((photo, index) => {
      const width = photo.widthPx ?? 0;
      const height = photo.heightPx ?? 0;
      const ratio = width > 0 && height > 0 ? width / height : 1;
      const landscape = ratio >= 1.1 && ratio <= 2.2 ? 30 : ratio >= 0.85 ? 12 : 0;
      const resolution = Math.min(25, Math.floor((width * height) / 350_000));
      return { photo, score: landscape + resolution - index * 0.2 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ photo }) => photo);

  return scored
    .filter((photo): photo is NonNullable<typeof photo> & { name: string } => Boolean(photo.name))
    .map((photo, index): PlaceImage => ({
      url: photoUrl(photo.name, index === 0 ? 900 : 1100),
      source: "google_places",
      photoReference: photo.name,
      attribution: photo.authorAttributions?.map((item) => item.displayName).filter(Boolean).join(", ") || null,
      width: photo.widthPx ?? null,
      height: photo.heightPx ?? null,
      verified: true,
    }));
}

async function readExisting() {
  try {
    return JSON.parse(await fs.readFile(OUT, "utf8")) as Record<string, ExistingPatch>;
  } catch {
    return {} as Record<string, ExistingPatch>;
  }
}

async function main() {
  if (!API_KEY) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY (preferred) or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. No enrichment was performed.");
  }

  const output = await readExisting();
  let matched = 0;
  let photos = 0;
  let uncertain = 0;

  for (const [index, seed] of PLACES.entries()) {
    try {
      let real: SearchPlace | null = null;
      if (seed.googlePlaceId) {
        real = await getPlace(seed.googlePlaceId);
      } else {
        real = chooseBest(seed, await searchText(seed));
      }

      if (!real?.id) {
        uncertain += 1;
        console.log(`[${index + 1}/${PLACES.length}] SKIP uncertain: ${seed.name}`);
        continue;
      }

      const imageMetadata = selectPhotos(real);
      const patch: ExistingPatch = {
        googlePlaceId: real.id,
        imageMetadata,
        coverImage: imageMetadata[0]?.url ?? seed.coverImage ?? seed.image ?? null,
        images: imageMetadata.length ? imageMetadata.map((image) => image.url) : seed.images,
        galleryImages: imageMetadata.length ? imageMetadata.map((image) => image.url) : seed.galleryImages ?? seed.images,
        imageSource: imageMetadata.length ? "Google Places" : seed.imageSource ?? null,
        imageAttribution: imageMetadata[0]?.attribution ?? null,
        imageVerifiedAt: new Date().toISOString().slice(0, 10),
      };

      output[seed.id] = patch;
      matched += 1;
      photos += imageMetadata.length;
      console.log(`[${index + 1}/${PLACES.length}] MATCH ${seed.name} -> ${real.id} (${imageMetadata.length} photos)`);
    } catch (error) {
      console.warn(`[${index + 1}/${PLACES.length}] ERROR ${seed.name}:`, error instanceof Error ? error.message : error);
    }

    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  await fs.writeFile(OUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Done. Audited ${PLACES.length} places, matched ${matched}, stored ${photos} photo records, uncertain ${uncertain}.`);
}

void main();
