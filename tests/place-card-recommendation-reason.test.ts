import fs from "node:fs";
import path from "node:path";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlaceCard } from "@/components/PlaceCard";
import { PLACES } from "@/data/places";
import { buildRecommendationReasonLine } from "@/lib/discovery/recommendation-reasons";
import { recommendationReasons } from "@/lib/place-ranking";
import type { Place } from "@/types/place";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

function recommendationPlace(): Place {
  return {
    ...PLACES[0]!,
    id: "explore-reason",
    slug: "explore-reason",
    name: "Explore Reason",
    image: null,
    images: [],
    liveOpenNow: true,
    distanceKm: 0.42,
    placeType: "local",
    localFavorite: true,
    pricing: {
      type: "range",
      min: 50,
      max: 80,
      fixed: null,
      unit: null,
      currency: "THB",
      displayText: null,
      verifiedAt: null,
    },
  };
}

afterEach(() => cleanup());

describe("PlaceCard recommendation reason", () => {
  it("renders an optional explainable reason line", () => {
    const place = recommendationPlace();
    render(React.createElement(PlaceCard, {
      place,
      saved: false,
      onSave: () => undefined,
      onDetail: () => undefined,
      onMap: () => undefined,
      recommendationReason: "เปิดอยู่ • 420 ม. • ฿50–80 • LOCAL",
    }));

    expect(screen.getByTestId("place-recommendation-reason").textContent)
      .toBe("เปิดอยู่ • 420 ม. • ฿50–80 • LOCAL");
  });

  it("promotes the shared known-facts reason line as the first Explore recommendation reason", () => {
    const place = recommendationPlace();
    const context = { now: new Date("2026-09-14T17:00:00+07:00") };
    const line = buildRecommendationReasonLine(place, context, "th");

    expect(recommendationReasons(place, context, "th")[0]).toBe(line);
    expect(line).toBe("เปิดอยู่ • 420 ม. • ฿50–80 • LOCAL");
  });

  it("renders a bullet contextMeta from Explore as the reason line while leaving Recent metadata separate", () => {
    const place = recommendationPlace();
    render(React.createElement(PlaceCard, {
      place,
      saved: false,
      onSave: () => undefined,
      onDetail: () => undefined,
      onMap: () => undefined,
      contextMeta: "เปิดอยู่ • 420 ม. • ฿50–80 • LOCAL",
    }));

    expect(screen.getByTestId("place-recommendation-reason").textContent)
      .toBe("เปิดอยู่ • 420 ม. • ฿50–80 • LOCAL");

    cleanup();
    render(React.createElement(PlaceCard, {
      place,
      saved: false,
      onSave: () => undefined,
      onDetail: () => undefined,
      onMap: () => undefined,
      contextMeta: "วันนี้ 16:40",
    }));

    expect(screen.queryByTestId("place-recommendation-reason")).toBeNull();
    expect(screen.getByText("วันนี้ 16:40")).toBeTruthy();
  });

  it("keeps Explore local-pick wiring local and does not add a recommendation prop to Saved/Recent call sites", () => {
    const app = read("components/AroundMyDormApp.tsx");
    expect(app).toContain("contextMeta={recommendationReasons(place, recommendationContext, settings.language)[0]}");
    expect(app).not.toContain("recommendationReason={buildRecommendationReasonLine");
  });
});
