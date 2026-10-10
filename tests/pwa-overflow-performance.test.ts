import fs from "node:fs";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync("app/app-frame-sizing.css", "utf8");
const database = fs.readFileSync("lib/database/places.ts", "utf8");
const management = fs.readFileSync("components/DataManagement.tsx", "utf8");
const app = fs.readFileSync("components/AroundMyDormApp.tsx", "utf8");
const manager = fs.readFileSync("components/GooglePlaceIdManager.tsx", "utf8");

describe("PWA mobile overflow and performance regressions", () => {
  it("constrains sheets to the PWA frame and viewport safe area", () => {
    expect(css).toContain(".amd-sheet-backdrop > .amd-sheet");
    expect(css).toContain("max-width: min(100%, var(--amd-app-max-w));");
    expect(css).toContain("overflow-x: hidden;");
  });

  it("mounts admin-heavy surfaces only for the chosen panel", () => {
    expect(management).toContain('activePanel === "overview"');
    expect(management).toContain('activePanel === "placeIds"');
    expect(management).toContain('dynamic(() => import("@/components/GooglePlaceIdManager")');
    expect(management).toContain("selectablePlaces.map(");
    expect(manager).toContain("createPortal(<div");
  });

  it("bounds initial place-card rendering across list pages", () => {
    expect(app).toContain("explorePlaces.slice(0, exploreDisplayLimit)");
    expect(app).toContain("filteredFavoritePlaces.slice(0, savedDisplayLimit)");
    expect(app).toContain("filteredRecentPlaces.slice(0, recentDisplayLimit)");
  });

  it("queries the shared Google cloud layer once instead of twice", () => {
    expect(database.match(/await applyGoogleCloudPlaceLayer\(/g)).toHaveLength(1);
  });
});
