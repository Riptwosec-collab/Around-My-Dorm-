import { describe, expect, it } from "vitest";
import fs from "node:fs";

const assets = [
  ["public/apple-touch-icon.png", 180],
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["public/icon-maskable-512.png", 512],
] as const;

describe("Around My Dorm dark reactor PWA artwork", () => {
  it.each(assets)("%s is a real square PNG with the expected dimensions", (path, pixels) => {
    const bytes = fs.readFileSync(path);
    expect(bytes.length).toBeGreaterThan(10000);
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(pixels);
    expect(bytes.readUInt32BE(20)).toBe(pixels);
  });

  it("references the uploaded artwork for Android and the iOS home-screen icon", () => {
    const layout = fs.readFileSync("app/layout.tsx", "utf8");
    const manifest = fs.readFileSync("app/manifest.ts", "utf8");
    expect(layout).toContain("apple-touch-icon.png?v=amd-nova-20261011");
    expect(layout).toContain("icon-512.png?v=amd-nova-20261011");
    expect(manifest).toContain("icon-192.png?v=amd-nova-20261011");
    expect(manifest).toContain("icon-maskable-512.png?v=amd-nova-20261011");
    expect(manifest).toContain('purpose: "maskable"');
  });
});
