import { describe, expect, it } from "vitest";
import { googleDynamicMapSafetyState, googleMapsMonthlySoftLimit } from "@/lib/google-map-cost-control";

describe("Google Dynamic Map monthly safety states", () => {
  it("matches the requested thresholds", () => {
    expect(googleDynamicMapSafetyState(0, 9500).level).toBe("safe");
    expect(googleDynamicMapSafetyState(7999, 9500).level).toBe("safe");
    expect(googleDynamicMapSafetyState(8000, 9500).level).toBe("warning");
    expect(googleDynamicMapSafetyState(9000, 9500).level).toBe("high");
    expect(googleDynamicMapSafetyState(9500, 9500).level).toBe("critical");
    expect(googleDynamicMapSafetyState(10000, 9500).level).toBe("reached");
  });
  it("blocks normal embedded loading at the configured soft limit", () => {
    expect(googleDynamicMapSafetyState(9499, 9500).blockedBySoftLimit).toBe(false);
    expect(googleDynamicMapSafetyState(9500, 9500).blockedBySoftLimit).toBe(true);
  });
  it("sanitizes the public soft-limit environment value", () => {
    expect(googleMapsMonthlySoftLimit("9000")).toBe(9000);
    expect(googleMapsMonthlySoftLimit("999999")).toBe(10000);
    expect(googleMapsMonthlySoftLimit("bad")).toBe(9500);
  });
});
