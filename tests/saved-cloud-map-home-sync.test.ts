import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("Saved Cloud Map + HOME sync", () => {
  const homeOrigin = read("lib/home-origin.ts");
  const homeManager = read("components/HomeOriginManager.tsx");
  const routes = read("components/GoogleRouteRefresh.tsx");
  const app = read("components/AroundMyDormApp.tsx");

  it("notifies mounted consumers immediately after HOME is verified or refreshed", () => {
    expect(homeOrigin).toContain('HOME_ORIGIN_CHANGED_EVENT');
    expect(homeOrigin).toContain('notifyHomeOriginChanged');
    expect(homeManager).toContain('notifyHomeOriginChanged');
    expect(routes).toContain('HOME_ORIGIN_CHANGED_EVENT');
    expect(routes).toContain('window.addEventListener(HOME_ORIGIN_CHANGED_EVENT');
  });

  it("provides an OpenStreetMap/MapLibre saved-cloud map with no Google request dependency", () => {
    const savedMap = read("components/SavedCloudMap.tsx");
    expect(savedMap).toContain('tile.openstreetmap.org');
    expect(savedMap).toContain('maplibre-gl');
    expect(savedMap).toContain('cluster: true');
    expect(savedMap).toContain('OpenStreetMap');
    expect(savedMap).not.toContain('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
    expect(savedMap).not.toContain('google.maps');
  });

  it("uses the cloud map by default and only mounts Google map when explicitly selected", () => {
    expect(app).toContain('import { SavedCloudMap } from "@/components/SavedCloudMap";');
    expect(app).toContain('useState<"cloud" | "google">("cloud")');
    expect(app).toContain('mapProvider === "cloud"');
    expect(app).toContain('mapProvider === "google"');
    expect(app).toContain('<SavedCloudMap');
    expect(app).toContain('<ManualGoogleMap');
  });

  it("loads the verified HOME from Supabase for the dorm origin without calling Google", () => {
    expect(app).toContain('loadHomeOrigin');
    expect(app).toContain('isUsableHomeOrigin');
    expect(app).toContain('setOrigin(exactHome)');
    expect(app).toContain('setMapSearchCenter(exactHome)');
  });
});
