import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("lib/cloud/place-reports.ts", "utf8");

describe("place report cloud boundary", () => {
  it("submits and loads public warnings only through RPCs", () => {
    expect(source).toContain('supabase.rpc("amd_submit_place_report"');
    expect(source).toContain('supabase.rpc("amd_place_report_warning"');
    expect(source).not.toMatch(/submitPlaceReport[\s\S]*?\.from\("amd_place_reports"\)\.insert/);
  });

  it("uses admin RPC for workflow transitions", () => {
    expect(source).toContain('supabase.rpc("amd_admin_transition_place_report"');
  });

  it("derives a reporting-only fingerprint from the authenticated cloud user", () => {
    expect(source).toContain("ensureCloudUser");
    expect(source).toContain('amd-report:');
    expect(source).toContain("crypto.subtle.digest");
  });

  it("defines the approved stable report enums", () => {
    for (const type of ["closed", "opening_hours", "price", "moved", "parking", "phone", "location", "other"]) {
      expect(source).toContain(`\"${type}\"`);
    }
  });
});
