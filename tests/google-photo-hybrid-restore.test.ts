import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("manual visible Google photo restore", () => {
  it("uses IntersectionObserver only to track visibility, never to trigger a request", () => {
    const placePhoto = read("components/PlacePhoto.tsx");
    expect(placePhoto).toContain("IntersectionObserver");
    expect(placePhoto).toContain("setGooglePhotoCardVisible");
    expect(placePhoto).not.toContain("requestVisibleGooglePhotoRestore");
  });

  it("uses the normal manual Places request intent for the explicit visible-card button", () => {
    const runtimeSource = read("lib/google-photo-runtime.ts");
    expect(runtimeSource).toContain('fetchGoogleTransientPhoto(apiKey, googlePlaceId, "manual_places_request")');
    expect(runtimeSource).toContain("Explicit user action only");
    expect(runtimeSource).not.toContain("requestVisibleGooglePhotoRestore");
  });

  it("caps a single visible-card click defensively without restoring off-screen cards", () => {
    const runtimeSource = read("lib/google-photo-runtime.ts");
    expect(runtimeSource).toContain("GOOGLE_PHOTO_VISIBLE_LOAD_LIMIT = 20");
    expect(runtimeSource).toContain("getVisibleGooglePhotoPlaces()");
    expect(runtimeSource).toContain(".slice(0, GOOGLE_PHOTO_VISIBLE_LOAD_LIMIT)");
  });

  it("keeps Google photos runtime-only and preserves the manual admin tools as a separate path", () => {
    const runtimeSource = read("lib/google-photo-runtime.ts");
    const adminControl = read("components/GoogleBulkPhotoRuntimeControl.tsx");
    expect(runtimeSource).toContain("Google photo content remains runtime-only");
    expect(adminControl).toContain("Google Photos");
  });
});
