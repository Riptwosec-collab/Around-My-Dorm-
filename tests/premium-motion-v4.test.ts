import fs from "node:fs";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync("app/premium-motion-v4.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");
const app = fs.readFileSync("components/AroundMyDormApp.tsx", "utf8");
const detail = fs.readFileSync("components/PlaceDetail.tsx", "utf8");
const parking = fs.readFileSync("components/NearbyParkingPanel.tsx", "utf8");

describe("Premium Motion v4", () => {
  it("loads before render stability so page-level flash guards remain authoritative", () => {
    expect(layout).toContain('import "./premium-motion-v4.css";');
    expect(layout.indexOf('import "./premium-motion-v4.css";')).toBeLessThan(layout.indexOf('import "./render-stability.css";'));
  });

  it("uses one moving navigation slider instead of remounting per-tab indicators", () => {
    expect(app).toContain("amd-nav-slider");
    expect(app).toContain("activeNavIndex");
    expect(app).not.toContain('className="amd-nav-indicator');
  });

  it("keeps animations local and provides reduced-motion fallbacks", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".amd-google-marker-selected::after");
    expect(css).toContain(".amd-crowd-wave");
    expect(css).toContain(".amd-score-gauge");
  });

  it("adds cinematic detail and parking visualization without changing route truth", () => {
    expect(detail).toContain("amd-place-detail-hero");
    expect(detail).toContain("--amd-parallax-y");
    expect(parking).toContain("ParkingScoreGauge");
    expect(parking).toContain("parkingFitBreakdown");
  });
});
