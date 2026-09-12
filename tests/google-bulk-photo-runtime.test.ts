import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("bulk transient Google place photos", () => {
  const dataManagement = read("components/DataManagement.tsx");
  const placePhoto = read("components/PlacePhoto.tsx");
  const googleLive = read("lib/google-live.ts");
  const cloudEnrichment = read("lib/google-cloud-enrichment.ts");

  it("exposes an explicit admin bulk photo loader instead of background photo requests", () => {
    expect(dataManagement).toContain('GoogleBulkPhotoLoader');
    expect(dataManagement).toContain('<GoogleBulkPhotoLoader');
  });

  it("lets normal PlacePhoto cards consume the transient runtime photo store", () => {
    expect(placePhoto).toContain('GOOGLE_PHOTO_RUNTIME_CHANGED_EVENT');
    expect(placePhoto).toContain('getGoogleRuntimePhoto');
  });

  it("reuses a photo already returned by an explicitly requested Place Details call", () => {
    expect(googleLive).toContain('transientPhoto');
    expect(cloudEnrichment).toContain('setGoogleRuntimePhoto');
  });

  it("does not persist Google photo URIs through the shared cloud payload", () => {
    const sanitizerStart = cloudEnrichment.indexOf('export function sanitizeGoogleLiveDetails');
    const sanitizerEnd = cloudEnrichment.indexOf('function googleProvenance', sanitizerStart);
    const sanitizer = cloudEnrichment.slice(sanitizerStart, sanitizerEnd);
    expect(sanitizer).not.toContain('photoUrl:');
    expect(sanitizer).not.toContain('transientPhoto:');
  });
});
