import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("CloudPermanentImageManager", () => {
  it("provides a distinct rights-cleared permanent upload workflow", () => {
    const source = read("components/CloudPermanentImageManager.tsx");
    expect(source).toContain("CLOUD PERMANENT IMAGES");
    expect(source).toContain('accept="image/jpeg,image/png,image/webp,image/avif"');
    expect(source).toContain("rightsBasis");
    expect(source).toContain("uploadPermanentPlaceImage");
    expect(source).toContain("setPermanentImageCover");
    expect(source).toContain("archivePermanentPlaceImage");
    expect(source).toContain("admin_upload");
    expect(source).toContain("licensed_import");
    expect(source).toContain("Google runtime");
    expect(source).not.toContain("fetchGoogleTransientPhoto");
  });

  it("is embedded inside the existing admin Google photo control instead of adding another floating control", () => {
    const control = read("components/GoogleBulkPhotoRuntimeControl.tsx");
    expect(control).toContain('import { CloudPermanentImageManager } from "@/components/CloudPermanentImageManager"');
    expect(control).toContain("<CloudPermanentImageManager");
    expect(control).toContain("places={places}");
    expect(control).toContain("onChanged={refreshPlaces}");
  });
});
