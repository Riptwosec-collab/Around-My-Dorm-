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
});
