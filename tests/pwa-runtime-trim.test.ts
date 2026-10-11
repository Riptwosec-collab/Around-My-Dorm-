import fs from "node:fs";
import { describe, expect, it } from "vitest";

const file = (name: string) => fs.readFileSync(name, "utf8");
const layout = file("app/layout.tsx");
const app = file("components/AroundMyDormApp.tsx");
const runtime = file("components/PwaRuntime.tsx");
const sw = file("public/sw.js");
const admin = file("components/DataManagement.tsx");
const gps = file("lib/request-precise-location.ts");

describe("PWA clean-and-fast runtime", () => {
  it("does not mount bulky admin photos or mutate browser GPS on startup", () => {
    expect(layout).not.toContain("<GoogleBulkPhotoRuntimeControl");
    expect(layout).not.toContain("PreciseGeolocationRuntime");
    expect(admin).toContain("<GoogleBulkPhotoRuntimeControl inline />");
    expect(gps).toContain("watchPosition");
    expect(gps).toContain("clearWatch");
    expect(app).toContain("requestPreciseLocation()");
  });

  it("shares hydrated language without an extra Supabase settings query", () => {
    expect(runtime).not.toContain("ensureCloudUser");
    expect(runtime).not.toContain('from("amd_user_settings")');
    expect(runtime).toContain("amd-language-changed");
    expect(app).toContain('window.dispatchEvent(new Event("amd-language-changed"))');
  });

  it("only writes changed cloud state and defers advanced hub", () => {
    expect(app).toContain("syncedCollections.current");
    expect(app).toContain("syncedSettings.current");
    expect(app).toContain("syncedNotifications.current");
    expect(app).not.toContain('logRuntimeEventCloud("cloud_state_loaded"');
    expect(app).toContain("advancedToolsOpen && <SmartCapabilityHub");
  });

  it("never stores arbitrary API or query responses in SW runtime caches", () => {
    expect(sw).toContain('url.pathname.startsWith("/_next/static/")');
    expect(sw).toContain("APP_SHELL.includes(url.pathname)");
    expect(sw).toContain("cache.addAll(CORE_SHELL)");
    expect(sw).toContain("event.preloadResponse");
    expect(sw).toContain("!url.search");
    expect(sw).not.toContain("staleWhileRevalidate(request)");
    expect(sw).toContain("SKIP_WAITING");
    expect(sw).toContain('addEventListener("push"');
  });
});
