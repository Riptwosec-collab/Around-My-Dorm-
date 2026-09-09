import { describe, expect, it } from "vitest";
import fs from "node:fs";
describe("cloud-only Google control persistence", () => {
  it("keeps Google control, request logs and live cache out of Web Storage", () => {
    for (const file of ["lib/google-api-control.ts", "lib/google-request-manager.ts", "lib/google-live.ts"]) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).not.toContain("localStorage");
      expect(source, file).not.toContain("sessionStorage");
    }
  });
  it("fails closed before cloud safety policy hydration", () => {
    const source = fs.readFileSync("lib/google-api-control.ts", "utf8");
    expect(source).toContain("locked: true");
    expect(source).toContain("amd_google_api_control");
    expect(fs.readFileSync("lib/google-request-manager.ts", "utf8")).toContain("amd_google_request_logs");
  });
});
