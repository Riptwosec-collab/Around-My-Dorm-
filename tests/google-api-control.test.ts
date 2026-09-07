import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_GOOGLE_API_CONTROL, getGoogleApiControlSettings, requestUsageWarning, saveGoogleApiControlSettings, sanitizeGoogleApiControlSettings } from "@/lib/google-api-control";
import { getGoogleRequestUsage } from "@/lib/google-request-manager";

describe("Google API Control Center policy", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("defaults to bounded request controls", () => {
    expect(getGoogleApiControlSettings()).toEqual(DEFAULT_GOOGLE_API_CONTROL);
    expect(DEFAULT_GOOGLE_API_CONTROL.batchLimit).toBe(50);
    expect(DEFAULT_GOOGLE_API_CONTROL.dailyWarningLimit).toBe(200);
    expect(DEFAULT_GOOGLE_API_CONTROL.monthlyWarningLimit).toBe(2000);
  });

  it("accepts only supported batch sizes and persists controls", () => {
    expect(sanitizeGoogleApiControlSettings({ batchLimit: 999 }).batchLimit).toBe(50);
    saveGoogleApiControlSettings({ batchLimit: 25, dailyWarningLimit: 150, monthlyWarningLimit: 1500 });
    expect(getGoogleApiControlSettings()).toEqual({ locked: false, batchLimit: 25, dailyWarningLimit: 150, monthlyWarningLimit: 1500 });
  });

  it("reports 75, 90 and 100 percent warning bands", () => {
    expect(requestUsageWarning(74, 100).level).toBe(0);
    expect(requestUsageWarning(75, 100).level).toBe(75);
    expect(requestUsageWarning(90, 100).level).toBe(90);
    expect(requestUsageWarning(100, 100).level).toBe(100);
  });

  it("derives failed, retry and network counters from local logs", () => {
    const now = new Date().toISOString();
    localStorage.setItem("around-dorm-google-request-log-v1", JSON.stringify([
      { id: "a", timestamp: now, requestType: "place_details", status: "success", attempted: 1, retryCount: 0 },
      { id: "b", timestamp: now, requestType: "text_search", status: "failed", attempted: 1, retryCount: 0 },
      { id: "c", timestamp: now, requestType: "place_details", status: "failed", attempted: 1, retryCount: 1 },
    ]));
    const usage = getGoogleRequestUsage();
    expect(usage.failedRequests).toBe(2);
    expect(usage.retries).toBe(1);
    expect(usage.networkAttempts).toBe(3);
    expect(usage.placeDetails).toBe(2);
    expect(usage.textSearch).toBe(1);
  });
});
