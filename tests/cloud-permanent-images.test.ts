import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import {
  cloudPermanentImageToPlaceImage,
  mergePermanentImagesIntoPlaces,
  validatePermanentImageMetadata,
  type CloudPermanentImageRow,
} from "@/lib/cloud/place-image-model";
import { getPlaceImageCandidates } from "@/lib/place-images";

const seed = PLACES[0]!;
const row: CloudPermanentImageRow = {
  id: "11111111-1111-4111-8111-111111111111",
  place_id: seed.id,
  source: "admin_upload",
  source_reference: null,
  source_url: "https://around.example/source",
  attribution: "Around My Dorm",
  width: 1200,
  height: 800,
  verified: true,
  last_checked: "2026-09-15T07:00:00.000Z",
  created_at: "2026-09-15T07:00:00.000Z",
  storage_bucket: "amd-place-images",
  storage_path: `${seed.id}/11111111-1111-4111-8111-111111111111.webp`,
  rights_basis: "Owned by Around My Dorm",
  mime_type: "image/webp",
  byte_size: 2048,
  is_cover: true,
  status: "active",
  created_by: "22222222-2222-4222-8222-222222222222",
  updated_at: "2026-09-15T07:00:00.000Z",
};

describe("Cloud permanent place images", () => {
  it("ranks a Cloud cover before every other persisted candidate", () => {
    const place = {
      ...seed,
      imageMetadata: [
        { url: "https://official.test/a.jpg", source: "official_website" as const, verified: true },
        { url: "https://cloud.test/cover.webp", source: "cloud_storage" as const, verified: true, isCover: true },
      ],
    };
    expect(getPlaceImageCandidates(place)[0]?.url).toBe("https://cloud.test/cover.webp");
  });

  it("merges Cloud rows only into their matching place", () => {
    const merged = mergePermanentImagesIntoPlaces(
      [seed, { ...seed, id: "other" }],
      [row],
      () => "https://cloud.test/a.webp",
    );
    expect(merged[0]?.imageMetadata?.some((image) => image.source === "cloud_storage")).toBe(true);
    expect(merged[1]?.imageMetadata?.some((image) => image.source === "cloud_storage")).toBe(false);
  });

  it("rejects Google-backed metadata from the permanent path", () => {
    expect(() => validatePermanentImageMetadata({
      source: "google_places" as any,
      rightsBasis: "copied",
      sourceUrl: "https://places.googleapis.com/v1/x/media",
    })).toThrow();
  });

  it("recreates the same Cloud image candidate from the same persisted row", () => {
    const first = cloudPermanentImageToPlaceImage(row, "https://cloud.test/a.webp");
    const reopened = cloudPermanentImageToPlaceImage(row, "https://cloud.test/a.webp");
    expect(reopened).toEqual(first);
  });
});
