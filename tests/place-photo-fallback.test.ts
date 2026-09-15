import React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlacePhoto } from "@/components/PlacePhoto";
import { PLACES } from "@/data/places";
import { clearGoogleRuntimePhotos, setGoogleRuntimePhoto } from "@/lib/google-photo-runtime";

const seed = PLACES[0]!;
const cloudUrl = "https://cloud.test/cover.webp";
const seedUrl = "https://seed.test/fallback.webp";
const googleUrl = "https://maps.googleapis.com/runtime-only.webp";

function testPlace() {
  return {
    ...seed,
    image: null,
    coverImage: null,
    images: [],
    galleryImages: [],
    imageMetadata: [
      { url: cloudUrl, source: "cloud_storage" as const, verified: true, isCover: true },
      { url: seedUrl, source: "seed" as const, verified: true },
    ],
  };
}

afterEach(() => {
  cleanup();
  clearGoogleRuntimePhotos();
});

describe("PlacePhoto candidate fallback chain", () => {
  it("falls from a failed Cloud permanent image to the next persisted image", async () => {
    const { container } = render(React.createElement(PlacePhoto, { place: testPlace() }));
    const image = () => container.querySelector("img") as HTMLImageElement | null;

    expect(image()?.getAttribute("src")).toBe(cloudUrl);
    fireEvent.error(image()!);
    await waitFor(() => expect(image()?.getAttribute("src")).toBe(seedUrl));
  });

  it("uses an already-loaded Google runtime photo only after every persisted candidate fails", async () => {
    setGoogleRuntimePhoto(seed.id, "google-place-a", {
      url: googleUrl,
      googleMapsUrl: "https://maps.google.com/?cid=1",
      flagContentUrl: null,
      authorAttributions: [{ displayName: "Google contributor", uri: null, photoUri: null }],
      width: 1200,
      height: 900,
      fetchedAt: "2026-09-15T08:00:00.000Z",
    });

    const { container } = render(React.createElement(PlacePhoto, { place: testPlace() }));
    const image = () => container.querySelector("img") as HTMLImageElement | null;

    expect(image()?.getAttribute("src")).toBe(cloudUrl);
    fireEvent.error(image()!);
    await waitFor(() => expect(image()?.getAttribute("src")).toBe(seedUrl));
    fireEvent.error(image()!);
    await waitFor(() => expect(image()?.getAttribute("src")).toBe(googleUrl));
  });
});
