import { describe, expect, it } from "vitest";
import { mapGooglePhoto } from "@/lib/google-transient-photo";

describe("Google transient photo", () => {
  it("returns fresh display URL with Google/author attribution metadata without creating a cache record", () => {
    const photo = {
      widthPx: 1600,
      heightPx: 900,
      googleMapsURI: "https://maps.google.com/photo/1",
      flagContentURI: "https://maps.google.com/report/1",
      authorAttributions: [{ displayName: "Local Guide", uri: "https://maps.google.com/contrib/1", photoURI: "https://maps.google.com/photo/author" }],
      getURI: () => "https://lh3.googleusercontent.com/fresh-photo",
    };
    const result = mapGooglePhoto(photo);
    expect(result?.url).toContain("googleusercontent.com");
    expect(result?.googleMapsUrl).toBe(photo.googleMapsURI);
    expect(result?.flagContentUrl).toBe(photo.flagContentURI);
    expect(result?.authorAttributions[0].displayName).toBe("Local Guide");
    expect(result?.width).toBe(1600);
  });

  it("returns null when Google does not provide a usable photo URI", () => {
    expect(mapGooglePhoto({ getURI: () => "" })).toBeNull();
  });
});