import { describe, expect, it } from "vitest";
import fs from "node:fs";

const cloudOnlyFiles = [
  "components/AroundMyDormApp.tsx",
  "components/DataManagement.tsx",
  "lib/database/places.ts",
  "lib/cloud/place-images.ts",
  "lib/storage/favorites.ts",
  "lib/storage/collections.ts",
  "lib/storage/recent.ts",
  "lib/storage/settings.ts",
  "lib/storage/place-updates.ts",
  "lib/storage/google-place-matches.ts",
  "lib/storage/place-candidates.ts",
];

describe("cloud-only application persistence", () => {
  it("does not persist application records in localStorage", () => {
    for (const file of cloudOnlyFiles) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).not.toContain("localStorage");
    }
  });

  it("does not persist permanent image records in sessionStorage either", () => {
    const source = fs.readFileSync("lib/cloud/place-images.ts", "utf8");
    expect(source).not.toContain("sessionStorage");
    expect(source).toContain('from("amd_place_images")');
    expect(source).toContain('PERMANENT_IMAGE_BUCKET = "amd-place-images"');
  });

  it("uses RLS-scoped Around My Dorm cloud tables", () => {
    const source =
      fs.readFileSync("lib/cloud/store.ts", "utf8") +
      fs.readFileSync("lib/database/places.ts", "utf8") +
      fs.readFileSync("lib/storage/place-candidates.ts", "utf8");
    expect(source).toContain("amd_favorites");
    expect(source).toContain("amd_user_settings");
    expect(source).toContain("amd_recent_views");
    expect(source).toContain("amd_place_overrides");
    expect(source).toContain("amd_place_candidates");
  });
});
