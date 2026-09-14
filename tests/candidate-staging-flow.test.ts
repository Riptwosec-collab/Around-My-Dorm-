import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Phase 2A candidate staging flow", () => {
  const dataManagement = fs.readFileSync("components/DataManagement.tsx", "utf8");
  const googleSheet = fs.readFileSync("components/GoogleDiscoverySheet.tsx", "utf8");

  it("loads staged candidates only in the admin maintenance flow", () => {
    const adminGuardIndex = dataManagement.indexOf("if (!adminAccess.admin)");
    const adminCandidateLoadIndex = dataManagement.indexOf(
      'loadPlaceCandidates(["new", "needs_review"])',
      adminGuardIndex,
    );

    expect(adminGuardIndex).toBeGreaterThan(-1);
    expect(dataManagement).toContain("setStagedCandidates([])");
    expect(adminCandidateLoadIndex).toBeGreaterThan(adminGuardIndex);
  });

  it("stages approved-import new places instead of publishing during import review", () => {
    expect(dataManagement).toContain("candidateFromImport");
    expect(dataManagement).toContain("upsertPlaceCandidates");
    expect(dataManagement).not.toContain("async function addCandidate(item: NewPlaceCandidate");
  });

  it("stages explicit Google discovery results before any canonical write", () => {
    expect(googleSheet).toContain("onStageCandidate");
    expect(dataManagement).toContain("candidateFromGoogle");
    expect(dataManagement).toContain("upsertPlaceCandidate");
    expect(dataManagement).toContain("onStageCandidate={stageGoogleCandidate}");
  });
});
