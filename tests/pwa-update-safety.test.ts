import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("PWA update safety", () => {
  const sw = fs.readFileSync("public/sw.js", "utf8");
  const runtime = fs.readFileSync("components/PwaRuntime.tsx", "utf8");

  it("versions caches and removes old cache generations", () => {
    expect(sw).toMatch(/const VERSION = "amd-[^"]+";/);
    expect(fs.readFileSync("scripts/stamp-service-worker.ts", "utf8")).toContain("createHash");
    expect(sw).toContain("caches.delete");
  });

  it("uses network-first navigation so stale pages are not preferred online", () => {
    expect(sw).toContain("request.mode === \"navigate\"");
    expect(sw).toContain("networkFirst(request)");
  });

  it("supports an explicit update handshake instead of silently reloading", () => {
    expect(sw).toContain("SKIP_WAITING");
    expect(runtime).toContain("pwa-update-ready");
    expect(runtime).toContain("controllerchange");
  });

  it("supports push delivery and notification deep links", () => {
    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain('showNotification');
    expect(sw).toContain('addEventListener("notificationclick"');
    expect(sw).toContain('openWindow');
  });

  it("keeps Google provider requests outside service-worker caches", () => {
    expect(sw).toContain('url.hostname.includes("googleapis.com")');
    expect(sw).toContain('url.hostname.includes("gstatic.com")');
  });
});
