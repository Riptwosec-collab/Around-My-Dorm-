import fs from "node:fs";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLACES } from "@/data/places";
import { createPlaceCandidate } from "@/lib/maintenance/place-candidates";
import { buildReviewQueue } from "@/lib/maintenance/review-queue";
import { DORM_CENTER } from "@/lib/place-utils";
import { ReviewQueuePanel } from "@/components/ReviewQueuePanel";

const seed = PLACES[0]!;

afterEach(() => cleanup());

const existing = {
  ...seed,
  id: "existing-cafe",
  slug: "existing-cafe",
  name: "Same Cafe",
  category: "cafe" as const,
  categories: ["cafe" as const],
  latitude: DORM_CENTER.lat + 0.001,
  longitude: DORM_CENTER.lng,
  googlePlaceId: "g-existing",
  phone: "0812345678",
  address: "Ladprao 35",
  source: ["manual"],
};

const duplicate = createPlaceCandidate({
  places: [existing],
  sourceProvider: "approved_import",
  sourceId: null,
  proposedPlace: {
    name: "Same Cafe",
    category: "cafe",
    categories: ["cafe"],
    latitude: DORM_CENTER.lat + 0.0011,
    longitude: DORM_CENTER.lng,
    phone: "0812345678",
    address: "Ladprao 35",
    source: ["approved_import"],
  },
  now: "2026-09-14T03:10:00.000Z",
});

const items = buildReviewQueue({
  places: [existing],
  candidates: [duplicate],
  now: new Date("2026-09-14T04:00:00.000Z").getTime(),
});

describe("ReviewQueuePanel", () => {
  it("shows duplicate evidence and blocks publication until reviewed", () => {
    render(React.createElement(ReviewQueuePanel, {
      items,
      candidates: [duplicate],
      places: [existing],
      language: "th",
      onPublishCandidate: vi.fn(),
      onRejectCandidate: vi.fn(),
      onKeepSeparate: vi.fn(),
      onReviewLater: vi.fn(),
    }));

    expect(screen.getByTestId("review-queue")).toBeInTheDocument();
    expect(screen.getAllByText(/^P1$/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("candidate-publish-blocked")).toBeInTheDocument();
    expect(screen.getAllByText("Same Cafe").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0812345678/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: /Publish|เผยแพร่/i })).toBeDisabled();
  });

  it("filters locally by source without network requests", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(React.createElement(ReviewQueuePanel, {
      items,
      candidates: [duplicate],
      places: [existing],
      language: "en",
      onPublishCandidate: vi.fn(),
      onRejectCandidate: vi.fn(),
      onKeepSeparate: vi.fn(),
      onReviewLater: vi.fn(),
    }));

    fireEvent.change(screen.getByTestId("review-source-filter"), { target: { value: "approved_import" } });
    expect(screen.getByTestId("review-visible-count")).toHaveTextContent("1");
    expect(screen.getByTestId("candidate-publish-blocked")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("routes explicit decisions through callbacks", () => {
    const onRejectCandidate = vi.fn();
    const onKeepSeparate = vi.fn();
    const onReviewLater = vi.fn();
    render(React.createElement(ReviewQueuePanel, {
      items,
      candidates: [duplicate],
      places: [existing],
      language: "en",
      onPublishCandidate: vi.fn(),
      onRejectCandidate,
      onKeepSeparate,
      onReviewLater,
    }));

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep Separate" }));
    fireEvent.click(screen.getByRole("button", { name: "Review Later" }));
    expect(onRejectCandidate).toHaveBeenCalledWith(duplicate.id);
    expect(onKeepSeparate).toHaveBeenCalledWith(duplicate.id);
    expect(onReviewLater).toHaveBeenCalledWith(duplicate.id);
  });

  it("is hosted by the existing admin-only data quality surface", () => {
    const adminSource = fs.readFileSync("components/DataManagement.tsx", "utf8");
    const hostSource = fs.readFileSync("components/DataQualityDashboard.tsx", "utf8");
    expect(adminSource).toContain("<DataQualityDashboard");
    expect(adminSource.indexOf("<DataQualityDashboard")).toBeGreaterThan(adminSource.indexOf("adminAccess.admin"));
    expect(hostSource).toContain('import { ReviewQueuePanel } from "@/components/ReviewQueuePanel";');
    expect(hostSource).toContain("<ReviewQueuePanel");
  });
});