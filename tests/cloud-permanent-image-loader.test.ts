import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("permanent image startup layer", () => {
  const places = read("lib/database/places.ts");
  const repository = read("lib/cloud/place-images.ts");
  const model = read("lib/cloud/place-image-model.ts");

  it("loads active Cloud image rows after the user place layer and merges them before normalization", () => {
    expect(places).toContain('from "@/lib/cloud/place-images"');
    expect(places).toContain('from "@/lib/cloud/place-image-model"');
    expect(places).toContain("loadActivePermanentImageRows");
    expect(places).toContain("getPermanentImagePublicUrl");
    expect(places).toContain("mergePermanentImagesIntoPlaces");
    expect(places).toContain("applyPermanentImageLayer");

    const userLayer = places.indexOf("personalizedPlaces = await applyCloudUserLayer(sharedPlaces)");
    const permanentLayer = places.indexOf("personalizedPlaces = await applyPermanentImageLayer(personalizedPlaces)");
    const normalize = places.indexOf("normalizePlaces(personalizedPlaces)");
    expect(userLayer).toBeGreaterThan(-1);
    expect(permanentLayer).toBeGreaterThan(userLayer);
    expect(normalize).toBeGreaterThan(permanentLayer);
  });

  it("keeps place loading resilient when the optional permanent image Cloud layer fails", () => {
    expect(places).toContain("Permanent image cloud unavailable");
    expect(places).toMatch(/try\s*\{[\s\S]*applyPermanentImageLayer\(personalizedPlaces\)[\s\S]*catch/);
  });

  it("restores permanent images without importing any Google photo runtime/request module", () => {
    const forbidden = ["google-transient-photo", "fetchGoogleTransientPhoto", "loadGoogleMaps"];
    for (const source of [places, repository, model]) {
      for (const token of forbidden) expect(source).not.toContain(token);
    }
  });
});
