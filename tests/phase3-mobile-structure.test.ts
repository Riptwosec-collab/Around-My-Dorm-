import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Phase 3 mobile structure", () => {
  it("keeps the report bottom sheet inside the mobile viewport and safe area", () => {
    const source = fs.readFileSync("components/ReportPlaceSheet.tsx", "utf8");
    expect(source).toContain("max-h-[84dvh]");
    expect(source).toContain("env(safe-area-inset-bottom)");
    expect(source).toContain("overflow-y-auto");
  });

  it("keeps the Decision Panel in PlaceDetail instead of adding a permanent app-shell tab", () => {
    const detailSource = fs.readFileSync("components/PlaceDetail.tsx", "utf8");
    const appSource = fs.readFileSync("components/AroundMyDormApp.tsx", "utf8");

    expect(detailSource).toContain('import { PlaceDecisionPanel } from "@/components/PlaceDecisionPanel";');
    expect(detailSource).toContain("<PlaceDecisionPanel");
    expect(appSource).not.toContain('import { PlaceDecisionPanel } from "@/components/PlaceDecisionPanel";');
  });

  it("does not make ETA or parking panels fixed overlays", () => {
    const etaSource = fs.readFileSync("components/PlaceEtaPanel.tsx", "utf8");
    const parkingSource = fs.readFileSync("components/NearbyParkingPanel.tsx", "utf8");

    expect(etaSource).not.toMatch(/className=\"[^\"]*\bfixed\b/);
    expect(parkingSource).not.toMatch(/className=\"[^\"]*\bfixed\b/);
  });
});
