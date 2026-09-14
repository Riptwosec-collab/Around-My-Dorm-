import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  summarizeGooglePhotoCloudMetadata,
  type GooglePhotoCloudMetadataRow,
} from "@/lib/google-photo-cloud-metadata";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("Google photo cloud metadata", () => {
  it("summarizes the latest persisted photo result per place without storing photo content", () => {
    const rows: GooglePhotoCloudMetadataRow[] = [
      {
        place_id: "place-a",
        google_place_id: "google-a",
        occurred_at: "2026-09-14T08:00:00.000Z",
        status: "success",
        result_code: "photo_loaded",
      },
      {
        place_id: "place-b",
        google_place_id: "google-b",
        occurred_at: "2026-09-14T08:01:00.000Z",
        status: "success",
        result_code: "no_photo",
      },
      {
        place_id: "place-a",
        google_place_id: "google-a",
        occurred_at: "2026-09-14T07:00:00.000Z",
        status: "failed",
        result_code: "failed",
      },
    ];

    expect(summarizeGooglePhotoCloudMetadata(rows)).toEqual({
      savedPlaceIds: ["place-a"],
      savedCount: 1,
      noPhotoCount: 1,
      failedCount: 0,
      lastSavedAt: "2026-09-14T08:01:00.000Z",
    });
  });

  it("loads persisted metadata in the manual Google Photos control and records a result code", () => {
    const control = read("components/GoogleBulkPhotoRuntimeControl.tsx");
    const budget = read("lib/google-api-budget.ts");
    const schema = read("supabase/schema.sql");

    expect(control).toContain("loadGooglePhotoCloudMetadata");
    expect(control).toContain("resultCode:");
    expect(control).toContain("Cloud metadata");
    expect(budget).toContain("resultCode?:");
    expect(schema).toContain("result_code text");
  });

  it("does not add persistent Google photo URI, photo name, or binary fields", () => {
    const schema = read("supabase/schema.sql");
    const cloudMetadata = read("lib/google-photo-cloud-metadata.ts");

    expect(schema).not.toContain("google_photo_uri");
    expect(schema).not.toContain("google_photo_name");
    expect(cloudMetadata).not.toContain("photoUri");
    expect(cloudMetadata).not.toContain("photoName");
    expect(cloudMetadata).not.toContain("Blob");
  });
});
