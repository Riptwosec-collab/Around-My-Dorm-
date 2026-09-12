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
  const manualMap = read("components/ManualGoogleMap.tsx");

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

  it("bundles MapLibre with the application instead of loading its runtime from a CDN", () => {
    const savedMap = read("components/SavedCloudMap.tsx");
    const packageJson = JSON.parse(read("package.json"));
    expect(packageJson.dependencies?.["maplibre-gl"]).toBeTruthy();
    expect(savedMap).toContain('import maplibregl from "maplibre-gl";');
    expect(savedMap).toContain('import "maplibre-gl/dist/maplibre-gl.css";');
    expect(savedMap).not.toContain("unpkg.com/maplibre-gl");
    expect(savedMap).not.toContain("document.createElement(\"script\")");
    expect(savedMap).not.toContain("document.createElement(\"link\")");
  });

  it("gives the MapLibre-owned container explicit full dimensions so its CSS cannot collapse it to zero height", () => {
    const savedMap = read("components/SavedCloudMap.tsx");
    expect(savedMap).toContain('ref={containerRef} className="h-full w-full"');
    expect(savedMap).not.toContain('ref={containerRef} className="absolute inset-0"');
  });

  it("uses the saved cloud map by default and exposes Google only as an explicit manual choice", () => {
    expect(manualMap).toContain('import { SavedCloudMap } from "@/components/SavedCloudMap";');
    expect(manualMap).toContain('useState<"cloud" | "google">("cloud")');
    expect(manualMap).toContain('mapProvider === "cloud"');
    expect(manualMap).toContain('setMapProvider("google")');
    expect(manualMap).toContain('<SavedCloudMap');
    expect(manualMap).toContain('<GoogleMapsMap');
    expect(manualMap).toContain('Saved Cloud Map ใช้ได้โดยไม่ยิง Google Request');
  });

  it("keeps Google Maps loading behind the existing explicit request gate", () => {
    expect(manualMap).toContain('data-testid="load-google-map"');
    expect(manualMap).toContain('onClick={() => startLoad(false)}');
    expect(manualMap).toContain('Confirm Dynamic Map Load');
  });
});
