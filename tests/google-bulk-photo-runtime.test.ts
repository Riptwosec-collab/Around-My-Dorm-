import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("bulk transient Google place photos", () => {
  const layout = read("app/layout.tsx");
  const placePhoto = read("components/PlacePhoto.tsx");
  const cloudEnrichment = read("lib/google-cloud-enrichment.ts");
  const transientPhoto = read("lib/google-transient-photo.ts");
  const permanentRepository = read("lib/cloud/place-images.ts");

  it("mounts a session-wide admin photo control so one explicit action can fill cards across routes", () => {
    expect(layout).toContain("GoogleBulkPhotoRuntimeControl");
    expect(layout).toContain("<GoogleBulkPhotoRuntimeControl");
  });

  it("lets normal PlacePhoto cards consume the transient runtime photo store", () => {
    expect(placePhoto).toContain("GOOGLE_PHOTO_RUNTIME_CHANGED_EVENT");
    expect(placePhoto).toContain("getGoogleRuntimePhoto");
  });

  it("does not persist Google photo URIs through the shared cloud payload", () => {
    const sanitizerStart = cloudEnrichment.indexOf("export function sanitizeGoogleLiveDetails");
    const sanitizerEnd = cloudEnrichment.indexOf("function googleProvenance", sanitizerStart);
    const sanitizer = cloudEnrichment.slice(sanitizerStart, sanitizerEnd);
    expect(sanitizer).not.toContain("photoUrl:");
    expect(sanitizer).not.toContain("transientPhoto:");
  });

  it("keeps Google photo fetching display-only and permanently isolated from the Cloud image repository", () => {
    expect(transientPhoto).toContain("display-only and must not be persisted");
    expect(transientPhoto).toContain("Display-only Google photo request");
    expect(transientPhoto).toContain("visible_photo_restore");
    expect(transientPhoto).toContain("No cache and no persistent photo URI/name/blob");
    expect(permanentRepository).not.toContain("google-transient-photo");
    expect(permanentRepository).not.toContain("fetchGoogleTransientPhoto");
    expect(permanentRepository).not.toContain("loadGoogleMaps");
  });
});
