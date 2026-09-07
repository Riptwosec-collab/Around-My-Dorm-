import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("PWA update safety", () => {
  const sw = fs.readFileSync("public/sw.js", "utf8");
  const runtime = fs.readFileSync("components/PwaRuntime.tsx", "utf8");

  it("versions caches and removes old cache generations", () => {
    expect(sw).toContain('VERSION = "amd-v2.3.0-pwa1"');
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

  it("keeps Google provider requests outside service-worker caches", () => {
    expect(sw).toContain('url.hostname.includes("googleapis.com")');
    expect(sw).toContain('url.hostname.includes("gstatic.com")');
  });
});
