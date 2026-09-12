import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as any).React = React;

const { runGoogleCloudAutoEnrichment } = vi.hoisted(() => ({
  runGoogleCloudAutoEnrichment: vi.fn(),
}));

vi.mock("@/lib/google-cloud-enrichment", () => ({
  GOOGLE_BULK_RUN_REQUEST_LIMIT: 180,
  GOOGLE_CLOUD_CACHE_TTL_DAYS: 29,
  loadGoogleCloudEnrichmentStatus: vi.fn(async () => ({
    total: 1,
    linked: 0,
    freshCache: 0,
    review: 0,
    estimatedMaxRequests: 2,
    lastFetchedAt: null,
  })),
  runGoogleCloudAutoEnrichment,
}));

import { GoogleCloudAutoEnrichment } from "@/components/GoogleCloudAutoEnrichment";

const place = {
  id: "test-place",
  name: "Test Place",
  slug: "test-place",
  categories: ["food"],
} as any;

describe("GoogleCloudAutoEnrichment cancel guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runGoogleCloudAutoEnrichment.mockImplementation(async ({ isCancelled, onProgress }: any) => {
      onProgress?.({ current: 0, total: 1, currentName: "Test Place", networkRequests: 0, linked: 0, cached: 0, review: 0, failed: 0, lastError: null });
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        current: 0,
        total: 1,
        currentName: null,
        networkRequests: 0,
        linked: 0,
        cached: 0,
        review: 0,
        failed: 0,
        lastError: null,
        cancelled: Boolean(isCancelled?.()),
        stoppedByLimit: false,
        stoppedBySystemicError: false,
        stoppedReason: null,
      };
    });
  });

  it("does not cancel on the first click and requires an explicit confirmation", async () => {
    render(React.createElement(GoogleCloudAutoEnrichment, { places: [place], language: "en", onReload: () => {} }));

    fireEvent.click(await screen.findByRole("button", { name: /enrich all 1 shops/i }));
    fireEvent.click(screen.getByRole("button", { name: /send google requests/i }));

    const cancelButton = await screen.findByRole("button", { name: /cancel after current request/i });
    fireEvent.click(cancelButton);

    expect(screen.getByRole("button", { name: /confirm cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep running/i })).toBeInTheDocument();
  });
});
