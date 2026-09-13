import { describe, expect, it } from "vitest";
import { PLACES } from "@/data/places";
import { normalizePlace, normalizePlaces } from "@/lib/place-data/normalize-place";

const seed = PLACES[0]!;

describe("place normalization", () => {
  it("keeps the primary category and removes duplicate collection values", () => {
    const source = {
      ...seed,
      category: "cafe" as const,
      categories: ["food" as const, "cafe" as const, "food" as const],
      tags: [" local ", "local", "wifi"],
      images: [" https://img.test/a.jpg ", "https://img.test/a.jpg", ""],
      source: ["seed", " seed ", "manual"],
    };

    const normalized = normalizePlace(source);

    expect(normalized.categories).toEqual(["cafe", "food"]);
    expect(normalized.tags).toEqual(["local", "wifi"]);
    expect(normalized.images).toEqual(["https://img.test/a.jpg"]);
    expect(normalized.source).toEqual(["seed", "manual"]);
    expect(source.images).toHaveLength(3);
  });

  it("turns blank nullable identity/link fields into null without inventing values", () => {
    const normalized = normalizePlace({
      ...seed,
      nameEn: "   ",
      googlePlaceId: "  ",
      googleMapsUrl: " ",
      phone: "   ",
      latitude: null,
      longitude: null,
      walkingMinutes: null,
      drivingMinutes: null,
    });

    expect(normalized.nameEn).toBeNull();
    expect(normalized.googlePlaceId).toBeNull();
    expect(normalized.googleMapsUrl).toBeNull();
    expect(normalized.phone).toBeNull();
    expect(normalized.latitude).toBeNull();
    expect(normalized.walkingMinutes).toBeNull();
    expect(normalized.drivingMinutes).toBeNull();
  });

  it("normalizes arrays without mutating the input array", () => {
    const source = [{ ...seed, tags: ["one", " one "] }];
    const result = normalizePlaces(source);
    expect(result[0]?.tags).toEqual(["one"]);
    expect(source[0]?.tags).toEqual(["one", " one "]);
  });
});
