import fs from "node:fs/promises";
import path from "node:path";
import { PLACES } from "@/data/places";
import type { PlaceImage } from "@/types/place";

type ExistingPatch = {
  googlePlaceId?: string;
  imageMetadata?: PlaceImage[];
};

async function readExisting() {
  try {
    const file = path.join(process.cwd(), "data", "place-image-enrichment.json");
    return JSON.parse(await fs.readFile(file, "utf8")) as Record<string, ExistingPatch>;
  } catch {
    return {} as Record<string, ExistingPatch>;
  }
}

function alreadyEnriched(patch?: ExistingPatch) {
  return Boolean(patch?.googlePlaceId && patch.imageMetadata?.some((image) => image.verified && image.photoReference));
}

async function main() {
  const existing = await readExisting();
  let cached = 0;
  let placeDetails = 0;
  let textSearch = 0;
  for (const place of PLACES) {
    const patch = existing[place.id];
    if (alreadyEnriched(patch)) {
      cached += 1;
      continue;
    }
    if (place.googlePlaceId || patch?.googlePlaceId) placeDetails += 1;
    else textSearch += 1;
  }
  const estimatedRequests = placeDetails + textSearch;
  const summary = {
    totalPlaces: PLACES.length,
    alreadyEnriched: cached,
    placeDetailsRequests: placeDetails,
    textSearchRequests: textSearch,
    estimatedNewGoogleRequests: estimatedRequests,
    networkRequestsSentByThisEstimator: 0,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, [
      `total_places=${PLACES.length}`,
      `already_enriched=${cached}`,
      `place_details=${placeDetails}`,
      `text_search=${textSearch}`,
      `estimated_requests=${estimatedRequests}`,
      "network_requests_sent=0",
      "",
    ].join("\n"));
  }
}

void main();
