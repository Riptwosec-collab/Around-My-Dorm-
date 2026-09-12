import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { googleDynamicMapSafetyState } from "@/lib/google-map-cost-control";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("manual Google photo runtime publishing", () => {
  it("publishes a manually loaded photo into the shared runtime and tracks the request", () => {
    const panel = read("components/GoogleTransientPhotoPanel.tsx");
    expect(panel).toContain("setGoogleRuntimePhoto(place.id, googlePlaceId, next)");
    expect(panel).toContain('requestType: "place_photo"');
  });

  it("keeps photo loading explicit and user initiated", () => {
    const panel = read("components/GoogleTransientPhotoPanel.tsx");
    expect(panel).toContain("onClick={() => void loadPhoto()}");
    expect(panel).not.toContain("void loadPhoto();\n  }, []");
  });

  it("uses a photo-specific empty label instead of the generic unknown-data label", () => {
    const card = read("components/PlaceCard.tsx");
    const detail = read("components/PlaceDetail.tsx");
    expect(card).toContain('language === "en" ? "No photo yet" : "ยังไม่มีรูป"');
    expect(detail).toContain('language === "en" ? "No photo yet" : "ยังไม่มีรูป"');
    expect(card).not.toContain("fallbackLabel={copy.unknownData}");
    expect(detail).not.toContain("fallbackLabel={copy.unknownData}");
  });

  it("tracks every bulk photo request and preserves the first useful Google error", () => {
    const bulk = read("components/GoogleBulkPhotoRuntimeControl.tsx");
    expect(bulk).toContain("recordTrackedGoogleRequest");
    expect(bulk).toContain('requestType: "place_photo"');
    expect(bulk).toContain('let requestStatus: "success" | "failed" = "success"');
    expect(bulk).toContain('requestStatus = "failed"');
    expect(bulk).toContain("status: requestStatus");
    expect(bulk).toContain("firstError");
  });

  it("uses every shared Google Place ID for manual photo preview without auto-verifying review candidates", () => {
    const bulk = read("components/GoogleBulkPhotoRuntimeControl.tsx");
    expect(bulk).toContain('from("amd_google_public_links")');
    expect(bulk).toContain('select("place_id,google_place_id,status,confidence")');
    expect(bulk).toContain('status: "linked" | "review"');
    expect(bulk).toContain("photoGooglePlaceId");
    expect(bulk).toContain("reviewPhotoCandidates");
    expect(bulk).not.toContain('.update({ status: "linked" })');
  });

  it("turns raw photo failures into actionable Places API diagnostics", () => {
    const photo = read("lib/google-transient-photo.ts");
    expect(photo).toContain("Google Place Photos failed:");
    expect(photo).toContain("Places API (New)");
    expect(photo).toContain("API restrictions");
  });
});

describe("app-tracked Google API monthly budget", () => {
  it("reports remaining free budget and the Bangkok monthly reset", () => {
    const state = (googleDynamicMapSafetyState as any)(
      1250,
      9500,
      new Date("2026-09-12T16:00:00.000Z"),
    );
    expect(state.freeLimit).toBe(10_000);
    expect(state.remaining).toBe(8_750);
    expect(state.resetTimezone).toBe("Asia/Bangkok");
    expect(state.resetAt).toBe("2026-10-01T00:00:00+07:00");
  });

  it("shows the free budget and reset status in the usage dashboard", () => {
    const dashboard = read("components/GoogleMapsUsageDashboard.tsx");
    expect(dashboard).toContain("FREE API LEFT");
    expect(dashboard).toContain("App-tracked estimate");
    expect(dashboard).toContain("Reset");
  });

  it("defines a server-side monthly usage aggregate in the canonical schema", () => {
    const schema = read("supabase/schema.sql");
    expect(schema).toContain("amd_google_usage_summary");
    expect(schema).toContain("Asia/Bangkok");
    expect(schema).toContain("place_photo");
  });

  it("aggregates the shared Google project budget only for an authorized admin", () => {
    for (const path of ["supabase/schema.sql", "supabase/google-api-budget.sql"]) {
      const sql = read(path).toLowerCase();
      expect(sql).toContain("security definer");
      expect(sql).toContain("from auth.users");
      expect(sql).toContain("raw_app_meta_data");
      expect(sql).toContain("email_confirmed_at");
      expect(sql).not.toContain("where l.user_id = auth.uid()");
    }
  });

  it("does not mix cached prior-month usage into the Bangkok monthly budget", () => {
    const dashboard = read("components/GoogleMapsUsageDashboard.tsx");
    expect(dashboard).not.toContain("localTrackedMonth");
    expect(dashboard).not.toContain("Math.max(usage.textSearch");
    expect(dashboard).not.toContain("Math.max(usage.placeDetails");
    expect(dashboard).not.toContain("Math.max(usage.geocoding");
    expect(dashboard).not.toContain("Math.max(usage.routes");
    expect(dashboard).toContain("budget.breakdown.textSearch");
    expect(dashboard).toContain("budget.breakdown.placeDetails");
  });

  it("keeps local cards immediate while repeatedly reconciling persisted project usage", () => {
    const dashboard = read("components/GoogleMapsUsageDashboard.tsx");
    expect(dashboard).toContain("hydrateGoogleRequestLogs(true)");
    expect(dashboard).toContain("hydrateGoogleApiBudgetSummary(true)");
    expect(dashboard).toContain("window.setTimeout");
    expect(dashboard).toContain("window.setInterval");
  });

  it("marks dedicated photo accounting events as already persisted", () => {
    const budget = read("lib/google-api-budget.ts");
    expect(budget).toContain("persisted: true");
  });
});
