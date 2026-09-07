import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

describe("Google request architecture guard", () => {
  it("keeps low-level Google Places network functions behind the request manager", () => {
    const candidates = [...walk("components"), ...walk("lib")].filter((file) => /\.(ts|tsx)$/.test(file));
    const allowed = new Set([path.normalize("lib/google-live.ts"), path.normalize("lib/google-request-manager.ts")]);
    for (const file of candidates) {
      if (allowed.has(path.normalize(file))) continue;
      const source = fs.readFileSync(file, "utf8");
      expect(source, `${file} bypasses Google request manager`).not.toMatch(/\b(discoverGooglePlaces|fetchGoogleLiveDetails)\s*\(/);
    }
  });
});
