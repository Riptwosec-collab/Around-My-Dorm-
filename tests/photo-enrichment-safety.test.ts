import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("one-time real photo enrichment safety", () => {
  const enrich = fs.readFileSync("scripts/enrich-existing-place-images.ts", "utf8");
  const estimate = fs.readFileSync("scripts/estimate-image-enrichment.ts", "utf8");
  const workflow = fs.readFileSync(".github/workflows/enrich-existing-place-images.yml", "utf8");

  it("keeps preview completely network-free", () => {
    expect(estimate).not.toContain("fetch(");
    expect(estimate).toContain("networkRequestsSentByThisEstimator: 0");
  });

  it("enforces a hard request budget before enrichment", () => {
    expect(enrich).toContain("MAX_IMAGE_ENRICH_REQUESTS");
    expect(enrich).toContain("estimate.total > MAX_REQUESTS");
    expect(workflow).toContain("inputs.mode == 'run'");
  });

  it("re-checks identity and protects chain branches before attaching photos", () => {
    expect(enrich).toContain("identitySafe(seed, candidate)");
    expect(enrich).toContain("isChain(seed)");
    expect(enrich).toContain("distance > 0.25");
    expect(enrich).toContain("SKIP uncertain identity/branch");
  });

  it("stores stable photo references and deduplicates them", () => {
    expect(enrich).toContain("photoReference: photo.name");
    expect(enrich).toContain("seen.has(photo.name)");
    expect(enrich).not.toContain("&key=${API_KEY}");
  });
});
