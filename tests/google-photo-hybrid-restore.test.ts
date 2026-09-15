import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as runtime from "@/lib/google-photo-runtime";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("hybrid Google photo restore", () => {
  it("caps automatic viewport restores at 20 requests per session and deduplicates places", () => {
    const claim = (runtime as unknown as { claimGooglePhotoAutoRestoreSlot?: (placeId: string) => boolean }).claimGooglePhotoAutoRestoreSlot;
    const reset = (runtime as unknown as { resetGooglePhotoAutoRestoreSession?: () => void }).resetGooglePhotoAutoRestoreSession;

    expect(claim).toBeTypeOf("function");
    expect(reset).toBeTypeOf("function");
    reset!();

    for (let index = 0; index < 20; index += 1) {
      expect(claim!(`place-${index}`)).toBe(true);
    }
    expect(claim!("place-0")).toBe(false);
    expect(claim!("place-20")).toBe(false);
  });

  it("only starts automatic restore from a visible PlacePhoto via IntersectionObserver", () => {
    const placePhoto = read("components/PlacePhoto.tsx");
    expect(placePhoto).toContain("IntersectionObserver");
    expect(placePhoto).toContain("requestVisibleGooglePhotoRestore");
    expect(placePhoto).toContain("intersectionRatio");
  });

  it("uses a dedicated visible-photo Maps load intent instead of pretending the restore was a manual Places request", () => {
    const maps = read("lib/google-maps.ts");
    const transient = read("lib/google-transient-photo.ts");
    const runtimeSource = read("lib/google-photo-runtime.ts");

    expect(maps).toContain('"visible_photo_restore"');
    expect(transient).toContain("GoogleMapsLoadIntent");
    expect(runtimeSource).toContain('fetchGoogleTransientPhoto(apiKey, target.googlePlaceId, "visible_photo_restore")');
  });

  it("keeps bulk restore explicit and exposes Restore All Remaining for previously successful photos", () => {
    const control = read("components/GoogleBulkPhotoRuntimeControl.tsx");
    expect(control).toContain("restoreTargets");
    expect(control).toContain("Restore All Remaining");
    expect(control).toContain("runRestoreRemaining");
  });
});
