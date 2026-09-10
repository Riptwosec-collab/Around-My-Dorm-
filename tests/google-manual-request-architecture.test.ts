import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function sourceFiles(dir: string): string[] {
  const base = join(root, dir);
  return readdirSync(base).flatMap((name) => {
    const path = join(base, name);
    if (statSync(path).isDirectory()) return sourceFiles(relative(root, path));
    return /\.(ts|tsx|js|jsx)$/.test(name) ? [relative(root, path).replaceAll("\\", "/")] : [];
  });
}

describe("strict manual Google Maps architecture", () => {
  it("has no global or app-start Maps JavaScript loader", () => {
    expect(read("app/layout.tsx")).not.toContain("maps.googleapis.com");
    const app = read("components/AroundMyDormApp.tsx");
    expect(app).not.toContain("loadGoogleMaps(");
    expect(app).not.toContain("Warm the Maps JavaScript bundle");
    expect(app).toContain("<ManualGoogleMap");
    expect(app).not.toContain("<GoogleMapsMap");
  });

  it("keeps raw Google Maps script injection isolated to the singleton loader", () => {
    const offenders = sourceFiles("app").concat(sourceFiles("components"), sourceFiles("lib")).filter((path) => path !== "lib/google-maps.ts" && read(path).includes("maps.googleapis.com/maps/api/js"));
    expect(offenders).toEqual([]);
    const loader = read("lib/google-maps.ts");
    expect(loader).toContain("__aroundDormMapsPromise");
    expect(loader).toContain("GoogleMapsLoadIntent");
    expect(loader).toContain("data-amd-google-maps-loader");
  });

  it("requires an explicit gate before map initialization and manual intent for Places", () => {
    const gate = read("components/ManualGoogleMap.tsx");
    const map = read("components/GoogleMapsMap.tsx");
    const live = read("lib/google-live.ts");
    expect(gate).toContain("loadRequested");
    expect(gate).toContain("Load Google Map");
    expect(map).toContain("manualLoadConfirmed");
    expect(map).toContain('loadGoogleMaps(apiKey, "embedded_map_user_click")');
    expect(live).toContain('loadGoogleMaps(apiKey, "manual_places_request")');
  });

  it("requires UI confirmation for text search and maintenance requests", () => {
    expect(read("components/GoogleDiscoverySheet.tsx")).toContain("confirm-google-nearby-search");
    expect(read("components/GooglePlaceIdManager.tsx")).toContain("confirm-google-place-id-search");
    const maintenance = read("components/GoogleMaintenancePanel.tsx");
    expect(maintenance).toContain("setConfirmOpen(true)");
    expect(maintenance).toContain("retryConfirmOpen");
    expect(maintenance).toContain("Send Request");
  });
});
