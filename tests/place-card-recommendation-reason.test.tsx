import fs from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlaceCard } from "@/components/PlaceCard";
import { PLACES } from "@/data/places";

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

afterEach(() => cleanup());

describe("PlaceCard recommendation reason", () => {
  it("renders an optional explainable reason line", () => {
    const place = { ...PLACES[0]!, image: null, images: [] };
    render(
      <PlaceCard
        place={place}
        saved={false}
        onSave={() => undefined}
        onDetail={() => undefined}
        onMap={() => undefined}
        recommendationReason="เปิดอยู่ • 420 ม. • ฿50–80 • LOCAL"
      />,
    );

    expect(screen.getByTestId("place-recommendation-reason").textContent)
      .toBe("เปิดอยู่ • 420 ม. • ฿50–80 • LOCAL");
  });

  it("wires the shared reason builder into Explore cards without forcing it into Saved/Recent props", () => {
    const app = read("components/AroundMyDormApp.tsx");
    expect(app).toContain("buildRecommendationReasonLine");
    expect(app).toContain("recommendationReason={buildRecommendationReasonLine(place, recommendationContext, settings.language)}");
  });
});
