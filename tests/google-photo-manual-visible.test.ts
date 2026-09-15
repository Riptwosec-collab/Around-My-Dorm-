import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as runtime from "@/lib/google-photo-runtime";
import type { Place } from "@/types/place";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("manual visible Google photo loading", () => {
  it("tracks only cards that are currently visible", () => {
    const setVisible = (runtime as unknown as { setGooglePhotoCardVisible?: (place: Place, visible: boolean) => void }).setGooglePhotoCardVisible;
    const getVisible = (runtime as unknown as { getVisibleGooglePhotoPlaces?: () => Place[] }).getVisibleGooglePhotoPlaces;
    const reset = (runtime as unknown as { resetVisibleGooglePhotoCards?: () => void }).resetVisibleGooglePhotoCards;

    expect(setVisible).toBeTypeOf("function");
    expect(getVisible).toBeTypeOf("function");
    expect(reset).toBeTypeOf("function");

    const a = { id: "a", name: "A", googlePlaceId: "ga" } as Place;
    const b = { id: "b", name: "B", googlePlaceId: "gb" } as Place;
    reset!();
    setVisible!(a, true);
    setVisible!(b, true);
    setVisible!(a, false);

    expect(getVisible!().map((place) => place.id)).toEqual(["b"]);
  });

  it("never starts a Google request merely because a card enters the viewport", () => {
    const placePhoto = read("components/PlacePhoto.tsx");
    expect(placePhoto).toContain("IntersectionObserver");
    expect(placePhoto).toContain("setGooglePhotoCardVisible");
    expect(placePhoto).not.toContain("requestVisibleGooglePhotoRestore");
  });

  it("mounts a central explicit button that loads only currently visible cards", () => {
    const layout = read("app/layout.tsx");
    const componentPath = path.join(process.cwd(), "components/VisibleGooglePhotoLoadControl.tsx");
    expect(fs.existsSync(componentPath)).toBe(true);
    const control = fs.existsSync(componentPath) ? fs.readFileSync(componentPath, "utf8") : "";

    expect(layout).toContain("VisibleGooglePhotoLoadControl");
    expect(control).toContain("โหลดรูปที่เห็น");
    expect(control).toContain("loadVisibleGooglePhotos");
  });

  it("removes the admin Restore All Remaining action so off-screen restore is not the default path", () => {
    const adminControl = read("components/GoogleBulkPhotoRuntimeControl.tsx");
    expect(adminControl).not.toContain("Restore All Remaining");
    expect(adminControl).not.toContain("runRestoreRemaining");
  });
});
