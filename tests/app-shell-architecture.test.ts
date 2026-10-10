import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("AroundMyDormApp architecture", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components", "AroundMyDormApp.tsx"), "utf8");

  it("keeps ranking and shell primitives outside the app monolith", () => {
    expect(source).toContain('@/lib/place-ranking');
    expect(source).toContain('@/components/AppShellPrimitives');
    expect(source).not.toContain('function activeFilterCount(');
    expect(source).not.toContain('function PageHeader(');
    expect(source).not.toContain('type AppSettings =');
  });

  it("keeps the client shell below the agreed maintenance ceiling", () => {
    expect(source.split(/\r?\n/).length).toBeLessThan(1000);
  });

  it("code-splits heavyweight user and admin surfaces", () => {
    expect(source).toContain('dynamic(() => import("@/components/ManualGoogleMap")');
    expect(source).toContain('dynamic(() => import("@/components/DataManagement")');
    expect(source).toContain('dynamic(() => import("@/components/SmartCapabilityHub")');
    expect(source).toContain('dynamic(() => import("@/components/PlaceDetail")');
  });

  it("delegates database lifecycle and discovery derivation to V2 core modules", () => {
    expect(source).toContain('@/components/app-shell/usePlaceDatabase');
    expect(source).toContain('@/lib/discovery/derive-visible-places');
    expect(source).not.toContain('async function reloadDatabase()');
    expect(source).not.toContain('filterPlacesInSearchArea(base');
  });
});
