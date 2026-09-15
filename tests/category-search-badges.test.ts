import fs from "node:fs";
import path from "node:path";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlaceCard } from "@/components/PlaceCard";
import { PLACES } from "@/data/places";
import { parseDiscoveryQuery } from "@/lib/discovery/query-intent";
import { normalizePlace } from "@/lib/place-data/normalize-place";
import type { Place } from "@/types/place";

const seed = PLACES[0]!;

afterEach(() => cleanup());

describe("category badges and category search", () => {
  it("recognizes the wider category vocabulary used around the dorm", () => {
    expect(parseDiscoveryQuery("ร้านขายยา").categoryIds).toEqual(["pharmacy"]);
    expect(parseDiscoveryQuery("ซักผ้า").categoryIds).toEqual(["laundry"]);
    expect(parseDiscoveryQuery("ฟิตเนส").categoryIds).toEqual(["fitness"]);
    expect(parseDiscoveryQuery("ร้านตัดผม").categoryIds).toEqual(["barber"]);
    expect(parseDiscoveryQuery("ซูเปอร์มาร์เก็ต").categoryIds).toEqual(["supermarket"]);
    expect(parseDiscoveryQuery("ตลาด").categoryIds).toEqual(["market"]);
    expect(parseDiscoveryQuery("ที่จอดรายเดือน").categoryIds).toEqual(["monthly_parking"]);
  });

  it("adds only categories that are explicitly supported by place text", () => {
    const normalized = normalizePlace({
      ...seed,
      category: "food",
      categories: ["food"],
      subcategory: "อาหารตามสั่ง / ก๋วยเตี๋ยว",
      shortDescription: "อาหารจานเดียวและก๋วยเตี๋ยว",
      tags: ["Local", "อาหารตามสั่ง"],
    } as Place);

    expect(normalized.categories).toEqual(expect.arrayContaining(["food", "local_food", "noodle"]));
  });

  it("shows the primary and secondary categories on each place card", () => {
    const place: Place = {
      ...seed,
      id: "category-badge-place",
      slug: "category-badge-place",
      name: "Category Badge Place",
      category: "cafe",
      categories: ["cafe", "food"],
      image: null,
      images: [],
    };

    render(React.createElement(PlaceCard, {
      place,
      saved: false,
      onSave: () => undefined,
      onDetail: () => undefined,
      onMap: () => undefined,
      language: "th",
    }));

    const badges = screen.getByTestId("place-category-badges");
    expect(badges.textContent).toContain("คาเฟ่");
    expect(badges.textContent).toContain("อาหาร");
  });

  it("renders a dedicated category search bar below the main search field", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "components/SearchAssistPanel.tsx"), "utf8");
    expect(source).toContain('data-testid="category-search-bar"');
    expect(source).toContain("CATEGORIES.filter((item) => item.id !== \"all\")");
  });
});
